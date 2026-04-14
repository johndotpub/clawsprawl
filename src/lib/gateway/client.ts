import {
  buildConnectParams,
  buildRequest,
  isConnectChallenge,
  isEventFrame,
  isResponseFrame,
  parseMessage,
} from './protocol';
import { canTransitionConnectionState } from './state-machine';
import type {
  ConnectionState,
  EventFrame,
  GatewayClientOptions,
  HelloOk,
  ResponseFrame,
  Snapshot,
} from './types';

/** Callback invoked whenever the connection state changes. */
type StateListener = (state: ConnectionState) => void;

/** Callback invoked for each gateway event frame received. */
type GatewayEventListener = (event: EventFrame) => void;

/** Tracks an in-flight RPC request awaiting its response frame. */
interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * GatewayClient speaks the native OpenClaw WebSocket protocol (v3).
 *
 * Connection lifecycle:
 *   1. Open WebSocket to gateway URL
 *   2. Gateway sends `connect.challenge` event with `{ nonce, ts }`
 *   3. Client sends `connect` request with ConnectParams (auth, identity, scopes)
 *   4. Gateway responds with HelloOk (snapshot, features, policy) or error
 *   5. Steady state: client sends RequestFrames, gateway replies with ResponseFrames
 *      and pushes EventFrames (tick, health, presence, agent, session.message, etc.)
 */
export class GatewayClient {
  private readonly options: Required<
    Pick<GatewayClientOptions, 'reconnect' | 'minReconnectDelayMs' | 'maxReconnectDelayMs' | 'connectTimeoutMs'>
  > &
    GatewayClientOptions;

  private socket: WebSocket | null = null;
  private state: ConnectionState = 'idle';
  private reconnectEnabled = false;
  private reconnectDelayMs: number;
  private stateListeners = new Set<StateListener>();
  private eventListeners = new Set<GatewayEventListener>();
  private pending = new Map<string, PendingRequest>();
  private activeConnectUrl: string;

  /** Populated after a successful handshake. */
  private _helloOk: HelloOk | null = null;

  constructor(options: GatewayClientOptions) {
    this.options = {
      reconnect: true,
      minReconnectDelayMs: 800,
      maxReconnectDelayMs: 30_000,
      connectTimeoutMs: 10_000,
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

  // --- Connection lifecycle ---

  /**
   * Open a WebSocket to the gateway and complete the challenge-response
   * handshake. Resolves with the {@link HelloOk} payload on success.
   * Falls back to `fallbackUrl` if the primary URL fails.
   *
   * @returns A promise that resolves with the {@link HelloOk} handshake payload.
   */
  async connect(): Promise<HelloOk> {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      if (this._helloOk) {
        return this._helloOk;
      }
    }

    this.setState(this.state === 'idle' ? 'connecting' : 'reconnecting');

    try {
      return await this.openSocket(this.activeConnectUrl);
    } catch (err) {
      if (!this.options.fallbackUrl || this.activeConnectUrl === this.options.fallbackUrl) {
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
    this.clearPending(new Error('Disconnected'));
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.setState('disconnected');
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
  async call<TResult = unknown>(method: string, params?: Record<string, unknown>): Promise<TResult> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Socket is not connected');
    }

    const request = buildRequest(method, params);
    const payload = JSON.stringify(request);

    return new Promise<TResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new Error(`RPC timeout: ${method}`));
      }, this.options.connectTimeoutMs);

      this.pending.set(request.id, { resolve, reject, timeout });
      this.socket?.send(payload);
    });
  }

  // --- Internal: socket management ---

  private openSocket(targetUrl: string): Promise<HelloOk> {
    const wsOptions: Record<string, unknown> = {};
    if (this.options.origin) {
      wsOptions.headers = { Origin: this.options.origin };
    }
    const ws = Object.keys(wsOptions).length > 0
      ? new WebSocket(targetUrl, wsOptions as ConstructorParameters<typeof WebSocket>[1])
      : new WebSocket(targetUrl);
    this.socket = ws;

    return new Promise<HelloOk>((resolve, reject) => {
      let handshakeComplete = false;

      const timeout = setTimeout(() => {
        if (!handshakeComplete) {
          ws.close();
          reject(new Error('Connection timed out'));
        }
      }, this.options.connectTimeoutMs);

      ws.onopen = () => {
        this.setState('handshaking');
      };

      ws.onerror = () => {
        if (!handshakeComplete) {
          clearTimeout(timeout);
          reject(new Error('Socket error'));
        }
      };

      ws.onclose = () => {
        this.socket = null;
        if (!handshakeComplete) {
          clearTimeout(timeout);
          reject(new Error('Socket closed during handshake'));
        } else {
          this.setState('disconnected');
          this.clearPending(new Error('Socket closed'));
          if (this.reconnectEnabled) {
            this.scheduleReconnect();
          }
        }
      };

      ws.onmessage = (message) => {
        const text = typeof message.data === 'string' ? message.data : '';
        const frame = parseMessage(text);
        if (!frame) return;

        if (!handshakeComplete) {
          // During handshake, handle challenge + hello-ok
          this.handleHandshakeMessage(frame, ws, (helloOk) => {
            handshakeComplete = true;
            clearTimeout(timeout);
            this._helloOk = helloOk;
            this.setState('connected');
            this.reconnectEnabled = this.options.reconnect;
            this.reconnectDelayMs = this.options.minReconnectDelayMs;
            resolve(helloOk);
          }, (err) => {
            handshakeComplete = true;
            clearTimeout(timeout);
            ws.close();
            reject(err);
          });
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
      const connectParams = buildConnectParams(this.options);
      const connectReq = buildRequest('connect', connectParams);

      // Store pending so we can match the response
      this.pending.set(connectReq.id, {
        resolve: (payload) => {
          const helloOk = payload as HelloOk;
          onSuccess(helloOk);
        },
        reject: onError,
        timeout: setTimeout(() => {
          this.pending.delete(connectReq.id);
          onError(new Error('Handshake timed out waiting for hello-ok'));
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
      for (const listener of this.eventListeners) {
        try { listener(frame); } catch { /* swallow listener errors */ }
      }
    }
  }

  private resolvePending(response: ResponseFrame): void {
    const pending = this.pending.get(response.id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pending.delete(response.id);

    if (!response.ok || response.error) {
      const errMsg = response.error?.message ?? 'Unknown error';
      const errCode = response.error?.code ?? 'UNKNOWN';
      pending.reject(new Error(`${errCode}: ${errMsg}`));
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
    this.setState('reconnecting');
    const jitter = Math.floor(Math.random() * 150);
    const delay = Math.min(this.reconnectDelayMs + jitter, this.options.maxReconnectDelayMs);
    setTimeout(() => {
      this.connect().catch((err) => {
        console.warn('[clawsprawl:client] reconnect failed:', err);
        this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, this.options.maxReconnectDelayMs);
      });
    }, delay);
  }

  private setState(nextState: ConnectionState): void {
    if (!canTransitionConnectionState(this.state, nextState)) {
      return;
    }

    this.state = nextState;
    for (const listener of this.stateListeners) {
      try { listener(nextState); } catch { /* swallow listener errors */ }
    }
  }
}
