import {
  buildConnectParams,
  buildRequest,
  createRequestIdGenerator,
  isConnectChallenge,
  isEventFrame,
  isResponseFrame,
  parseMessage,
} from "./protocol";
import { canTransitionConnectionState } from "./state-machine";
import type {
  ConnectionState,
  EventFrame,
  GatewayClientOptions,
  HelloOk,
  ResponseFrame,
  Snapshot,
} from "./types";

/**
 * Verify the gateway challenge nonce and enforce loopback-only operation.
 *
 * clawsprawl connects device-less (no `device` block, `client.id: 'gateway-client'`,
 * shared-token loopback trust path). The modern gateway requires nonce signing for
 * any device-bearing client; device-less operator connects are only trusted on
 * loopback (or via `trusted-proxy` / `allowInsecureAuth`). A non-loopback `wss://`
 * gateway without device identity will clear scopes to empty and silently fail
 * scope-gated RPCs/events.
 *
 * This guard fails fast on non-loopback URLs so operators get a clear error instead
 * of a silently-broken dashboard. Remote `wss://` support requires implementing
 * device identity + v3 nonce signing (see roadmap).
 *
 * @param _nonce - The nonce string received in the connect.challenge event (unused
 *   until device-auth is implemented).
 * @param gatewayUrl - The gateway URL to check for loopback trust.
 * @returns `true` if the gateway URL is loopback; throws on non-loopback without device identity.
 */
