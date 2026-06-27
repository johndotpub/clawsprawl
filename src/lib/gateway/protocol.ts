import type {
  ConnectParams,
  EventFrame,
  GatewayClientOptions,
  GatewayFrame,
  RequestFrame,
  ResponseFrame,
} from './types';
import { createPrivateKey, sign as ed25519Sign } from 'node:crypto';

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

export function createRequestIdGenerator(): { next: () => string; reset: () => void } {
  let counter = 0;
  return {
    next: () => {
      counter += 1;
      return `cs-${Date.now()}-${counter}`;
    },
    reset: () => { counter = 0; },
  };
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
export function buildRequest(method: string, params?: unknown, idGenerator?: { next: () => string }): RequestFrame {
  const id = idGenerator ? idGenerator.next() : nextRequestId();
  return {
    type: 'req',
    id,
    method,
    ...(params !== undefined ? { params } : {}),
  };
}

/**
 * Current protocol version supported by this client.
 *
 * OpenClaw gateways ≥ 2026.5.17 require protocol v4 (`MIN_CLIENT_PROTOCOL_VERSION = 4`).
 * We send a negotiation range `minProtocol: 3, maxProtocol: 4` so the server can pick v4
 * while remaining tolerant of a v3-era server during local dev fallbacks.
 *
 * v4 introduces chat-delta semantics (`deltaText`, `replace` flag on `chat`/`agent` events);
 * clawsprawl buckets these events but does not render full transcript deltas yet.
 */
export const PROTOCOL_VERSION = 4;

/** Lowest protocol version this client can negotiate. */
export const MIN_PROTOCOL_VERSION = 3;

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
/**
 * Normalize device metadata for auth payload (lowercase + trim, matching gateway).
 */
function normalizeDeviceMetadataForAuth(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.replace(/[A-Z]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 32));
}

/**
 * Build the v3 device auth signature payload string.
 * The gateway reconstructs this exact string and verifies the signature against it.
 */
function buildDeviceAuthPayloadV3(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token: string;
  nonce: string;
  platform: string;
  deviceFamily?: string;
}): string {
  const scopes = params.scopes.join(',');
  const token = params.token ?? '';
  const platform = normalizeDeviceMetadataForAuth(params.platform);
  const deviceFamily = normalizeDeviceMetadataForAuth(params.deviceFamily);
  return [
    'v3',
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
    params.nonce,
    platform,
    deviceFamily,
  ].join('|');
}

/**
 * Sign the connect challenge with an Ed25519 private key using the v3 payload format.
 * Returns a base64url-encoded signature, or undefined if signing fails.
 */
function signChallenge(options: GatewayClientOptions, nonce: string, privateKeyPem: string): { signature: string; signedAt: number } | undefined {
  try {
    const signedAt = Date.now();
    const deviceId = options.deviceId!;
    const payload = buildDeviceAuthPayloadV3({
      deviceId,
      clientId: options.clientId ?? 'gateway-client',
      clientMode: options.clientMode ?? 'ui',
      role: options.role ?? 'operator',
      scopes: options.scopes ?? ['operator.read'],
      signedAtMs: signedAt,
      token: options.token ?? '',
      nonce,
      platform: typeof navigator !== 'undefined' ? navigator.platform ?? 'unknown' : 'server',
    });
    const key = createPrivateKey(Buffer.from(privateKeyPem, 'utf-8'));
    const signature = ed25519Sign(undefined, Buffer.from(payload, 'utf-8'), key);
    return { signature: signature.toString('base64url'), signedAt };
  } catch {
    return undefined;
  }
}

export function buildConnectParams(options: GatewayClientOptions, challengeNonce?: string): ConnectParams {
  const signed = (challengeNonce && options.deviceId && options.devicePrivateKey)
    ? signChallenge(options, challengeNonce, options.devicePrivateKey)
    : undefined;
  return {
    minProtocol: MIN_PROTOCOL_VERSION,
    maxProtocol: PROTOCOL_VERSION,
    client: {
      id: options.clientId ?? 'gateway-client',
      version: options.clientVersion ?? CLIENT_VERSION,
      platform: typeof navigator !== 'undefined' ? navigator.platform ?? 'unknown' : 'unknown',
      mode: options.clientMode ?? 'ui',
      ...(options.clientDisplayName ? { displayName: options.clientDisplayName } : {}),
    },
    ...(options.token ? {
      auth: {
        token: options.token,
        ...(options.deviceToken ? { deviceToken: options.deviceToken } : {}),
      },
    } : options.deviceToken ? { auth: { deviceToken: options.deviceToken } } : {}),
    role: options.role ?? 'operator',
    scopes: options.scopes ?? ['operator.read'],
    ...(options.deviceId ? {
      device: {
        id: options.deviceId,
        publicKey: options.devicePublicKey ?? '',
        ...(challengeNonce ? { nonce: challengeNonce } : {}),
        ...(signed ? { signature: signed.signature, signedAt: signed.signedAt } : {}),
      },
    } : {}),
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
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
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
