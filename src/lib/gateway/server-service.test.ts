import { describe, expect, it, vi } from "vitest";
import { GatewayServerService, parseMaxProtocol } from "./server-service";
import { PROTOCOL_VERSION } from "./protocol";

const HELLO_OK_FIXTURE = {
  type: "hello-ok" as const,
  protocol: PROTOCOL_VERSION,
  server: { version: "2026.4.8", connId: "conn-1" },
  features: { methods: ["status"], events: ["tick"] },
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

describe("gateway server service initialization lifecycle", () => {
  it("allows retry after initial bootstrap failure", async () => {
    const service = new GatewayServerService() as unknown as {
      initialize: () => Promise<void>;
      getSnapshot: () => {
        lastSuccessfulSnapshotAt: string | null;
        connectionState: string;
      };
      client: {
        connect: ReturnType<typeof vi.fn>;
        call: ReturnType<typeof vi.fn>;
        connectionState: string;
      };
    };

    const connect = vi
      .fn<() => Promise<typeof HELLO_OK_FIXTURE>>()
      .mockRejectedValueOnce(new Error("gateway down"))
      .mockResolvedValue(HELLO_OK_FIXTURE);

    service.client = {
      connect,
      call: vi.fn().mockResolvedValue(null),
      connectionState: "connected",
    };

    await service.initialize();
    expect(service.getSnapshot().connectionState).toBe("error");

    await service.initialize();
    expect(connect).toHaveBeenCalledTimes(2);
    expect(service.getSnapshot().lastSuccessfulSnapshotAt).not.toBeNull();

    await service.initialize();
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent initialize calls into a single connect attempt", async () => {
    let resolveConnect: ((value: typeof HELLO_OK_FIXTURE) => void) | null =
      null;
    const connectPromise = new Promise<typeof HELLO_OK_FIXTURE>((resolve) => {
      resolveConnect = resolve as (value: typeof HELLO_OK_FIXTURE) => void;
    });

    const service = new GatewayServerService() as unknown as {
      initialize: () => Promise<void>;
      client: {
        connect: ReturnType<typeof vi.fn>;
        call: ReturnType<typeof vi.fn>;
        connectionState: string;
      };
    };

    const connect = vi
      .fn<() => Promise<typeof HELLO_OK_FIXTURE>>()
      .mockReturnValue(connectPromise);
    service.client = {
      connect,
      call: vi.fn().mockResolvedValue(null),
      connectionState: "connected",
    };

    const p1 = service.initialize();
    const p2 = service.initialize();

    expect(connect).toHaveBeenCalledTimes(1);

    resolveConnect!(HELLO_OK_FIXTURE);
    await Promise.all([p1, p2]);

    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("captures events, sequences them, and trims to max buffer", () => {
    const service = new GatewayServerService() as unknown as {
      getEventsSince: (since: number) => {
        events: Array<{ seq: number; event: string }>;
        latestSeq: number;
      };
      onEvent: (
        listener: (event: { event: string; seq?: number }) => void,
      ) => () => void;
      pushEvent: (event: {
        type: "event";
        event: string;
        payload?: unknown;
      }) => void;
      eventBuffer: Array<{ seq: number; event: string }>;
    };

    const seen: string[] = [];
    const unsubscribe = service.onEvent((event) => seen.push(event.event));

    for (let i = 0; i < 520; i += 1) {
      service.pushEvent({ type: "event", event: `tick-${i}` });
    }

    const latest = service.getEventsSince(0);
    expect(latest.latestSeq).toBe(520);
    expect(latest.events.length).toBe(500);
    expect(latest.events[0]?.event).toBe("tick-20");
    expect(latest.events.at(-1)?.event).toBe("tick-519");
    expect(seen.at(-1)).toBe("tick-519");

    unsubscribe();
  });

  it("notifies snapshot listeners after successful refresh", async () => {
    const service = new GatewayServerService() as unknown as {
      refreshData: () => Promise<void>;
      client: {
        connectionState: string;
        call: ReturnType<typeof vi.fn>;
      };
      onSnapshotUpdated: (listener: () => void) => () => void;
    };

    service.client = {
      connectionState: "connected",
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

  it("refreshData skips when disconnected", async () => {
    const service = new GatewayServerService() as unknown as {
      refreshData: () => Promise<void>;
      client: {
        connectionState: string;
        call: ReturnType<typeof vi.fn>;
      };
    };

    const call = vi.fn().mockResolvedValue({});
    service.client = {
      connectionState: "disconnected",
      call,
    };

    await service.refreshData();
    expect(call).not.toHaveBeenCalled();
  });

  it("refreshData skips when another refresh is in flight", async () => {
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
      connectionState: "connected",
      call,
    };
    service.refreshInFlight = true;

    await service.refreshData();
    expect(call).not.toHaveBeenCalled();
  });

  it("refreshData records scopeHints for FORBIDDEN/MISSING_SCOPE and resets them next cycle", async () => {
    const service = new GatewayServerService() as unknown as {
      refreshData: () => Promise<void>;
      getSnapshot: () => {
        scopeHints: Array<{ method: string; missingScopes: string[] }>;
      };
      client: {
        connectionState: string;
        availableMethods: string[];
        call: ReturnType<typeof vi.fn>;
      };
    };

    // Every method refreshData() fetches — callIfAvailable gates on this list.
    const availableMethods = [
      "status",
      "agents.list",
      "sessions.list",
      "cron.list",
      "cron.runs",
      "models.list",
      "health",
      "system-presence",
      "usage.cost",
      "usage.status",
      "tools.catalog",
      "skills.status",
      "channels.status",
      "cron.status",
      "doctor.memory.status",
      "config.get",
      "agents.files.list",
    ];

    const missingScopeError = Object.assign(new Error("missing scope"), {
      code: "FORBIDDEN",
      missingScopes: ["operator.admin"],
    });
    // Plain FORBIDDEN without missingScopes must NOT produce a hint.
    const plainForbiddenError = Object.assign(new Error("forbidden"), {
      code: "FORBIDDEN",
    });

    const call = vi.fn<(method: string) => Promise<unknown>>();
    call.mockImplementation((method: string) => {
      if (method === "config.get") return Promise.reject(missingScopeError);
      if (method === "status") return Promise.reject(plainForbiddenError);
      return Promise.resolve({});
    });

    service.client = {
      connectionState: "connected",
      availableMethods,
      call,
    };

    await service.refreshData();
    // Exactly one hint: config.get only — the plain FORBIDDEN on 'status'
    // carries no missingScopes and is deliberately excluded.
    expect(service.getSnapshot().scopeHints).toEqual([
      { method: "config.get", missingScopes: ["operator.admin"] },
    ]);

    // Scope fixed on the gateway: config.get resolves now. Hints are reset
    // per refresh — they only describe the current cycle.
    call.mockImplementation((method: string) => {
      if (method === "config.get") return Promise.resolve({});
      if (method === "status") return Promise.reject(plainForbiddenError);
      return Promise.resolve({});
    });

    await service.refreshData();
    expect(service.getSnapshot().scopeHints).toEqual([]);
  });

  it("initialize stores gateway-advertised capabilities in the snapshot", async () => {
    const service = new GatewayServerService() as unknown as {
      initialize: () => Promise<void>;
      getSnapshot: () => { gatewayCapabilities: string[] };
      client: {
        connect: ReturnType<typeof vi.fn>;
        call: ReturnType<typeof vi.fn>;
        connectionState: string;
      };
    };

    // Clone — do not mutate the shared HELLO_OK_FIXTURE.
    const helloOk = {
      ...HELLO_OK_FIXTURE,
      features: {
        ...HELLO_OK_FIXTURE.features,
        capabilities: ["agent-kind", "tool-events"],
      },
    };

    service.client = {
      connect: vi
        .fn<() => Promise<typeof helloOk>>()
        .mockResolvedValue(helloOk),
      call: vi.fn().mockResolvedValue({}),
      connectionState: "connected",
    };

    await service.initialize();
    expect(service.getSnapshot().gatewayCapabilities).toEqual([
      "agent-kind",
      "tool-events",
    ]);
  });

  it("safeNormalize returns undefined for null and thrown normalizers", () => {
    const service = new GatewayServerService() as unknown as {
      safeNormalize: <T>(
        label: string,
        raw: unknown,
        normalizer: (data: unknown) => T,
      ) => T | undefined;
    };

    expect(service.safeNormalize("nullish", null, () => "x")).toBeUndefined();
    expect(
      service.safeNormalize("throws", { a: 1 }, () => {
        throw new Error("bad shape");
      }),
    ).toBeUndefined();
    expect(service.safeNormalize("ok", { a: 1 }, () => "good")).toBe("good");
  });

  it("getEventsSince filters by sequence", () => {
    const service = new GatewayServerService() as unknown as {
      pushEvent: (event: {
        type: "event";
        event: string;
        payload?: unknown;
      }) => void;
      getEventsSince: (since: number) => {
        events: Array<{ seq: number; event: string }>;
      };
    };

    service.pushEvent({ type: "event", event: "a" });
    service.pushEvent({ type: "event", event: "b" });
    service.pushEvent({ type: "event", event: "c" });

    const filtered = service.getEventsSince(2).events;
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.event).toBe("c");
  });

  it("tracks reconnect and error counters through state transitions", () => {
    const service = new GatewayServerService() as unknown as {
      client: { stateListeners: Set<(state: string) => void> };
      getSnapshot: () => { reconnectCount: number; errorCount: number };
    };

    // Drive the REAL state-change listener the constructor registered
    // (previous version replaced onStateChange after construction, so its
    // listener list was empty and the >= 0 assertions were tautological).
    const before = service.getSnapshot();
    for (const listener of service.client.stateListeners) {
      listener("reconnecting");
      listener("error");
    }
    const after = service.getSnapshot();
    expect(after.reconnectCount).toBe(before.reconnectCount + 1);
    expect(after.errorCount).toBe(before.errorCount + 1);
  });

  // --- handleGatewayEvent: update.available + shutdown banners ---

  it("handles update.available event and stores it in the snapshot", () => {
    const service = new GatewayServerService() as unknown as {
      handleGatewayEvent: (event: {
        type: "event";
        event: string;
        payload?: unknown;
      }) => void;
      getSnapshot: () => {
        updateAvailable: {
          currentVersion: string;
          latestVersion: string;
          channel: string;
        } | null;
      };
    };

    service.handleGatewayEvent({
      type: "event",
      event: "update.available",
      payload: {
        currentVersion: "2026.6.9",
        latestVersion: "2026.6.10",
        channel: "stable",
      },
    });

    expect(service.getSnapshot().updateAvailable).toEqual({
      currentVersion: "2026.6.9",
      latestVersion: "2026.6.10",
      channel: "stable",
    });
  });

  it("handles shutdown event and stores it in the snapshot", () => {
    const service = new GatewayServerService() as unknown as {
      handleGatewayEvent: (event: {
        type: "event";
        event: string;
        payload?: unknown;
      }) => void;
      getSnapshot: () => {
        shutdown: { reason: string; restartExpectedMs?: number } | null;
      };
    };

    service.handleGatewayEvent({
      type: "event",
      event: "shutdown",
      payload: { reason: "restart", restartExpectedMs: 5000 },
    });

    expect(service.getSnapshot().shutdown).toEqual({
      reason: "restart",
      restartExpectedMs: 5000,
    });
  });

  it("clears shutdown banner on health event", () => {
    const service = new GatewayServerService() as unknown as {
      handleGatewayEvent: (event: {
        type: "event";
        event: string;
        payload?: unknown;
      }) => void;
      getSnapshot: () => {
        shutdown: { reason: string; restartExpectedMs?: number } | null;
      };
    };

    service.handleGatewayEvent({
      type: "event",
      event: "shutdown",
      payload: { reason: "restart" },
    });
    expect(service.getSnapshot().shutdown).not.toBeNull();

    service.handleGatewayEvent({
      type: "event",
      event: "health",
      payload: { ok: true },
    });
    expect(service.getSnapshot().shutdown).toBeNull();
  });

  it("handles update.available with missing channel (defaults to stable)", () => {
    const service = new GatewayServerService() as unknown as {
      handleGatewayEvent: (event: {
        type: "event";
        event: string;
        payload?: unknown;
      }) => void;
      getSnapshot: () => {
        updateAvailable: {
          currentVersion: string;
          latestVersion: string;
          channel: string;
        } | null;
      };
    };

    service.handleGatewayEvent({
      type: "event",
      event: "update.available",
      payload: { currentVersion: "1.0", latestVersion: "2.0" },
    });

    expect(service.getSnapshot().updateAvailable).toEqual({
      currentVersion: "1.0",
      latestVersion: "2.0",
      channel: "stable",
    });
  });

  it("ignores update.available with missing required fields", () => {
    const service = new GatewayServerService() as unknown as {
      handleGatewayEvent: (event: {
        type: "event";
        event: string;
        payload?: unknown;
      }) => void;
      getSnapshot: () => { updateAvailable: unknown };
    };

    service.handleGatewayEvent({
      type: "event",
      event: "update.available",
      payload: { foo: "bar" },
    });
    expect(service.getSnapshot().updateAvailable).toBeNull();
  });
});

describe("parseMaxProtocol (OPENCLAW_GATEWAY_MAX_PROTOCOL)", () => {
  it("accepts integers >= 3 (MIN_PROTOCOL_VERSION)", () => {
    expect(parseMaxProtocol("3")).toBe(3);
    expect(parseMaxProtocol("4")).toBe(4);
    expect(parseMaxProtocol("5")).toBe(5);
  });

  it("rejects values below the minimum protocol version", () => {
    expect(parseMaxProtocol("2")).toBeUndefined();
    expect(parseMaxProtocol("0")).toBeUndefined();
  });

  it("rejects non-numeric and empty input", () => {
    expect(parseMaxProtocol("abc")).toBeUndefined();
    expect(parseMaxProtocol("")).toBeUndefined();
    expect(parseMaxProtocol(undefined)).toBeUndefined();
  });
});
