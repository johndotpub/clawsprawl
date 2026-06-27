import { describe, expect, it, beforeEach } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import {
  buildConnectParams,
  buildRequest,
  createRequestIdGenerator,
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

  it('exports protocol version 4', () => {
    expect(PROTOCOL_VERSION).toBe(4);
  });

  // --- buildConnectParams ---

  it('builds connect params from client options', () => {
    const params = buildConnectParams({
      url: 'ws://localhost:18789/ws',
      token: 'test-token-123',
      clientId: 'openclaw-control-ui',
      clientMode: 'webchat',
      clientVersion: '0.43.0',
      role: 'operator',
      scopes: ['operator.read'],
    });

    expect(params.minProtocol).toBe(3);
    expect(params.maxProtocol).toBe(4);
    expect(params.client.id).toBe('openclaw-control-ui');
    expect(params.client.mode).toBe('webchat');
    expect(params.client.version).toBe('0.43.0');
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
    expect((params.client as unknown as Record<string, unknown>).displayName).toBe('Sprawl Dashboard');
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
    expect(params.client.version).toBe('0.43.0');
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

  it('returns null for JSON array input', () => {
    expect(parseMessage('[1,2,3]')).toBeNull();
  });

  // --- createRequestIdGenerator ---

  describe('createRequestIdGenerator', () => {
    it('generates incrementing ids within each instance', () => {
      const gen1 = createRequestIdGenerator();
      const gen2 = createRequestIdGenerator();
      const id1a = gen1.next();
      const id1b = gen1.next();
      const id2a = gen2.next();
      expect(id1a).not.toBe(id1b);
      expect(id2a).toMatch(/^cs-/);
    });

    it('resets counter via reset()', () => {
      const gen = createRequestIdGenerator();
      gen.next();
      gen.next();
      gen.reset();
      const id = gen.next();
      expect(id).toMatch(/^cs-/);
    });

    it('produces incrementing ids', () => {
      const gen = createRequestIdGenerator();
      const first = gen.next();
      const second = gen.next();
      expect(first).not.toBe(second);
    });
  });

  // --- Device identity + auth (v4) ---

  describe('device identity support', () => {
    let testKeys: { publicKey: string; privateKey: string; deviceId: string };

    function setupKeys() {
      const { publicKey, privateKey } = generateKeyPairSync('ed25519');
      const pubPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
      const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
      const raw = publicKey.export({ type: 'spki', format: 'der' });
      const rawBytes = raw.subarray(-32);
      const { createHash } = require('node:crypto');
      const deviceId = createHash('sha256').update(rawBytes).digest('hex');
      return { publicKey: pubPem, privateKey: privPem, deviceId };
    }

    beforeEach(() => {
      testKeys = setupKeys();
    });

    it('includes device block when deviceId is provided', () => {
      const params = buildConnectParams({
        url: 'ws://localhost:18789/ws',
        deviceId: testKeys.deviceId,
        devicePublicKey: testKeys.publicKey,
      });
      expect(params.device).toBeDefined();
      expect(params.device?.id).toBe(testKeys.deviceId);
      expect(params.device?.publicKey).toBe(testKeys.publicKey);
    });

    it('omits device block when no deviceId is provided', () => {
      const params = buildConnectParams({ url: 'ws://localhost:18789/ws' });
      expect(params.device).toBeUndefined();
    });

    it('includes nonce in device block when challengeNonce is provided', () => {
      const params = buildConnectParams({
        url: 'ws://localhost:18789/ws',
        deviceId: testKeys.deviceId,
        devicePublicKey: testKeys.publicKey,
        devicePrivateKey: testKeys.privateKey,
      }, 'test-nonce-abc');
      expect(params.device?.nonce).toBe('test-nonce-abc');
    });

    it('includes signature and signedAt when devicePrivateKey is provided with nonce', () => {
      const params = buildConnectParams({
        url: 'ws://localhost:18789/ws',
        token: 'gateway-token',
        deviceId: testKeys.deviceId,
        devicePublicKey: testKeys.publicKey,
        devicePrivateKey: testKeys.privateKey,
      }, 'challenge-nonce-123');
      expect(params.device?.signature).toBeDefined();
      expect(typeof params.device?.signature).toBe('string');
      expect(params.device?.signedAt).toBeDefined();
      expect(typeof params.device?.signedAt).toBe('number');
    });

    it('omits signature when no devicePrivateKey is provided', () => {
      const params = buildConnectParams({
        url: 'ws://localhost:18789/ws',
        deviceId: testKeys.deviceId,
        devicePublicKey: testKeys.publicKey,
      }, 'challenge-nonce-123');
      expect(params.device?.signature).toBeUndefined();
      expect(params.device?.signedAt).toBeUndefined();
    });

    it('omits signature when no challengeNonce is provided', () => {
      const params = buildConnectParams({
        url: 'ws://localhost:18789/ws',
        deviceId: testKeys.deviceId,
        devicePublicKey: testKeys.publicKey,
        devicePrivateKey: testKeys.privateKey,
      });
      expect(params.device?.signature).toBeUndefined();
      expect(params.device?.signedAt).toBeUndefined();
    });

    it('includes deviceToken in auth when provided alongside token', () => {
      const params = buildConnectParams({
        url: 'ws://localhost:18789/ws',
        token: 'gateway-token',
        deviceToken: 'device-token-xyz',
      });
      expect(params.auth?.token).toBe('gateway-token');
      expect(params.auth?.deviceToken).toBe('device-token-xyz');
    });

    it('includes deviceToken in auth when provided without token', () => {
      const params = buildConnectParams({
        url: 'ws://localhost:18789/ws',
        deviceToken: 'device-token-xyz',
      });
      expect(params.auth?.token).toBeUndefined();
      expect(params.auth?.deviceToken).toBe('device-token-xyz');
    });

    it('produces a verifiable Ed25519 signature', () => {
      const { createPublicKey, verify } = require('node:crypto');
      const params = buildConnectParams({
        url: 'ws://localhost:18789/ws',
        token: 'gateway-token',
        clientId: 'openclaw-control-ui',
        clientMode: 'webchat',
        deviceId: testKeys.deviceId,
        devicePublicKey: testKeys.publicKey,
        devicePrivateKey: testKeys.privateKey,
        scopes: ['operator.read'],
      }, 'nonce-xyz');

      // Reconstruct the v3 payload (matching the gateway's format)
      const scopes = ['operator.read'].join(',');
      // Match normalizeDeviceMetadataForAuth: lowercase + trim
      const rawPlatform = typeof navigator !== 'undefined' ? (navigator.platform ?? 'unknown') : 'server';
      const platform = rawPlatform.trim().toLowerCase();
      const deviceFamily = '';
      const payload = [
        'v3', testKeys.deviceId, 'openclaw-control-ui', 'webchat', 'operator',
        scopes, String(params.device?.signedAt), 'gateway-token', 'nonce-xyz',
        platform, deviceFamily,
      ].join('|');

      const sig = Buffer.from(params.device!.signature!, 'base64url');
      const pubKey = createPublicKey(testKeys.publicKey);
      const valid = verify(undefined, Buffer.from(payload), pubKey, sig);
      expect(valid).toBe(true);
    });

    it('returns undefined signature when private key is invalid', () => {
      const params = buildConnectParams({
        url: 'ws://localhost:18789/ws',
        deviceId: testKeys.deviceId,
        devicePublicKey: testKeys.publicKey,
        devicePrivateKey: 'not-a-valid-key',
      }, 'nonce-abc');
      expect(params.device?.signature).toBeUndefined();
      expect(params.device?.signedAt).toBeUndefined();
    });
  });
});
