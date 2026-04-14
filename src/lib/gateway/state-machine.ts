import type { ConnectionState } from './types';

const TRANSITIONS: Record<ConnectionState, Set<ConnectionState>> = {
  idle: new Set(['connecting', 'disconnected', 'error']),
  connecting: new Set(['handshaking', 'connected', 'reconnecting', 'disconnected', 'error']),
  handshaking: new Set(['connected', 'reconnecting', 'disconnected', 'error']),
  connected: new Set(['reconnecting', 'disconnected', 'error']),
  reconnecting: new Set(['connecting', 'handshaking', 'connected', 'reconnecting', 'disconnected', 'error']),
  disconnected: new Set(['connecting', 'reconnecting', 'disconnected', 'error']),
  error: new Set(['connecting', 'reconnecting', 'disconnected', 'error']),
};

/** Check whether a connection state transition is allowed by the 7×7 matrix. */
export function canTransitionConnectionState(from: ConnectionState, to: ConnectionState): boolean {
  if (from === to) {
    return true;
  }

  return TRANSITIONS[from].has(to);
}
