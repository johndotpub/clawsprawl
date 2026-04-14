import { describe, expect, it } from 'vitest';
import { canTransitionConnectionState } from './state-machine';
import type { ConnectionState } from './types';

const ALL_STATES: ConnectionState[] = ['idle', 'connecting', 'handshaking', 'connected', 'reconnecting', 'disconnected', 'error'];

/**
 * Full expected-transition matrix (7×7).
 * `true` = transition allowed, `false` = blocked.
 * Self-transitions are always allowed (handled separately in the function).
 */
const EXPECTED: Record<ConnectionState, Record<ConnectionState, boolean>> = {
  idle: {
    idle: true,
    connecting: true,
    handshaking: false,
    connected: false,
    reconnecting: false,
    disconnected: true,
    error: true,
  },
  connecting: {
    idle: false,
    connecting: true,
    handshaking: true,
    connected: true,
    reconnecting: true,
    disconnected: true,
    error: true,
  },
  handshaking: {
    idle: false,
    connecting: false,
    handshaking: true,
    connected: true,
    reconnecting: true,
    disconnected: true,
    error: true,
  },
  connected: {
    idle: false,
    connecting: false,
    handshaking: false,
    connected: true,
    reconnecting: true,
    disconnected: true,
    error: true,
  },
  reconnecting: {
    idle: false,
    connecting: true,
    handshaking: true,
    connected: true,
    reconnecting: true,
    disconnected: true,
    error: true,
  },
  disconnected: {
    idle: false,
    connecting: true,
    handshaking: false,
    connected: false,
    reconnecting: true,
    disconnected: true,
    error: true,
  },
  error: {
    idle: false,
    connecting: true,
    handshaking: false,
    connected: false,
    reconnecting: true,
    disconnected: true,
    error: true,
  },
};

describe('gateway connection state machine', () => {
  it('allows expected transitions', () => {
    expect(canTransitionConnectionState('idle', 'connecting')).toBe(true);
    expect(canTransitionConnectionState('connecting', 'handshaking')).toBe(true);
    expect(canTransitionConnectionState('handshaking', 'connected')).toBe(true);
    expect(canTransitionConnectionState('connected', 'reconnecting')).toBe(true);
    expect(canTransitionConnectionState('reconnecting', 'handshaking')).toBe(true);
    expect(canTransitionConnectionState('reconnecting', 'connected')).toBe(true);
    expect(canTransitionConnectionState('error', 'connecting')).toBe(true);
  });

  it('blocks invalid transitions', () => {
    expect(canTransitionConnectionState('idle', 'connected')).toBe(false);
    expect(canTransitionConnectionState('idle', 'handshaking')).toBe(false);
    expect(canTransitionConnectionState('connected', 'idle')).toBe(false);
    expect(canTransitionConnectionState('disconnected', 'connected')).toBe(false);
    expect(canTransitionConnectionState('handshaking', 'connecting')).toBe(false);
  });

  it('allows self transitions', () => {
    expect(canTransitionConnectionState('connected', 'connected')).toBe(true);
    expect(canTransitionConnectionState('reconnecting', 'reconnecting')).toBe(true);
    expect(canTransitionConnectionState('handshaking', 'handshaking')).toBe(true);
  });

  describe('exhaustive 7×7 transition matrix', () => {
    for (const from of ALL_STATES) {
      for (const to of ALL_STATES) {
        const expected = EXPECTED[from][to];
        const label = expected ? 'allows' : 'blocks';
        it(`${label} ${from} → ${to}`, () => {
          expect(canTransitionConnectionState(from, to)).toBe(expected);
        });
      }
    }
  });
});
