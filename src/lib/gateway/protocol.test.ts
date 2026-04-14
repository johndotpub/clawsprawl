import { describe, expect, it, beforeEach } from 'vitest';
import {
  buildConnectParams,
  buildRequest,
  isConnectChallenge,
  isEventFrame,
  isRequestFrame,
  isResponseFrame,
  parseMessage,
  PROTOCOL_VERSION,
  resetRequestCounter,
} from './protocol';

describe('gateway protocol helpers', () => {
  beforeEach(() => {
    resetRequestCounter();
  });

  // --- buildRequest ---

  it('builds native request frames with type, id, and method', () => {
    const request = buildRequest('status');
    expect(request.type).toBe('req');
    expect(request.method).toBe('status');
    expect(request.id).toMatch(/^cs-/);
  });

  it('includes params when provided', () => {
    const request = buildRequest('agents.list', { scope: 'all' });
    expect(request.params).toEqual({ scope: 'all' });
  });

  it('omits params key when not provided', () => {
    const request = buildRequest('status');
    expect('params' in request).toBe(false);
  });

  it('generates unique incrementing request ids', () => {
    const r1 = buildRequest('a');
    const r2 = buildRequest('b');
    expect(r1.id).not.toBe(r2.id);
  });

  // --- resetRequestCounter ---

  it('resets request counter for deterministic tests', () => {
    buildRequest('a');
    resetRequestCounter();
    const r = buildRequest('b');
    // After reset, counter should restart at 1
    expect(r.id).toMatch(/^cs-\d+-1$/);
  });

  // --- PROTOCOL_VERSION ---

  it('exports protocol version 3', () => {
    expect(PROTOCOL_VERSION).toBe(3);
  });

  // --- buildConnectParams ---

  it('builds connect params from client options', () => {
    const params = buildConnectParams({
      url: 'ws://localhost:18789/ws',
      token: 'test-token-123',
      clientId: 'openclaw-control-ui',
      clientMode: 'webchat',
      clientVersion: '0.42.0',
      role: 'operator',
      scopes: ['operator.read'],
    });

    expect(params.minProtocol).toBe(3);
    expect(params.maxProtocol).toBe(3);
    expect(params.client.id).toBe('openclaw-control-ui');
    expect(params.client.mode).toBe('webchat');
    expect(params.client.version).toBe('0.42.0');
    expect(params.auth?.token).toBe('test-token-123');
    expect(params.role).toBe('operator');
    expect(params.scopes).toEqual(['operator.read']);
    // _nonce is NOT sent — the gateway rejects it on strict validation
    expect('_nonce' in params).toBe(false);
  });

  it('includes displayName when clientDisplayName is provided', () => {
    const params = buildConnectParams({
      url: 'ws://localhost:18789/ws',
      clientDisplayName: 'Sprawl Dashboard',
    });
    expect((params.client as Record<string, unknown>).displayName).toBe('Sprawl Dashboard');
  });

  it('omits displayName when clientDisplayName is not provided', () => {
    const params = buildConnectParams({ url: 'ws://localhost:18789/ws' });
    expect('displayName' in params.client).toBe(false);
  });

  it('reads navigator.platform when navigator is available', () => {
    const original = globalThis.navigator;
    try {
      // Simulate a browser environment with navigator.platform
      Object.defineProperty(globalThis, 'navigator', {
        value: { platform: 'Linux x86_64' },
        writable: true,
        configurable: true,
      });
      const params = buildConnectParams({ url: 'ws://localhost:18789/ws' });
      expect(params.client.platform).toBe('Linux x86_64');
    } finally {
      // Restore original navigator (undefined in Node)
      if (original === undefined) {
        // @ts-expect-error — restoring undefined navigator in Node
        delete globalThis.navigator;
      } else {
        Object.defineProperty(globalThis, 'navigator', {
          value: original,
          writable: true,
          configurable: true,
        });
      }
    }
  });

  it('falls back to unknown when navigator.platform is nullish', () => {
    const original = globalThis.navigator;
    try {
      Object.defineProperty(globalThis, 'navigator', {
        value: { platform: undefined },
        writable: true,
        configurable: true,
      });
      const params = buildConnectParams({ url: 'ws://localhost:18789/ws' });
      expect(params.client.platform).toBe('unknown');
    } finally {
      if (original === undefined) {
        // @ts-expect-error — restoring undefined navigator in Node
        delete globalThis.navigator;
      } else {
        Object.defineProperty(globalThis, 'navigator', {
          value: original,
          writable: true,
          configurable: true,
        });
      }
    }
  });

  it('omits auth when no token is provided', () => {
    const params = buildConnectParams({ url: 'ws://localhost:18789/ws' });
    expect(params.auth).toBeUndefined();
  });

  it('uses sensible defaults for optional client options', () => {
    const params = buildConnectParams({ url: 'ws://localhost:18789/ws' });
    expect(params.client.id).toBe('gateway-client');
    expect(params.client.version).toBe('0.42.0');
    expect(params.role).toBe('operator');
    expect(params.scopes).toEqual(['operator.read']);
  });

  // --- parseMessage ---

  it('parses valid native protocol frames', () => {
    const req = parseMessage('{"type":"req","id":"cs-1","method":"status"}');
    expect(req).toEqual({ type: 'req', id: 'cs-1', method: 'status' });

    const res = parseMessage('{"type":"res","id":"cs-1","ok":true,"payload":{}}');
    expect(res).toEqual({ type: 'res', id: 'cs-1', ok: true, payload: {} });

    const evt = parseMessage('{"type":"event","event":"tick","payload":{"ts":123}}');
    expect(evt).toEqual({ type: 'event', event: 'tick', payload: { ts: 123 } });
  });

  it('returns null for objects without valid type discriminator', () => {
    // Messages without a valid `type` discriminator are rejected
    expect(parseMessage('{"id":"x1","result":{}}')).toBeNull();
    expect(parseMessage('{"event":"heartbeat","payload":{}}')).toBeNull();
    expect(parseMessage('{"ok":true}')).toBeNull();
    expect(parseMessage('{"random":"object"}')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseMessage('not-json')).toBeNull();
  });

  it('returns null for non-object values', () => {
    expect(parseMessage('"string"')).toBeNull();
    expect(parseMessage('42')).toBeNull();
    expect(parseMessage('null')).toBeNull();
    expect(parseMessage('true')).toBeNull();
  });

  // --- isResponseFrame ---

  it('detects response frames by type discriminator', () => {
    expect(isResponseFrame({ type: 'res', id: 'x1', ok: true, payload: {} })).toBe(true);
    expect(isResponseFrame({ type: 'res', id: 'x2', ok: false, error: { code: 'NOT_FOUND', message: 'fail' } })).toBe(true);
  });

  it('rejects non-response frames', () => {
    expect(isResponseFrame({ type: 'req', id: 'x', method: 'status' })).toBe(false);
    expect(isResponseFrame({ type: 'event', event: 'tick' })).toBe(false);
    // Without type field — not a valid native protocol frame
    expect(isResponseFrame({ id: 'x', result: {} })).toBe(false);
    expect(isResponseFrame(null)).toBe(false);
    expect(isResponseFrame('string')).toBe(false);
    expect(isResponseFrame(undefined)).toBe(false);
  });

  // --- isEventFrame ---

  it('detects event frames by type discriminator', () => {
    expect(isEventFrame({ type: 'event', event: 'tick', payload: {} })).toBe(true);
    expect(isEventFrame({ type: 'event', event: 'connect.challenge', payload: { nonce: 'abc', ts: 1 } })).toBe(true);
  });

  it('rejects non-event frames', () => {
    expect(isEventFrame({ type: 'res', id: 'x', ok: true })).toBe(false);
    expect(isEventFrame({ type: 'req', id: 'x', method: 'a' })).toBe(false);
    // Without type field — not a valid native protocol frame
    expect(isEventFrame({ event: 'heartbeat', payload: {} })).toBe(false);
    expect(isEventFrame(null)).toBe(false);
    expect(isEventFrame('string')).toBe(false);
  });

  // --- isRequestFrame ---

  it('detects request frames by type discriminator', () => {
    expect(isRequestFrame({ type: 'req', id: 'cs-1', method: 'status' })).toBe(true);
  });

  it('rejects non-request frames', () => {
    expect(isRequestFrame({ type: 'res', id: 'x', ok: true })).toBe(false);
    expect(isRequestFrame({ type: 'event', event: 'tick' })).toBe(false);
    expect(isRequestFrame(null)).toBe(false);
  });

  // --- isConnectChallenge ---

  it('identifies connect.challenge events', () => {
    const challenge = { type: 'event' as const, event: 'connect.challenge', payload: { nonce: 'abc', ts: 123 } };
    expect(isConnectChallenge(challenge)).toBe(true);
  });

  it('rejects non-challenge events', () => {
    expect(isConnectChallenge({ type: 'event' as const, event: 'tick', payload: { ts: 1 } })).toBe(false);
    expect(isConnectChallenge({ type: 'res' as const, id: 'x', ok: true })).toBe(false);
  });

  // --- Coverage gap: parseMessage field validation (lines 91, 95, 99) ---

  it('returns null for res frame missing id field', () => {
    expect(parseMessage('{"type":"res","ok":true,"payload":{}}')).toBeNull();
  });

  it('returns null for res frame missing ok field', () => {
    expect(parseMessage('{"type":"res","id":"cs-1","payload":{}}')).toBeNull();
  });

  it('returns null for res frame with non-boolean ok field', () => {
    expect(parseMessage('{"type":"res","id":"cs-1","ok":"yes","payload":{}}')).toBeNull();
  });

  it('returns null for res frame with non-string id field', () => {
    expect(parseMessage('{"type":"res","id":42,"ok":true}')).toBeNull();
  });

  it('returns null for req frame missing id field', () => {
    expect(parseMessage('{"type":"req","method":"status"}')).toBeNull();
  });

  it('returns null for req frame missing method field', () => {
    expect(parseMessage('{"type":"req","id":"cs-1"}')).toBeNull();
  });

  it('returns null for req frame with non-string method field', () => {
    expect(parseMessage('{"type":"req","id":"cs-1","method":42}')).toBeNull();
  });

  it('returns null for req frame with non-string id field', () => {
    expect(parseMessage('{"type":"req","id":true,"method":"status"}')).toBeNull();
  });

  it('returns null for event frame missing event field', () => {
    expect(parseMessage('{"type":"event","payload":{"ts":123}}')).toBeNull();
  });

  it('returns null for event frame with non-string event field', () => {
    expect(parseMessage('{"type":"event","event":42,"payload":{}}')).toBeNull();
  });
});