export function verifyGatewayNonce(
  _nonce: string,
  gatewayUrl?: string,
): boolean {
  if (!gatewayUrl) return true;
  try {
    const parsed = new URL(gatewayUrl);
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const isLoopback =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1";
    if (!isLoopback) {
      throw new Error(
        `Non-loopback gateway URL (${host}) requires device identity + nonce signing. ` +
          "clawsprawl currently supports loopback-only operation. " +
          "See docs/architecture-overview.md and roadmap for remote gateway support.",
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("Non-loopback")) throw err;
    // Malformed URL — let the WebSocket connect fail naturally
  }
  return true;
}

/** Callback invoked whenever the connection state changes. */
type StateListener = (state: ConnectionState) => void;

/**
 * Build a pre-handshake failure error the reconnect path can act on.
 *
 * Gateway upgrade failures (HTTP 5xx, connection refused) are transient, so
 * they carry `retryable: true` + `code: 'GATEWAY_UNAVAILABLE'` — mirroring the
 * retryable/retryAfterMs metadata surfaced on failed RPC responses.
 */
function gatewayUnavailableError(
  message: string,
  retryAfterMs?: number,
): Error & { retryable: true; code: string; retryAfterMs?: number } {
  const err = new Error(message) as Error & {
    retryable: true;
    code: string;
    retryAfterMs?: number;
  };
  err.retryable = true;
  err.code = "GATEWAY_UNAVAILABLE";
  if (typeof retryAfterMs === "number") err.retryAfterMs = retryAfterMs;
  return err;
}

/**
 * Is a pre-handshake socket `error` cause plausibly transient (worth retrying)?
 * Node surfaces `ECONNREFUSED`/`ETIMEDOUT` etc. on the error object; browsers do not.
 */
function isRetryableSocketError(cause: unknown): boolean {
  const code =
    cause && typeof cause === "object"
      ? (cause as { code?: unknown }).code
      : undefined;
  return (
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN"
  );
}

/** Callback invoked for each gateway event frame received. */
type GatewayEventListener = (event: EventFrame) => void;

/** Tracks an in-flight RPC request awaiting its response frame. */
interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * GatewayClient speaks the native OpenClaw WebSocket protocol (v4).
 *
 * Connection lifecycle:
 *   1. Open WebSocket to gateway URL
 *   2. Gateway sends `connect.challenge` event with `{ nonce, ts }`
 *   3. Client sends `connect` request with ConnectParams (auth, identity, scopes)
 *   4. Gateway responds with HelloOk (snapshot, features, policy) or error
 *   5. Steady state: client sends RequestFrames, gateway replies with ResponseFrames
 *      and pushes EventFrames (tick, health, presence, agent, session.message, etc.)
 *
 * Protocol v4 introduces chat-delta semantics (`deltaText`, `replace` flag); this
 * client parses frames generically and leaves delta rendering to the dashboard layer.
 */
export class GatewayClient {
  private readonly options: Required<
    Pick<
      GatewayClientOptions,
      | "reconnect"
      | "minReconnectDelayMs"
      | "maxReconnectDelayMs"
      | "connectTimeoutMs"
      | "rpcTimeoutMs"
    >
  > &
    GatewayClientOptions;

  private socket: WebSocket | null = null;
  private state: ConnectionState = "idle";
  private reconnectEnabled = false;
  private reconnectDelayMs: number;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 20;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stateListeners = new Set<StateListener>();
  private eventListeners = new Set<GatewayEventListener>();
  private pending = new Map<string, PendingRequest>();
  private activeConnectUrl: string;
  private connectInFlight: Promise<HelloOk> | null = null;
  private requestIdGenerator = createRequestIdGenerator();
  private primaryRetryTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly PRIMARY_RETRY_INTERVAL_MS = 60_000;

  /** Populated after a successful handshake. */
  private _helloOk: HelloOk | null = null;

  /** Gateway-advertised policy limits (from hello-ok). */
  private _policy: {
    tickIntervalMs: number;
    maxPayload: number;
    maxBufferedBytes: number;
  } | null = null;

  /** Count of non-string (compressed/binary) WebSocket frames ignored this session. */
  private _nonStringFrameCount = 0;

  /** Guards the one-time non-string frame warning so it logs once per client. */
  private nonStringFrameWarned = false;

  constructor(options: GatewayClientOptions) {
    this.options = {
      reconnect: true,
      minReconnectDelayMs: 800,
      maxReconnectDelayMs: 30_000,
      connectTimeoutMs: 10_000,
      rpcTimeoutMs: 30_000,
      ...options,
    };
    this.reconnectDelayMs = this.options.minReconnectDelayMs;
    this.activeConnectUrl = this.options.url;
  }

  // --- Public accessors ---

  /** Current WebSocket connection state. */
  get connectionState(): ConnectionState {
    return this.state;
  }

  /** The HelloOk payload from the last successful handshake, or null. */
  get helloOk(): HelloOk | null {
    return this._helloOk;
  }

  /** Convenience: snapshot from the last successful handshake. */
  get snapshot(): Snapshot | null {
    return this._helloOk?.snapshot ?? null;
  }

  /** List of methods the gateway advertised in HelloOk. */
  get availableMethods(): string[] {
    return this._helloOk?.features?.methods ?? [];
  }

  /** Gateway-advertised policy limits (tickIntervalMs, maxPayload, maxBufferedBytes). */
  get policy(): {
    tickIntervalMs: number;
    maxPayload: number;
    maxBufferedBytes: number;
  } | null {
    return this._policy;
  }

  /**
   * Number of non-string WebSocket frames ignored (compressed or binary).
   * A non-zero value means the gateway negotiated a compression extension we
   * cannot decode; frames are dropped rather than parsed as text.
   */
  get nonStringFrameCount(): number {
    return this._nonStringFrameCount;
  }

  // --- Connection lifecycle ---

  /**
   * Open a WebSocket to the gateway and complete the challenge-response
   * handshake. Resolves with the {@link HelloOk} payload on success.
   * Falls back to `fallbackUrl` if the primary URL fails.
   *
   * @returns A promise that resolves with the {@link HelloOk} handshake payload.
   */
  async connect(): Promise<HelloOk> {
    if (this.connectInFlight) return this.connectInFlight;

    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      if (this._helloOk) {
        return this._helloOk;
      }
    }

    this.setState(this.state === "idle" ? "connecting" : "reconnecting");

    this.connectInFlight = this.openSocketWithFallback();
    try {
      return await this.connectInFlight;
    } finally {
      this.connectInFlight = null;
    }
  }

  private async openSocketWithFallback(): Promise<HelloOk> {
    try {
      return await this.openSocket(this.activeConnectUrl);
    } catch (err) {
      if (
        !this.options.fallbackUrl ||
        this.activeConnectUrl === this.options.fallbackUrl
      ) {
        throw err;
      }
      this.activeConnectUrl = this.options.fallbackUrl;
      return this.openSocket(this.activeConnectUrl);
    }
  }

  /**
   * Close the socket, reject pending requests, and disable auto-reconnect.
   *
   * @returns void
   */
  disconnect(): void {
    this.reconnectEnabled = false;
    this._helloOk = null;
    this.clearPending(new Error("Disconnected"));
    this.clearPrimaryRetry();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;
      this.socket.close();
      this.socket = null;
    }
    this.setState("disconnected");
  }

  // --- Subscriptions ---

  /**
   * Subscribe to connection state changes. Returns an unsubscribe function.
   *
   * @param listener - Callback invoked with the new {@link ConnectionState} on each transition.
   * @returns An unsubscribe function that removes the listener.
   */
  onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  /**
   * Subscribe to gateway event frames. Returns an unsubscribe function.
   *
   * @param listener - Callback invoked for each received {@link EventFrame}.
   * @returns An unsubscribe function that removes the listener.
   */
  onEvent(listener: GatewayEventListener): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  // --- RPC calls ---

  /**
   * Send an RPC request and await the response payload. Rejects on timeout or error.
   *
   * @param method - RPC method name to invoke on the gateway.
   * @param params - Optional key-value parameters for the request.
   * @returns A promise that resolves with the response payload typed as `TResult`.
   */
  async call<TResult = unknown>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<TResult> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Socket is not connected");
    }

    const request = buildRequest(method, params, this.requestIdGenerator);
    const payload = JSON.stringify(request);

    return new Promise<TResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new Error(`RPC timeout: ${method}`));
      }, this.options.rpcTimeoutMs);

      const entry: PendingRequest = {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      };
      this.pending.set(request.id, entry);

      try {
        this.socket?.send(payload);
      } catch (err) {
        clearTimeout(timeout);
        this.pending.delete(request.id);
        entry.reject(
          err instanceof Error ? err : new Error("ws.send() failed"),
        );
      }
    });
  }

  // --- Internal: socket management ---

  private openSocket(targetUrl: string): Promise<HelloOk> {
    const wsOptions: Record<string, unknown> = {};
    if (this.options.origin) {
      wsOptions.headers = { Origin: this.options.origin };
    }
    let ws: WebSocket;
    if (Object.keys(wsOptions).length > 0) {
      // SAFETY: Node's undici WebSocket accepts an options object (headers/dispatcher)
      // as its second argument, but the DOM lib types that slot as protocols only.
      const socketOptions = wsOptions as unknown as ConstructorParameters<
        typeof WebSocket
      >[1];
      ws = new WebSocket(targetUrl, socketOptions);
    } else {
      ws = new WebSocket(targetUrl);
    }
    this.socket = ws;

    return new Promise<HelloOk>((resolve, reject) => {
      let handshakeComplete = false;

      const timeout = setTimeout(() => {
        if (!handshakeComplete) {
          ws.close();
          reject(new Error("Connection timed out"));
        }
      }, this.options.connectTimeoutMs);

      // The `ws` package (Node) emits 'unexpected-response' with the HTTP
      // response when the upgrade fails (e.g. 503 Service Unavailable). The
      // standard WebSocket API has no equivalent, so fall back to onerror below.
      // SAFETY: Node's `ws` package exposes EventEmitter `.on()`; the DOM
      // WebSocket type does not, so probe for it at runtime.
      const emitter = ws as unknown as {
        on?: (event: string, listener: (...args: unknown[]) => void) => void;
      };
      if (typeof emitter.on === "function") {
        emitter.on("unexpected-response", (...args: unknown[]) => {
          if (handshakeComplete) return;
          const res = args[1] as
            | { statusCode?: number; statusMessage?: string }
            | undefined;
          const status = res?.statusCode ?? 0;
          clearTimeout(timeout);
          // 5xx upgrade failures are transient (gateway starting/restarting).
          // Other statuses are auth/misconfig failures — keep them non-retryable
          // and report the generic socket error (as the absent-listener path did).
          if (status >= 500) {
            reject(
              gatewayUnavailableError(
                `Gateway unavailable during handshake (HTTP ${status}${res?.statusMessage ? ` ${res.statusMessage}` : ""})`,
              ),
            );
          } else {
            reject(new Error("Socket error"));
          }
        });
      }

      ws.onopen = () => {
        this.setState("handshaking");
      };

      ws.onerror = (event?: unknown) => {
        if (!handshakeComplete) {
          clearTimeout(timeout);
          const cause = (event as { error?: unknown })?.error ?? event;
          // Without an HTTP response (runtimes with no 'unexpected-response'
          // support) a pre-handshake error is treated as potentially transient:
          // connection-refused and DNS failures are indistinguishable here.
          reject(
            isRetryableSocketError(cause) || typeof emitter.on !== "function"
              ? gatewayUnavailableError("Socket error")
              : new Error("Socket error"),
          );
        }
      };

      ws.onclose = () => {
        this.socket = null;
        if (!handshakeComplete) {
          clearTimeout(timeout);
          // A dropped upgrade is retryable when the caller opted into reconnect.
          reject(
            this.options.reconnect
              ? gatewayUnavailableError("Socket closed during handshake")
              : new Error("Socket closed during handshake"),
          );
        } else {
          this.setState("disconnected");
          this.clearPending(new Error("Socket closed"));
          if (this.reconnectEnabled) {
            this.scheduleReconnect();
          }
        }
      };

      ws.onmessage = (message) => {
        if (typeof message.data !== "string") {
          this._nonStringFrameCount += 1;
          if (!this.nonStringFrameWarned) {
            this.nonStringFrameWarned = true;
            console.warn(
              "[clawsprawl:client] received non-string WebSocket frame (compressed or binary); frame ignored",
            );
          }
          return;
        }
        const frame = parseMessage(message.data);
        if (!frame) return;

        if (!handshakeComplete) {
          // During handshake, handle challenge + hello-ok
          this.handleHandshakeMessage(
            frame,
            ws,
            (helloOk) => {
              handshakeComplete = true;
              clearTimeout(timeout);
              this._helloOk = helloOk;
              if (helloOk.policy) {
                this._policy = {
                  tickIntervalMs: helloOk.policy.tickIntervalMs ?? 15_000,
                  maxPayload: helloOk.policy.maxPayload ?? 26_214_400,
                  maxBufferedBytes:
                    helloOk.policy.maxBufferedBytes ?? 52_428_800,
                };
              }
              this.setState("connected");
              this.reconnectEnabled = this.options.reconnect;
              this.reconnectAttempts = 0;
              this.reconnectDelayMs = this.options.minReconnectDelayMs;
              this.schedulePrimaryRetry();
              resolve(helloOk);
            },
            (err) => {
              handshakeComplete = true;
              clearTimeout(timeout);
              ws.close();
              reject(err);
            },
          );
        } else {
          // Steady state
          this.handleMessage(frame);
        }
      };
    });
  }

  private handleHandshakeMessage(
    frame: ReturnType<typeof parseMessage>,
    ws: WebSocket,
    onSuccess: (helloOk: HelloOk) => void,
    onError: (err: Error) => void,
  ): void {
    if (!frame) return;

    // Step 1: Gateway sends connect.challenge
    if (isConnectChallenge(frame)) {
      const nonce = frame.payload?.nonce ?? "";
      // v2026.8.1+ gateways issue `{ nonce, ts }` and require the signature to
      // use `ts` as signedAt; older servers omit it (fall back to the local clock).
      const challengeTs =
        typeof frame.payload?.ts === "number" ? frame.payload.ts : undefined;
      if (!verifyGatewayNonce(nonce, this.options.url)) {
        onError(new Error("Gateway nonce verification failed"));
        return;
      }
      const connectParams = buildConnectParams(
        this.options,
        nonce,
        challengeTs,
      );
      const connectReq = buildRequest(
        "connect",
        connectParams,
        this.requestIdGenerator,
      );

      // Store pending so we can match the response
      this.pending.set(connectReq.id, {
        resolve: (payload) => {
          if (
            typeof payload !== "object" ||
            payload === null ||
            (payload as Record<string, unknown>).type !== "hello-ok"
          ) {
            onError(new Error("Invalid HelloOk response from gateway"));
            return;
          }
          const helloOk = payload as HelloOk;
          onSuccess(helloOk);
        },
        reject: onError,
        timeout: setTimeout(() => {
          this.pending.delete(connectReq.id);
          onError(new Error("Handshake timed out waiting for hello-ok"));
        }, this.options.connectTimeoutMs),
      });

      ws.send(JSON.stringify(connectReq));
      return;
    }

    // Step 2: Gateway responds to our connect request
    if (isResponseFrame(frame)) {
      this.resolvePending(frame);
      return;
    }

    // Ignore other events during handshake
  }

  private handleMessage(frame: ReturnType<typeof parseMessage>): void {
    if (!frame) return;

    if (isResponseFrame(frame)) {
      this.resolvePending(frame);
      return;
    }

    if (isEventFrame(frame)) {
      // BC-1 (gateway v2026.8.1, #116043): event-sequence baselines reset per
      // replacement WebSocket, so a new socket restarts `seq` at 1. This client
      // forwards every event straight to listeners and implements no seq-gap
      // recovery — therefore no baseline reset is needed here. Do not add gap
      // recovery without accounting for the per-socket baseline reset.
      for (const listener of this.eventListeners) {
        try {
          listener(frame);
        } catch {
          /* swallow listener errors */
        }
      }
    }
  }

  private resolvePending(response: ResponseFrame): void {
    const pending = this.pending.get(response.id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pending.delete(response.id);

    if (!response.ok || response.error) {
      const errMsg = response.error?.message ?? "Unknown error";
      const errCode = response.error?.code ?? "UNKNOWN";
      const retryable = response.error?.retryable === true;
      const retryAfterMs = response.error?.retryAfterMs;
      const errDetails = response.error?.details;
      const err = new Error(`${errCode}: ${errMsg}`) as Error & {
        retryable?: boolean;
        retryAfterMs?: number;
        code?: string;
        details?: unknown;
        missingScopes?: string[];
      };
      if (retryable) err.retryable = true;
      if (typeof retryAfterMs === "number") err.retryAfterMs = retryAfterMs;
      err.code = errCode;
      if (errDetails !== undefined) err.details = errDetails;
      // BC-10: FORBIDDEN/MISSING_SCOPE carries the scopes the caller needs, so
      // the dashboard layer can render actionable "requires scope X" hints.
      if (
        errCode === "FORBIDDEN" &&
        typeof errDetails === "object" &&
        errDetails !== null &&
        (errDetails as Record<string, unknown>).code === "MISSING_SCOPE"
      ) {
        const requiredScopes = (errDetails as Record<string, unknown>)
          .requiredScopes;
        if (Array.isArray(requiredScopes)) {
          err.missingScopes = requiredScopes.filter(
            (scope): scope is string => typeof scope === "string",
          );
        }
      }
      pending.reject(err);
      return;
    }

    pending.resolve(response.payload);
  }

  private clearPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setState("error");
      console.warn("[clawsprawl:client] max reconnect attempts reached");
      return;
    }
    this.setState("reconnecting");
    this.reconnectAttempts++;
    const jitter = Math.floor(Math.random() * 150);
    const delay = Math.min(
      this.reconnectDelayMs + jitter,
      this.options.maxReconnectDelayMs,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err) => {
        console.warn("[clawsprawl:client] reconnect failed:", err);
        this.reconnectDelayMs = Math.min(
          this.reconnectDelayMs * 2,
          this.options.maxReconnectDelayMs,
        );
      });
    }, delay);
  }

  private setState(nextState: ConnectionState): void {
    if (!canTransitionConnectionState(this.state, nextState)) {
      return;
    }

    this.state = nextState;
    for (const listener of this.stateListeners) {
      try {
        listener(nextState);
      } catch {
        /* swallow listener errors */
      }
    }
  }

  private schedulePrimaryRetry(): void {
    this.clearPrimaryRetry();
    if (
      !this.options.fallbackUrl ||
      this.activeConnectUrl !== this.options.fallbackUrl
    )
      return;

    this.primaryRetryTimer = setInterval(() => {
      if (
        this.options.url &&
        this.activeConnectUrl === this.options.fallbackUrl
      ) {
        const primaryUrl = this.options.url;
        this.openSocket(primaryUrl)
          .then(() => {
            this.activeConnectUrl = primaryUrl;
          })
          .catch(() => {
            // Primary still unreachable — stay on fallback
          });
      }
    }, GatewayClient.PRIMARY_RETRY_INTERVAL_MS);
  }

  private clearPrimaryRetry(): void {
    if (this.primaryRetryTimer) {
      clearInterval(this.primaryRetryTimer);
      this.primaryRetryTimer = null;
    }
  }
}
