import type {
  ConnectParams,
  EventFrame,
  GatewayClientOptions,
  GatewayFrame,
  RequestFrame,
  ResponseFrame,
} from './types';

// ---------------------------------------------------------------------------
// Request ID generation
// ---------------------------------------------------------------------------

let requestCounter = 0;

/** Generate a unique request ID for native protocol frames. */
function nextRequestId(): string {
  requestCounter += 1;
  return `cs-${Date.now()}-${requestCounter}`;
}

/**
 * Reset the counter — useful for deterministic tests.
 *
 * @returns void
 */
export function resetRequestCounter(): void {
  requestCounter = 0;
}

// ---------------------------------------------------------------------------
// Frame builders
// ---------------------------------------------------------------------------

/**
 * Build a native OpenClaw RequestFrame.
 *
 * @param method - RPC method name to invoke.
 * @param params - Optional payload to include in the request.
 * @returns The constructed {@link RequestFrame}.
 */
export function buildRequest(method: string, params?: unknown): RequestFrame {
  return {
    type: 'req',
    id: nextRequestId(),
    method,
    ...(params !== undefined ? { params } : {}),
  };
}

/** Current protocol version supported by this client. */
export const PROTOCOL_VERSION = 3;

/** Client version string sent in ConnectParams during handshake. */
export const CLIENT_VERSION = __PACKAGE_VERSION__ as string;

/**
 * Build {@link ConnectParams} from client options for the `connect` handshake.
 *
 * The gateway sends a `connect.challenge` event with a nonce, but the nonce
 * is NOT echoed back — it exists only for the client to verify server identity.
 * Sending `_nonce` as a top-level property causes strict gateways to reject
 * the request with "unexpected property '_nonce'".
 *
 * @param options - Client options used to populate the connect parameters.
 * @returns The assembled {@link ConnectParams} for the handshake request.
 */
export function buildConnectParams(options: GatewayClientOptions): ConnectParams {
  return {
    minProtocol: PROTOCOL_VERSION,
    maxProtocol: PROTOCOL_VERSION,
    client: {
      id: options.clientId ?? 'gateway-client',
      version: options.clientVersion ?? CLIENT_VERSION,
      platform: typeof navigator !== 'undefined' ? navigator.platform ?? 'unknown' : 'unknown',
      mode: options.clientMode ?? 'ui',
      ...(options.clientDisplayName ? { displayName: options.clientDisplayName } : {}),
    },
    ...(options.token ? { auth: { token: options.token } } : {}),
    role: options.role ?? 'operator',
    scopes: options.scopes ?? ['operator.read'],
  };
}

// ---------------------------------------------------------------------------
// Frame parsing / type guards
// ---------------------------------------------------------------------------

/**
 * Parse a raw WebSocket message string into a typed frame, or null on failure.
 *
 * Validates required fields per frame type:
 *  - `res` frames must have a string `id` and boolean `ok`
 *  - `req` frames must have a string `id` and string `method`
 *  - `event` frames must have a string `event`
 *
 * @param input - Raw WebSocket message string to parse.
 * @returns The parsed {@link GatewayFrame}, or `null` if parsing or validation fails.
 */
export function parseMessage(input: string): GatewayFrame | null {
  try {
    const parsed = JSON.parse(input);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    if (parsed.type === 'res') {
      if (typeof parsed.id !== 'string' || typeof parsed.ok !== 'boolean') return null;
      return parsed as ResponseFrame;
    }
    if (parsed.type === 'req') {
      if (typeof parsed.id !== 'string' || typeof parsed.method !== 'string') return null;
      return parsed as RequestFrame;
    }
    if (parsed.type === 'event') {
      if (typeof parsed.event !== 'string') return null;
      return parsed as EventFrame;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Type guard: is this frame a ResponseFrame?
 *
 * @param value - The value to check.
 * @returns `true` if `value` is a {@link ResponseFrame}.
 */
export function isResponseFrame(value: unknown): value is ResponseFrame {
  if (typeof value !== 'object' || value === null) return false;
  return (value as Record<string, unknown>).type === 'res';
}

/**
 * Type guard: is this frame an EventFrame?
 *
 * @param value - The value to check.
 * @returns `true` if `value` is an {@link EventFrame}.
 */
export function isEventFrame(value: unknown): value is EventFrame {
  if (typeof value !== 'object' || value === null) return false;
  return (value as Record<string, unknown>).type === 'event';
}

/**
 * Type guard: is this frame a RequestFrame? @internal
 *
 * @param value - The value to check.
 * @returns `true` if `value` is a {@link RequestFrame}.
 */
export function isRequestFrame(value: unknown): value is RequestFrame {
  if (typeof value !== 'object' || value === null) return false;
  return (value as Record<string, unknown>).type === 'req';
}

/**
 * Check if an event frame is the connect challenge sent by the gateway
 * immediately after WebSocket upgrade.
 *
 * @param frame - The gateway frame to inspect.
 * @returns `true` if `frame` is a `connect.challenge` event.
 */
export function isConnectChallenge(frame: GatewayFrame): frame is EventFrame & { payload: { nonce: string; ts: number } } {
  if (frame.type !== 'event' || (frame as EventFrame).event !== 'connect.challenge') return false;
  const payload = (frame as EventFrame).payload;
  return typeof payload === 'object' && payload !== null
    && typeof (payload as Record<string, unknown>).nonce === 'string';
}
