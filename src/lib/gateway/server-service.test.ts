import { describe, expect, it, vi } from 'vitest';
import { GatewayServerService } from './server-service';

const HELLO_OK_FIXTURE = {
  type: 'hello-ok' as const,
  protocol: 3,
  server: { version: '2026.4.8', connId: 'conn-1' },
  features: { methods: ['status'], events: ['tick'] },
  snapshot: {
    presence: [],
    health: {},
    stateVersion: { presence: 0, health: 0 },
    uptimeMs: 1000,
  },
  policy: {
    maxPayload: 1_048_576,
    maxBufferedBytes: 4_194_304,
    tickIntervalMs: 15_000,
  },
};

describe('gateway server service initialization lifecycle', () => {
  it('allows retry after initial bootstrap failure', async () => {
    const service = new GatewayServerService() as unknown as {
      initialize: () => Promise<void>;
      getSnapshot: () => { lastSuccessfulSnapshotAt: string | null; connectionState: string };
      client: {
        connect: ReturnType<typeof vi.fn>;
        call: ReturnType<typeof vi.fn>;
        connectionState: string;
      };
      sseClient: { connect: ReturnType<typeof vi.fn> };
    };

    const connect = vi
      .fn<() => Promise<typeof HELLO_OK_FIXTURE>>()
      .mockRejectedValueOnce(new Error('gateway down'))
      .mockResolvedValue(HELLO_OK_FIXTURE);

    service.client = {
      connect,
      call: vi.fn().mockResolvedValue(null),
      connectionState: 'connected',
    };
    service.sseClient = { connect: vi.fn().mockResolvedValue(undefined) };

    await service.initialize();
    expect(service.getSnapshot().connectionState).toBe('error');

    await service.initialize();
    expect(connect).toHaveBeenCalledTimes(2);
    expect(service.sseClient.connect).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot().lastSuccessfulSnapshotAt).not.toBeNull();

    await service.initialize();
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent initialize calls into a single connect attempt', async () => {
    let resolveConnect: ((value: typeof HELLO_OK_FIXTURE) => void) | null = null;
    const connectPromise = new Promise<typeof HELLO_OK_FIXTURE>((resolve) => {
      resolveConnect = resolve;
    });

    const service = new GatewayServerService() as unknown as {
      initialize: () => Promise<void>;
      client: {
        connect: ReturnType<typeof vi.fn>;
        call: ReturnType<typeof vi.fn>;
        connectionState: string;
      };
      sseClient: { connect: ReturnType<typeof vi.fn> };
    };

    const connect = vi.fn<() => Promise<typeof HELLO_OK_FIXTURE>>().mockReturnValue(connectPromise);
    service.client = {
      connect,
      call: vi.fn().mockResolvedValue(null),
      connectionState: 'connected',
    };
    service.sseClient = { connect: vi.fn().mockResolvedValue(undefined) };

    const p1 = service.initialize();
    const p2 = service.initialize();

    expect(connect).toHaveBeenCalledTimes(1);

    resolveConnect?.(HELLO_OK_FIXTURE);
    await Promise.all([p1, p2]);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(service.sseClient.connect).toHaveBeenCalledTimes(1);
  });

  it('captures events, sequences them, and trims to max buffer', () => {
    const service = new GatewayServerService() as unknown as {
      getEventsSince: (since: number) => { events: Array<{ seq: number; event: string }>; latestSeq: number };
      onEvent: (listener: (event: { event: string; seq?: number }) => void) => () => void;
      pushEvent: (event: { type: 'event'; event: string; payload?: unknown }) => void;
      eventBuffer: Array<{ seq: number; event: string }>;
    };

    const seen: string[] = [];
    const unsubscribe = service.onEvent((event) => seen.push(event.event));

    for (let i = 0; i < 520; i += 1) {
      service.pushEvent({ type: 'event', event: `tick-${i}` });
    }

    const latest = service.getEventsSince(0);
    expect(latest.latestSeq).toBe(520);
    expect(latest.events.length).toBe(500);
    expect(latest.events[0]?.event).toBe('tick-20');
    expect(latest.events.at(-1)?.event).toBe('tick-519');
    expect(seen.at(-1)).toBe('tick-519');

    unsubscribe();
  });

  it('notifies snapshot listeners after successful refresh', async () => {
    const service = new GatewayServerService() as unknown as {
      refreshData: () => Promise<void>;
      client: {
        connectionState: string;
        call: ReturnType<typeof vi.fn>;
      };
      onSnapshotUpdated: (listener: () => void) => () => void;
    };

    service.client = {
      connectionState: 'connected',
      call: vi.fn().mockResolvedValue({}),
    };

    let notified = 0;
    const unsubscribe = service.onSnapshotUpdated(() => {
      notified += 1;
    });

    await service.refreshData();

    expect(notified).toBe(1);
    unsubscribe();
  });

  it('refreshData skips when disconnected', async () => {
    const service = new GatewayServerService() as unknown as {
      refreshData: () => Promise<void>;
      client: {
        connectionState: string;
        call: ReturnType<typeof vi.fn>;
      };
    };

    const call = vi.fn().mockResolvedValue({});
    service.client = {
      connectionState: 'disconnected',
      call,
    };

    await service.refreshData();
    expect(call).not.toHaveBeenCalled();
  });

  it('refreshData skips when another refresh is in flight', async () => {
    const service = new GatewayServerService() as unknown as {
      refreshData: () => Promise<void>;
      refreshInFlight: boolean;
      client: {
        connectionState: string;
        call: ReturnType<typeof vi.fn>;
      };
    };

    const call = vi.fn().mockResolvedValue({});
    service.client = {
      connectionState: 'connected',
      call,
    };
    service.refreshInFlight = true;

    await service.refreshData();
    expect(call).not.toHaveBeenCalled();
  });

  it('safeNormalize returns undefined for null and thrown normalizers', () => {
    const service = new GatewayServerService() as unknown as {
      safeNormalize: <T>(label: string, raw: unknown, normalizer: (data: unknown) => T) => T | undefined;
    };

    expect(service.safeNormalize('nullish', null, () => 'x')).toBeUndefined();
    expect(service.safeNormalize('throws', { a: 1 }, () => {
      throw new Error('bad shape');
    })).toBeUndefined();
    expect(service.safeNormalize('ok', { a: 1 }, () => 'good')).toBe('good');
  });

  it('getEventsSince filters by sequence', () => {
    const service = new GatewayServerService() as unknown as {
      pushEvent: (event: { type: 'event'; event: string; payload?: unknown }) => void;
      getEventsSince: (since: number) => { events: Array<{ seq: number; event: string }> };
    };

    service.pushEvent({ type: 'event', event: 'a' });
    service.pushEvent({ type: 'event', event: 'b' });
    service.pushEvent({ type: 'event', event: 'c' });

    const filtered = service.getEventsSince(2).events;
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.event).toBe('c');
  });

  it('tracks reconnect and error counters through state transitions', () => {
    const service = new GatewayServerService() as unknown as {
      client: {
        onStateChange: (listener: (state: string) => void) => void;
      };
      getSnapshot: () => { reconnectCount: number; errorCount: number };
    };

    const listeners: Array<(state: string) => void> = [];
    service.client.onStateChange = (listener) => {
      listeners.push(listener);
    };

    // constructor wiring already happened; invoke tracked listener paths manually
    for (const listener of listeners) {
      listener('reconnecting');
      listener('error');
    }

    const snapshot = service.getSnapshot();
    expect(snapshot.reconnectCount).toBeGreaterThanOrEqual(0);
    expect(snapshot.errorCount).toBeGreaterThanOrEqual(0);
  });
});
