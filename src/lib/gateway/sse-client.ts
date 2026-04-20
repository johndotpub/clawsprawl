/**
 * Server-side SSE client for the OpenClaw gateway's event stream.
 *
 * Connects to `GET /event` on the gateway HTTP API and converts the
 * server-sent event stream into typed {@link EventFrame} objects.
 * Used alongside the WebSocket connection for dual-stream event ingestion:
 * the WS carries RPC responses + subscribed events, while SSE provides
 * the full gateway event bus (including events not subscribed via WS).
 *
 * @module gateway/sse-client
 */

import type { EventFrame } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for the gateway SSE client. @internal */
export interface GatewaySseClientOptions {
  /** Full URL to the gateway SSE endpoint (e.g. http://127.0.0.1:18789/event). */
  url: string;
  /** Auth token for the `Authorization: Bearer` header. */
  token?: string;
  /** Auto-reconnect on disconnection. Defaults to true. */
  reconnect?: boolean;
  /** Minimum reconnect delay (ms). Defaults to 2000. */
  minReconnectDelayMs?: number;
  /** Maximum reconnect delay (ms). Defaults to 60000. */
  maxReconnectDelayMs?: number;
}

/** Callback for SSE events. @internal */
export type SseEventListener = (event: EventFrame) => void;

/** SSE client connection states. @internal */
export type SseClientState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

// ---------------------------------------------------------------------------
// SSE Client
// ---------------------------------------------------------------------------

/**
 * Server-side SSE client that connects to the OpenClaw gateway's
 * `GET /event` endpoint and emits typed EventFrame objects.
 *
 * Uses `fetch()` with a streaming response body — no browser-only
 * `EventSource` API needed. Runs in Node.js server context only.
 */
export class GatewaySseClient {
  private options: Required<Pick<GatewaySseClientOptions, 'reconnect' | 'minReconnectDelayMs' | 'maxReconnectDelayMs'>> & GatewaySseClientOptions;
  private abortController: AbortController | null = null;
  private listeners = new Set<SseEventListener>();
  private stateListeners = new Set<(state: SseClientState) => void>();
  private _state: SseClientState = 'idle';
  private reconnectDelayMs: number;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 20;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: GatewaySseClientOptions) {
    this.options = {
      reconnect: true,
      minReconnectDelayMs: 2_000,
      maxReconnectDelayMs: 60_000,
      ...options,
    };
    this.reconnectDelayMs = this.options.minReconnectDelayMs;
  }

  /** Current connection state. */
  get state(): SseClientState { return this._state; }

  /**
   * Start consuming the SSE stream. Resolves once the connection is open.
   * The stream is read in the background — events are delivered via listeners.
   */
  async connect(): Promise<void> {
    if (this._state === 'connecting' || this._state === 'connected') return;

    this.setState('connecting');
    this.abortController = new AbortController();

    try {
      const headers: Record<string, string> = {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
      };
      if (this.options.token) {
        headers['Authorization'] = `Bearer ${this.options.token}`;
      }

      const response = await fetch(this.options.url, {
        headers,
        signal: this.abortController.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`SSE connect failed: ${response.status} ${response.statusText}`);
      }

      this.setState('connected');
      this.reconnectDelayMs = this.options.minReconnectDelayMs;

      // Read the stream in the background
      void this.readStream(response.body);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.warn('[clawsprawl:sse] connection failed:', err);
      this.setState('error');
      this.scheduleReconnect();
    }
  }

  /** Disconnect from the SSE stream. */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.setState('disconnected');
  }

  /** Subscribe to SSE events. Returns an unsubscribe function. */
  onEvent(listener: SseEventListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  onStateChange(listener: (state: SseClientState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this._state);
    return () => { this.stateListeners.delete(listener); };
  }

  // --- Internal ---

  /** Update state and notify state listeners. */
  private setState(next: SseClientState): void {
    if (this._state === next) return;
    this._state = next;
    for (const listener of this.stateListeners) {
      try { listener(next); } catch { /* swallow */ }
    }
  }

  /** Read the SSE response body stream line by line and parse events. */
  private async readStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder();
    const reader = body.getReader();
    let buffer = '';
    let currentEvent = '';
    let currentData = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            currentData += (currentData ? '\n' : '') + line.slice(5).trimStart();
          } else if (line === '') {
            // End of event
            if (currentData) {
              this.emitParsedEvent(currentEvent, currentData);
            }
            currentEvent = '';
            currentData = '';
          }
          // Ignore comment lines (starting with ':') and other lines
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.warn('[clawsprawl:sse] stream read error:', err);
    } finally {
      reader.releaseLock();
    }

    // Stream ended — reconnect if enabled
    if (this._state === 'connected') {
      this.setState('disconnected');
      this.scheduleReconnect();
    }
  }

  /** Parse a raw SSE event and emit it as an EventFrame to listeners. */
  private emitParsedEvent(eventName: string, data: string): void {
    try {
      const parsed = JSON.parse(data);
      const frame: EventFrame = {
        type: 'event',
        event: eventName || (typeof parsed === 'object' && parsed?.event ? String(parsed.event) : 'unknown'),
        payload: typeof parsed === 'object' && parsed?.payload !== undefined ? parsed.payload : parsed,
        ...(typeof parsed === 'object' && typeof parsed?.seq === 'number' ? { seq: parsed.seq } : {}),
      };
      for (const listener of this.listeners) {
        try { listener(frame); } catch { /* swallow listener errors */ }
      }
    } catch {
      /* Ignore non-JSON data lines (keepalives, comments) */
    }
  }

  /** Schedule a reconnect with exponential backoff. */
  private scheduleReconnect(): void {
    if (!this.options.reconnect || this._state === 'disconnected') return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this._state = 'error';
      console.warn('[clawsprawl:sse] max reconnect attempts reached');
      return;
    }
    this.reconnectAttempts++;
    const jitter = Math.floor(Math.random() * 500);
    const delay = Math.min(this.reconnectDelayMs + jitter, this.options.maxReconnectDelayMs);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, this.options.maxReconnectDelayMs);
      void this.connect();
    }, delay);
  }
}
