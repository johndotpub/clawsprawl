import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardState } from "./store";
import {
  connectionClass,
  escapeHtml,
  eventBucket,
  formatAge,
  formatContextWindow,
  renderAgentRows,
  renderAuditTimelineRows,
  renderChannelsStatusRows,
  renderConfigRows,
  renderConfigSchemaRows,
  renderCronRows,
  renderCronSchedulerRows,
  renderEventRows,
  renderFileTrackingRows,
  renderHealthRows,
  renderMemoryStatusRows,
  renderModelRows,
  renderNodeFleetRows,
  renderPermissionActivityRows,
  renderPresenceRows,
  renderProgressCardRows,
  renderProviderRows,
  renderSessionDetailRows,
  renderSessionRows,
  renderSkeletonRows,
  renderSkillsRows,
  renderSkillProposalRows,
  renderStatusRows,
  renderStabilityRows,
  renderTaskLedgerRows,
  renderToolCatalogRows,
  renderToolExecutionRows,
  renderUsageCostRows,
  renderUsageTimeseriesRows,
} from "./renderers";
import {
  normalizeAuditTimeline,
  normalizeConfigSchema,
  normalizeNodeFleet,
  normalizeSkillProposals,
  normalizeStability,
  normalizeTaskLedger,
  normalizeUsageTimeseries,
  normalizeProgressCard,
} from "./adapters";
import { SESSION_DISPLAY_LIMIT, extractTimestamp } from "./renderers/shared";
import type { ProgressCard } from "../gateway/types";

const baseState: DashboardState = {
  connectionState: "connected",
  lastUpdatedAt: "2026-04-04T00:00:00.000Z",
  lastSuccessfulSnapshotAt: "2026-04-04T00:00:00.000Z",
  stale: false,
  reconnectCount: 0,
  errorCount: 0,
  status: null,
  health: null,
  presence: [],
  agents: [],
  sessions: [],
  cronJobs: [],
  cronRuns: [],
  models: [],
  events: [],
  usageCost: null,
  usageStatus: null,
  toolsCatalog: null,
  skillsStatus: null,
  channelsStatus: null,
  cronScheduler: null,
  memoryStatus: null,
  configData: null,
  fileStatus: null,
  sessionDetails: null,
  updateAvailable: null,
  shutdown: null,
  gatewayCapabilities: [],
  scopeHints: [],
  progressCards: {},
  activeRunIds: [],
  taskLedger: null,
  usageTimeseries: null,
  nodeFleet: null,
  stability: null,
  auditTimeline: null,
  configSchema: null,
  skillProposals: null,
};

describe("dashboard renderers", () => {
  it("maps connection states to semantic classes", () => {
    expect(connectionClass("connected")).toContain("text-terminal-green");
    expect(connectionClass("error")).toContain("text-terminal-error");
    expect(connectionClass("disconnected")).toContain("text-terminal-error");
    expect(connectionClass("connecting")).toContain("text-terminal-amber");
  });

  it("maps known events to filter buckets", () => {
    expect(eventBucket("cron")).toBe("cron");
    expect(eventBucket("session.message")).toBe("message");
    expect(eventBucket("session.tool")).toBe("tool");
    expect(eventBucket("exec.approval.requested")).toBe("permission");
    expect(eventBucket("unknown.event")).toBe("other");
  });

  it("buckets OpenClaw v4 config/catalog invalidation events", () => {
    expect(eventBucket("config.changed")).toBe("config");
    expect(eventBucket("skills.changed")).toBe("config");
  });

  it("buckets node presence broadcast + activity events", () => {
    expect(eventBucket("node.presence")).toBe("presence");
    expect(eventBucket("node.presence.activity")).toBe("presence");
    expect(eventBucket("node.presence.alive")).toBe("presence");
  });

  it("buckets session approval, observer, and operator terminal events", () => {
    expect(eventBucket("session.approval")).toBe("permission");
    expect(eventBucket("session.observer")).toBe("session");
    expect(eventBucket("terminal.data")).toBe("node");
    expect(eventBucket("terminal.exit")).toBe("node");
  });

  it("renders expected number of skeleton rows", () => {
    const rows = renderSkeletonRows(4);
    expect(rows.match(/skeleton-row/g)?.length).toBe(4);
  });

  it("filters event rows by selected buckets", () => {
    const state = {
      ...baseState,
      events: [
        { type: "event" as const, event: "heartbeat", payload: { ok: true } },
        {
          type: "event" as const,
          event: "cron",
          payload: { status: "error", detail: "failed" },
        },
      ],
    } as DashboardState;

    const filteredRows = renderEventRows(state, new Set(["cron", "other"]));

    expect(filteredRows).toContain("cron");
    expect(filteredRows).not.toContain("heartbeat");
  });

  it("renders agent rows with string model and session count", () => {
    const state = {
      ...baseState,
      agents: [{ id: "GIBSON", model: "ollama/x" }],
    };

    const html = renderAgentRows(
      state as unknown as DashboardState,
      new Map([["GIBSON", 3]]),
    );
    expect(html).toContain("GIBSON");
    expect(html).toContain("sessions:3");
    expect(html).toContain("ollama/x");
    expect(html).toContain("bg-terminal-surface-2");
  });

  it("renders agent rows with AgentModel object { primary, fallbacks }", () => {
    const state = {
      ...baseState,
      agents: [
        {
          id: "ceo",
          model: { primary: "ollama-cloud/qwen3.5:cloud", fallbacks: [] },
        },
      ],
    };

    const html = renderAgentRows(
      state as unknown as DashboardState,
      new Map([["ceo", 5]]),
    );
    expect(html).toContain("ceo");
    expect(html).toContain("ollama-cloud/qwen3.5:cloud");
    expect(html).toContain("sessions:5");
  });

  it("uses consistent row class across all row renderers", () => {
    const agentState = { ...baseState, agents: [{ id: "a1" }] };
    const cronState = {
      ...baseState,
      cronJobs: [
        {
          name: "j1",
          id: "j1",
          schedule: { kind: "cron", expr: "* * *" },
          enabled: true,
        },
      ],
    };
    const providerState = {
      ...baseState,
      models: [{ id: "p/m", provider: "p" }],
    };
    const eventState = {
      ...baseState,
      events: [
        {
          type: "event" as const,
          event: "heartbeat",
          payload: { ts: 1712000000000 },
        },
      ],
    };

    const sharedClass =
      "rounded border border-terminal-border bg-terminal-surface-2 px-3 py-2";
    expect(
      renderAgentRows(agentState as unknown as DashboardState, new Map()),
    ).toContain(sharedClass);
    expect(renderCronRows(cronState as unknown as DashboardState)).toContain(
      sharedClass,
    );
    expect(
      renderProviderRows(providerState as unknown as DashboardState),
    ).toContain(sharedClass);
    expect(
      renderEventRows(
        eventState as unknown as DashboardState,
        new Set(["heartbeat"]),
      ),
    ).toContain(sharedClass);
  });

  it("renders cron rows with error details when present", () => {
    const state = {
      ...baseState,
      cronJobs: [
        {
          name: "daily",
          id: "daily",
          schedule: { kind: "cron", expr: "daily 12:00" },
          enabled: true,
        },
      ],
      cronRuns: [
        { jobId: "daily", status: "error", error: "Unknown Channel", ts: 1 },
      ],
    };

    const html = renderCronRows(state as unknown as DashboardState);
    expect(html).toContain("daily");
    expect(html).toContain("Unknown Channel");
    expect(html).toContain("status-error");
  });

  it("renders cron rows with string schedule for backwards compat", () => {
    const state = {
      ...baseState,
      cronJobs: [
        {
          name: "nightly",
          id: "nightly",
          schedule: "0 0 * * *",
          enabled: true,
        },
      ],
    };

    const html = renderCronRows(state as unknown as DashboardState);
    expect(html).toContain("nightly");
    expect(html).toContain("0 0 * * *");
  });

  it("renders provider rows with healthy status for live providers", () => {
    const state = {
      ...baseState,
      models: [{ id: "ollama-cloud/x", provider: "ollama-cloud" }],
    };

    const html = renderProviderRows(state as unknown as DashboardState);
    expect(html).toContain("ollama-cloud");
    expect(html).toContain("healthy");
    // No phantom degraded entries for absent providers
    expect(html).not.toContain("openai");
    expect(html).not.toContain("degraded");
  });

  // --- Empty state fallback tests ---

  it("renders empty-state message when agents list is empty", () => {
    const html = renderAgentRows(
      baseState as unknown as DashboardState,
      new Map(),
    );
    expect(html).toContain("No agents loaded.");
  });

  it("renders empty-state message when cron jobs list is empty", () => {
    const html = renderCronRows(baseState as unknown as DashboardState);
    expect(html).toContain("No cron data loaded.");
  });

  it("renders empty-state message when provider models list is empty", () => {
    const html = renderProviderRows(baseState as unknown as DashboardState);
    expect(html).toContain("No model provider data loaded.");
  });

  it("renders empty-state message when events list is empty", () => {
    const html = renderEventRows(
      baseState as unknown as DashboardState,
      new Set(["heartbeat", "cron", "other"]),
    );
    expect(html).toContain("No live events yet.");
  });

  // --- escapeHtml edge cases ---

  it("escapes ampersands", () => {
    expect(escapeHtml("a&b")).toBe("a&amp;b");
  });

  it("escapes angle brackets", () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
    );
  });

  it("escapes single and double quotes", () => {
    expect(escapeHtml('it\'s "fine"')).toBe("it&#39;s &quot;fine&quot;");
  });

  it("converts non-string values to their string representation", () => {
    expect(escapeHtml(42)).toBe("42");
    expect(escapeHtml(null)).toBe("null");
    expect(escapeHtml(undefined)).toBe("undefined");
    expect(escapeHtml(true)).toBe("true");
  });

  it("handles strings with multiple entities combined", () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;",
    );
  });

  it("returns empty string when given empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  // --- connectionClass completeness ---

  it("maps handshaking, reconnecting, and idle states to amber class", () => {
    expect(connectionClass("handshaking")).toContain("text-terminal-amber");
    expect(connectionClass("reconnecting")).toContain("text-terminal-amber");
    expect(connectionClass("idle")).toContain("text-terminal-amber");
  });

  // --- eventBucket completeness ---

  it("maps all known event names to their buckets", () => {
    expect(eventBucket("heartbeat")).toBe("heartbeat");
    expect(eventBucket("tick")).toBe("heartbeat");
    expect(eventBucket("health")).toBe("health");
    expect(eventBucket("presence")).toBe("presence");
    // Gateway event names → filter buckets
    expect(eventBucket("session.tool")).toBe("tool");
    expect(eventBucket("exec.approval.requested")).toBe("permission");
    expect(eventBucket("exec.approval.resolved")).toBe("permission");
    expect(eventBucket("plugin.approval.requested")).toBe("permission");
    expect(eventBucket("plugin.approval.resolved")).toBe("permission");
    expect(eventBucket("file.edited")).toBe("file");
    expect(eventBucket("file.watcher.updated")).toBe("file");
    expect(eventBucket("message.updated")).toBe("message");
    expect(eventBucket("message.part.updated")).toBe("message");
    expect(eventBucket("session.message")).toBe("message");
    expect(eventBucket("session.created")).toBe("session");
    expect(eventBucket("session.status")).toBe("session");
    expect(eventBucket("session.idle")).toBe("session");
    // Uncategorized falls through to 'other'
    expect(eventBucket("server.connected")).toBe("other");
    expect(eventBucket("installation.updated")).toBe("other");
    expect(eventBucket("todo.updated")).toBe("other");
    expect(eventBucket("tui.toast.show")).toBe("other");
  });

  // Comprehensive event-bucket coverage for all 31 gateway event types
  it.each([
    // Unrestricted / transport
    ["connect.challenge", "handshake"],
    ["tick", "heartbeat"],
    ["heartbeat", "heartbeat"],
    ["health", "health"],
    ["presence", "presence"],
    ["node.presence.alive", "presence"],
    ["shutdown", "shutdown"],
    ["update.available", "update"],
    ["payload.large", "payload"],
    // operator.read
    ["cron", "cron"],
    ["sessions.changed", "session"],
    ["session.message", "message"],
    ["session.operation", "session"],
    ["session.tool", "tool"],
    ["agent", "agent"],
    ["chat", "message"],
    ["chat.send_timing", "latency"],
    ["chat.side_result", "message"],
    ["talk.event", "voice"],
    ["voicewake.changed", "config"],
    ["voicewake.routing.changed", "config"],
    // operator.approvals
    ["exec.approval.requested", "permission"],
    ["exec.approval.resolved", "permission"],
    ["plugin.approval.requested", "permission"],
    ["plugin.approval.resolved", "permission"],
    // operator.pairing
    ["node.pair.requested", "pairing"],
    ["node.pair.resolved", "pairing"],
    ["device.pair.requested", "pairing"],
    ["device.pair.resolved", "pairing"],
    // other broadcasts
    ["node.invoke.request", "node"],
    ["talk.mode", "voice"],
    // fallback session.*
    ["session.created", "session"],
    ["session.status", "session"],
    ["session.idle", "session"],
    // unknown
    ["unknown.event", "other"],
    ["", "other"],
  ] as const)('buckets event "%s" as "%s"', (eventName, expectedBucket) => {
    expect(eventBucket(eventName)).toBe(expectedBucket);
  });

  // --- formatAge (deterministic via fake timers to avoid wall-clock flakiness) ---

  describe("formatAge", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(1_700_000_000_000));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("formats ages correctly for various time ranges", () => {
      const now = Date.now();
      expect(formatAge(now - 5_000)).toBe("5s ago");
      expect(formatAge(now - 120_000)).toBe("2m ago");
      expect(formatAge(now - 3_600_000)).toBe("1h ago");
      expect(formatAge(now - 86_400_000)).toBe("1d ago");
      expect(formatAge(now - 172_800_000)).toBe("2d ago");
    });

    it('returns "just now" for future timestamps', () => {
      expect(formatAge(Date.now() + 10_000)).toBe("just now");
    });

    it('formats zero seconds as "0s ago"', () => {
      expect(formatAge(Date.now())).toBe("0s ago");
    });
  });

  // --- extractTimestamp ---

  it("extractTimestamp prefers payload.ts over seq", () => {
    const ts = extractTimestamp({ ts: 1_700_000_000_000 }, 1);
    expect(typeof ts).toBe("string");
    expect(ts).not.toBe("now");
    expect(ts).toMatch(/:/);
  });

  it("extractTimestamp falls back to seq when ts is absent", () => {
    const ts = extractTimestamp({}, 1_700_000_000_000);
    expect(typeof ts).toBe("string");
    expect(ts).not.toBe("now");
    expect(ts).toMatch(/:/);
  });

  it('extractTimestamp returns "now" when neither ts nor seq is numeric', () => {
    expect(extractTimestamp({}, "not-a-number")).toBe("now");
  });

  // --- formatContextWindow ---

  it("formats context window sizes compactly", () => {
    expect(formatContextWindow(256000)).toBe("256k");
    expect(formatContextWindow(128000)).toBe("128k");
    expect(formatContextWindow(1000000)).toBe("1M");
    expect(formatContextWindow(2500000)).toBe("2.5M");
    expect(formatContextWindow(4096)).toBe("4.1k");
    expect(formatContextWindow(500)).toBe("500");
    expect(formatContextWindow(0)).toBe("n/a");
    expect(formatContextWindow(undefined)).toBe("n/a");
  });

  // --- renderSessionRows ---

  it("renders session rows with display name, agent, kind, and channel", () => {
    const state = {
      ...baseState,
      sessions: [
        {
          key: "agent:ceo:main",
          agentId: "ceo",
          displayName: "CEO Main",
          kind: "persistent",
          channel: "discord",
          updatedAt: Date.now() - 60_000,
          status: "running",
        },
        {
          key: "agent:ops:deploy",
          agentId: "ops",
          displayName: "Ops Deploy",
          kind: "ephemeral",
        },
      ],
    };

    const html = renderSessionRows(state as unknown as DashboardState);
    expect(html).toContain("CEO Main");
    expect(html).toContain("ceo");
    expect(html).toContain("persistent");
    expect(html).toContain("discord");
    expect(html).toContain("running");
    expect(html).toContain("Ops Deploy");
    expect(html).toContain("ops");
  });

  it("renders non-running session status as muted badge", () => {
    const state = {
      ...baseState,
      sessions: [
        {
          key: "agent:ceo:old",
          agentId: "ceo",
          displayName: "Old Session",
          status: "idle",
        },
        {
          key: "agent:ops:done",
          agentId: "ops",
          displayName: "Done Session",
          status: "closed",
        },
      ],
    };

    const html = renderSessionRows(state as unknown as DashboardState);
    expect(html).toContain("idle");
    expect(html).toContain("closed");
    expect(html).toContain("status-muted");
  });

  it("renders empty-state message when sessions list is empty", () => {
    const html = renderSessionRows(baseState as unknown as DashboardState);
    expect(html).toContain("No sessions loaded.");
  });

  it("truncates sessions beyond display limit", () => {
    const sessions = Array.from(
      { length: SESSION_DISPLAY_LIMIT + 5 },
      (_, i) => ({
        key: `s-${i}`,
        agentId: "ceo",
        displayName: `Session ${i}`,
      }),
    );
    const state = { ...baseState, sessions };
    const html = renderSessionRows(state as unknown as DashboardState);
    expect(html).toContain("Session 0");
    expect(html).toContain("Session 49");
    expect(html).toContain("and 5 more");
  });

  // --- renderModelRows ---

  it("renders model rows with provider, context window, and input types", () => {
    const state = {
      ...baseState,
      models: [
        {
          id: "ollama-cloud/qwen3.5:cloud",
          name: "qwen3.5:cloud",
          provider: "ollama-cloud",
          contextWindow: 128000,
          input: ["text"],
        },
        {
          id: "openai/gpt-5.3-codex",
          name: "gpt-5.3-codex",
          provider: "openai",
          contextWindow: 256000,
        },
      ],
    };

    const html = renderModelRows(state as unknown as DashboardState);
    expect(html).toContain("qwen3.5:cloud");
    expect(html).toContain("ollama-cloud");
    expect(html).toContain("ctx:128k");
    expect(html).toContain("text");
    expect(html).toContain("gpt-5.3-codex");
    expect(html).toContain("openai");
    expect(html).toContain("ctx:256k");
  });

  it("renders empty-state message when models list is empty", () => {
    const html = renderModelRows(baseState as unknown as DashboardState);
    expect(html).toContain("No models loaded.");
  });

  // --- renderHealthRows ---

  it("renders health rows with overall status and channel probes", () => {
    const state = {
      ...baseState,
      health: {
        ok: true,
        ts: 1712345678000,
        durationMs: 450,
        channels: {
          discord: {
            configured: true,
            running: false,
            probe: { ok: true, elapsedMs: 120, bot: { username: "TestBot" } },
          },
        },
        channelOrder: ["discord"],
        channelLabels: { discord: "Discord" },
      },
    };

    const html = renderHealthRows(state as unknown as DashboardState);
    expect(html).toContain("Overall");
    expect(html).toContain("healthy");
    expect(html).toContain("450ms");
    expect(html).toContain("Discord");
    expect(html).toContain("probe ok");
    expect(html).toContain("120ms");
    expect(html).toContain("bot:TestBot");
    expect(html).toContain("stopped");
  });

  it("renders unhealthy status for failed health check", () => {
    const state = {
      ...baseState,
      health: { ok: false, ts: 0 },
    };

    const html = renderHealthRows(state as unknown as DashboardState);
    expect(html).toContain("unhealthy");
    expect(html).toContain("status-error");
  });

  it("renders empty-state message when health is null", () => {
    const html = renderHealthRows(baseState as unknown as DashboardState);
    expect(html).toContain("No health data loaded.");
  });

  // --- renderStatusRows ---

  it("renders status rows with runtime version, tasks, and audit", () => {
    const state = {
      ...baseState,
      status: {
        ok: true,
        runtimeVersion: "2026.4.5",
        tasks: {
          total: 1487,
          active: 109,
          terminal: 1378,
          failures: 19,
          byStatus: {},
          byRuntime: { cli: 1381, cron: 33 },
        },
        taskAudit: { total: 146, warnings: 37, errors: 109, byCode: {} },
        channelSummary: ["Discord: configured"],
        sessions: {
          count: 102,
          byAgent: [
            { agentId: "ceo", count: 30 },
            { agentId: "ops", count: 72 },
          ],
        },
      },
    };

    const html = renderStatusRows(state as unknown as DashboardState);
    expect(html).toContain("2026.4.5");
    expect(html).toContain("total:1487");
    expect(html).toContain("active:109");
    expect(html).toContain("fail:19");
    expect(html).toContain("cli:1381");
    expect(html).toContain("cron:33");
    expect(html).toContain("warnings:37 errors:109");
    expect(html).toContain("Discord: configured");
    expect(html).toContain("total:102");
    expect(html).toContain("ceo:30");
    expect(html).toContain("ops:72");
  });

  it("renders empty-state message when status is null", () => {
    const html = renderStatusRows(baseState as unknown as DashboardState);
    expect(html).toContain("No status data loaded.");
  });

  it("renders status with zero failures in muted style", () => {
    const state = {
      ...baseState,
      status: {
        ok: true,
        tasks: {
          total: 100,
          active: 5,
          terminal: 95,
          failures: 0,
          byStatus: {},
          byRuntime: {},
        },
      },
    };

    const html = renderStatusRows(state as unknown as DashboardState);
    expect(html).toContain("text-terminal-muted");
    expect(html).toContain("fail:0");
  });

  // --- renderPresenceRows ---

  it("renders presence rows with host, mode, platform, and version", () => {
    const state = {
      ...baseState,
      presence: [
        {
          ts: Date.now() - 5_000,
          host: "workstation-a",
          mode: "webchat",
          platform: "linux",
          version: "0.16.0",
          reason: "connect",
        },
        {
          ts: Date.now() - 120_000,
          host: "phone-b",
          mode: "cli",
          platform: "darwin",
        },
      ],
    };

    const html = renderPresenceRows(state as unknown as DashboardState);
    expect(html).toContain("workstation-a");
    expect(html).toContain("webchat");
    expect(html).toContain("linux");
    expect(html).toContain("v0.16.0");
    expect(html).toContain("connect");
    expect(html).toContain("phone-b");
    expect(html).toContain("cli");
    expect(html).toContain("darwin");
  });

  it("renders empty-state message when presence list is empty", () => {
    const html = renderPresenceRows(baseState as unknown as DashboardState);
    expect(html).toContain("No connected clients.");
  });

  it('renders "unknown" for presence entries without host', () => {
    const state = {
      ...baseState,
      presence: [{ ts: 0 }],
    };

    const html = renderPresenceRows(state as unknown as DashboardState);
    expect(html).toContain("unknown");
  });

  // --- renderUsageCostRows ---

  it("renders usage cost rows with totals and daily breakdown", () => {
    const state = {
      ...baseState,
      usageCost: {
        updatedAt: 1712345678000,
        days: 31,
        daily: [
          {
            date: "2026-03-31",
            input: 500,
            output: 100,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 600,
            totalCost: 0,
          },
          {
            date: "2026-04-01",
            input: 1000,
            output: 200,
            cacheRead: 50,
            cacheWrite: 10,
            totalTokens: 1260,
            totalCost: 0.01,
          },
        ],
        totals: {
          input: 30_254_423,
          output: 132_432,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 30_386_855,
          totalCost: 0,
        },
      },
    };

    const html = renderUsageCostRows(state as unknown as DashboardState);
    expect(html).toContain("Total");
    expect(html).toContain("in:30.3M");
    expect(html).toContain("out:132.4k");
    expect(html).toContain("tokens:30.4M");
    // Daily rows (most recent first)
    expect(html).toContain("2026-04-01");
  });

  it("renders usage.status provider quota summaries", () => {
    const state = {
      ...baseState,
      usageStatus: {
        updatedAt: 1712345678000,
        providers: [
          {
            provider: "openai",
            status: "ok",
            used: 1200,
            limit: 10000,
            remaining: 8800,
            resetAt: Date.now() - 60_000,
          },
        ],
      },
    };

    const html = renderUsageCostRows(state as unknown as DashboardState);
    expect(html).toContain("openai");
    expect(html).toContain("used:1.2k");
    expect(html).toContain("remaining:8.8k");
  });

  it("renders empty-state when usage cost is null", () => {
    const html = renderUsageCostRows(baseState as unknown as DashboardState);
    expect(html).toContain("No usage data loaded.");
  });

  it("renders cost when totalCost is non-zero", () => {
    const state = {
      ...baseState,
      usageCost: {
        updatedAt: 0,
        days: 1,
        daily: [],
        totals: {
          input: 1000,
          output: 200,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 1200,
          totalCost: 5.42,
        },
      },
    };

    const html = renderUsageCostRows(state as unknown as DashboardState);
    expect(html).toContain("cost:$5.42");
  });

  // --- renderToolCatalogRows ---

  it("renders tool catalog rows with groups and tool names", () => {
    const state = {
      ...baseState,
      toolsCatalog: {
        agentId: "ceo",
        profiles: [{ id: "default", label: "Default" }],
        groups: [
          {
            id: "fs",
            label: "Files",
            source: "core",
            tools: [
              {
                id: "read",
                label: "Read File",
                description: "Read a file",
                source: "core",
              },
              {
                id: "write",
                label: "Write File",
                description: "Write a file",
                source: "core",
              },
            ],
          },
        ],
      },
    };

    const html = renderToolCatalogRows(state as unknown as DashboardState);
    expect(html).toContain("Files");
    expect(html).toContain("2 tools");
    expect(html).toContain("core");
    expect(html).toContain("Read File");
    expect(html).toContain("Write File");
  });

  it("renders empty-state when tool catalog is null", () => {
    const html = renderToolCatalogRows(baseState as unknown as DashboardState);
    expect(html).toContain("No tool catalog loaded.");
  });

  // --- renderSkillsRows ---

  it("renders skills rows with eligibility badges", () => {
    const state = {
      ...baseState,
      skillsStatus: {
        workspaceDir: "/home/user/project",
        managedSkillsDir: "/home/user/.openclaw/skills",
        skills: [
          {
            name: "git",
            description: "Git ops",
            source: "bundled",
            bundled: true,
            emoji: "🔧",
            always: true,
            disabled: false,
            eligible: true,
            missing: { bins: [], env: [] },
          },
          {
            name: "docker",
            description: "Docker ops",
            source: "community",
            bundled: false,
            eligible: false,
            disabled: false,
            always: false,
            missing: { bins: ["docker"], env: [] },
          },
          {
            name: "disabled-skill",
            description: "Nope",
            source: "custom",
            bundled: false,
            eligible: true,
            disabled: true,
            always: false,
            missing: { bins: [], env: [] },
          },
        ],
      },
    };

    const html = renderSkillsRows(state as unknown as DashboardState);
    expect(html).toContain("Skills");
    expect(html).toContain("2/3 eligible");
    expect(html).toContain("🔧");
    expect(html).toContain("git");
    expect(html).toContain("eligible");
    expect(html).toContain("always");
    expect(html).toContain("disabled");
    // docker is not eligible and not always, so it should not appear as a row
    expect(html).not.toContain("docker");
  });

  it("renders empty-state when skills status is null", () => {
    const html = renderSkillsRows(baseState as unknown as DashboardState);
    expect(html).toContain("No skills data loaded.");
  });

  // --- renderChannelsStatusRows ---

  it("renders channel status rows with account connectivity", () => {
    const state = {
      ...baseState,
      channelsStatus: {
        ts: 1712345678000,
        channelOrder: ["discord"],
        channelLabels: { discord: "Discord" },
        channels: {
          discord: {
            configured: true,
            running: true,
            lastStartAt: 1712345000000,
            lastStopAt: null,
            lastError: null,
          },
        },
        channelAccounts: {
          discord: [
            {
              accountId: "main",
              enabled: true,
              configured: true,
              running: true,
              connected: true,
              lastInboundAt: Date.now() - 5000,
              lastOutboundAt: Date.now() - 10000,
              reconnectAttempts: 0,
              bot: { id: "123", username: "ClawBot" },
              lastStartAt: null,
              lastStopAt: null,
              lastError: null,
            },
          ],
        },
      },
    };

    const html = renderChannelsStatusRows(state as unknown as DashboardState);
    expect(html).toContain("Discord");
    expect(html).toContain("connected");
    expect(html).toContain("bot:ClawBot");
  });

  it("renders channel status with error detail", () => {
    const state = {
      ...baseState,
      channelsStatus: {
        ts: 0,
        channelOrder: ["slack"],
        channelLabels: { slack: "Slack" },
        channels: {
          slack: {
            configured: true,
            running: false,
            lastStartAt: null,
            lastStopAt: null,
            lastError: null,
          },
        },
        channelAccounts: {
          slack: [
            {
              accountId: "default",
              enabled: true,
              configured: true,
              running: false,
              connected: false,
              lastInboundAt: null,
              lastOutboundAt: null,
              reconnectAttempts: 3,
              lastStartAt: null,
              lastStopAt: null,
              lastError: "Token expired",
            },
          ],
        },
      },
    };

    const html = renderChannelsStatusRows(state as unknown as DashboardState);
    expect(html).toContain("Slack");
    expect(html).toContain("disconnected");
    expect(html).toContain("retries:3");
    expect(html).toContain("Token expired");
  });

  it("renders empty-state when channels status is null", () => {
    const html = renderChannelsStatusRows(
      baseState as unknown as DashboardState,
    );
    expect(html).toContain("No channel status loaded.");
  });

  // --- renderCronSchedulerRows ---

  it("renders cron scheduler overview with enabled state and job count", () => {
    const state = {
      ...baseState,
      cronScheduler: {
        enabled: true,
        jobs: 7,
        nextWakeAtMs: Date.now() + 60000,
      },
    };

    const html = renderCronSchedulerRows(state as unknown as DashboardState);
    expect(html).toContain("Scheduler");
    expect(html).toContain("enabled");
    expect(html).toContain("7 jobs");
  });

  it("renders disabled scheduler status", () => {
    const state = {
      ...baseState,
      cronScheduler: { enabled: false, jobs: 0, nextWakeAtMs: null },
    };

    const html = renderCronSchedulerRows(state as unknown as DashboardState);
    expect(html).toContain("disabled");
    expect(html).toContain("no next wake");
  });

  it("renders empty-state when cron scheduler is null", () => {
    const html = renderCronSchedulerRows(
      baseState as unknown as DashboardState,
    );
    expect(html).toContain("No scheduler status loaded.");
  });

  // --- renderMemoryStatusRows ---

  it("renders memory status with embedding and dreaming phases", () => {
    const state = {
      ...baseState,
      memoryStatus: {
        agentId: "ceo",
        provider: "ollama-cloud",
        embedding: { ok: true },
        dreaming: {
          enabled: true,
          phases: {
            light: { enabled: true, cron: "*/5 * * * *" },
            deep: { enabled: false, cron: "0 3 * * *" },
          },
          shortTermCount: 42,
          recallSignalCount: 15,
          totalSignalCount: 200,
          promotedTotal: 50,
          promotedToday: 3,
        },
      },
    };

    const html = renderMemoryStatusRows(state as unknown as DashboardState);
    expect(html).toContain("Embedding");
    expect(html).toContain("agent:ceo");
    expect(html).toContain("provider:ollama-cloud");
    expect(html).toContain("Dreaming");
    expect(html).toContain("signals:200");
    expect(html).toContain("promoted:50");
    expect(html).toContain("today:3");
    expect(html).toContain("light");
    expect(html).toContain("deep");
    expect(html).toContain("*/5 * * * *");
  });

  it("renders embedding failure status", () => {
    const state = {
      ...baseState,
      memoryStatus: {
        agentId: "ops",
        provider: "",
        embedding: { ok: false },
        dreaming: {
          enabled: false,
          phases: {},
          shortTermCount: 0,
          recallSignalCount: 0,
          totalSignalCount: 0,
          promotedTotal: 0,
          promotedToday: 0,
        },
      },
    };

    const html = renderMemoryStatusRows(state as unknown as DashboardState);
    expect(html).toContain("status-error");
    expect(html).toContain("fail");
  });

  it("renders empty-state when memory status is null", () => {
    const html = renderMemoryStatusRows(baseState as unknown as DashboardState);
    expect(html).toContain("No memory status loaded.");
  });

  // --- renderConfigRows ---

  it("renders config rows with key-value pairs", () => {
    const state = {
      ...baseState,
      configData: { port: 18789, debug: false, agents: ["ceo", "ops"] },
    };

    const html = renderConfigRows(state as unknown as DashboardState);
    expect(html).toContain("port");
    expect(html).toContain("18789");
    expect(html).toContain("debug");
    expect(html).toContain("false");
    expect(html).toContain("agents");
  });

  it("renders empty-state when config data is null", () => {
    const html = renderConfigRows(baseState as unknown as DashboardState);
    expect(html).toContain("No config data loaded.");
  });

  it("renders empty-state when config is empty object", () => {
    const state = { ...baseState, configData: {} };
    const html = renderConfigRows(state as unknown as DashboardState);
    expect(html).toContain("Config is empty.");
  });

  // --- renderPermissionActivityRows ---

  it("renders exec.approval.requested events with warn badge", () => {
    const state = {
      ...baseState,
      events: [
        {
          type: "event" as const,
          event: "exec.approval.requested",
          payload: {
            tool: "write_file",
            action: "overwrite",
            ts: 1712345678000,
          },
        },
      ],
    };

    const html = renderPermissionActivityRows(
      state as unknown as DashboardState,
    );
    expect(html).toContain("requested");
    expect(html).toContain("write_file");
    expect(html).toContain("overwrite");
    expect(html).toContain("status-warn");
  });

  it("renders approval resolved events with granted/denied badges", () => {
    const state = {
      ...baseState,
      events: [
        {
          type: "event" as const,
          event: "exec.approval.resolved",
          payload: { tool: "exec_cmd", result: "granted", ts: 1712345679000 },
        },
        {
          type: "event" as const,
          event: "plugin.approval.resolved",
          payload: { tool: "rm_file", result: "denied", ts: 1712345680000 },
        },
      ],
    };

    const html = renderPermissionActivityRows(
      state as unknown as DashboardState,
    );
    expect(html).toContain("granted");
    expect(html).toContain("denied");
    expect(html).toContain("exec_cmd");
    expect(html).toContain("rm_file");
    expect(html).toContain("status-ok");
    expect(html).toContain("status-muted");
  });

  it("renders empty-state when no permission events exist", () => {
    const html = renderPermissionActivityRows(
      baseState as unknown as DashboardState,
    );
    expect(html).toContain("No permission events yet.");
  });

  it("filters only approval events from mixed event stream", () => {
    const state = {
      ...baseState,
      events: [
        { type: "event" as const, event: "heartbeat", payload: { ok: true } },
        {
          type: "event" as const,
          event: "exec.approval.requested",
          payload: { tool: "bash", ts: 1712345678000 },
        },
        {
          type: "event" as const,
          event: "session.tool",
          payload: { tool: "read", ts: 1712345678000 },
        },
      ],
    };

    const html = renderPermissionActivityRows(
      state as unknown as DashboardState,
    );
    expect(html).toContain("bash");
    expect(html).not.toContain("heartbeat");
    expect(html).not.toContain("read");
  });

  // --- renderToolExecutionRows ---

  it("renders session.tool events with running status as warn badge", () => {
    const state = {
      ...baseState,
      events: [
        {
          type: "event" as const,
          event: "session.tool",
          payload: { tool: "read_file", status: "running", ts: 1712345678000 },
        },
      ],
    };

    const html = renderToolExecutionRows(state as unknown as DashboardState);
    expect(html).toContain("running");
    expect(html).toContain("read_file");
    expect(html).toContain("status-warn");
  });

  it("renders session.tool success with ok badge and duration", () => {
    const state = {
      ...baseState,
      events: [
        {
          type: "event" as const,
          event: "session.tool",
          payload: {
            tool: "write_file",
            success: true,
            durationMs: 42,
            ts: 1712345679000,
          },
        },
      ],
    };

    const html = renderToolExecutionRows(state as unknown as DashboardState);
    expect(html).toContain("ok");
    expect(html).toContain("write_file");
    expect(html).toContain("42ms");
    expect(html).toContain("status-ok");
  });

  it("renders session.tool failure with error badge and error text", () => {
    const state = {
      ...baseState,
      events: [
        {
          type: "event" as const,
          event: "session.tool",
          payload: {
            tool: "exec_cmd",
            success: false,
            error: "Command timed out",
            durationMs: 5000,
            ts: 1712345680000,
          },
        },
      ],
    };

    const html = renderToolExecutionRows(state as unknown as DashboardState);
    expect(html).toContain("fail");
    expect(html).toContain("exec_cmd");
    expect(html).toContain("5000ms");
    expect(html).toContain("Command timed out");
    expect(html).toContain("text-terminal-error");
    expect(html).toContain("status-error");
  });

  it("renders empty-state when no tool execution events exist", () => {
    const html = renderToolExecutionRows(
      baseState as unknown as DashboardState,
    );
    expect(html).toContain("No tool executions yet.");
  });

  it("filters only session.tool events from mixed event stream", () => {
    const state = {
      ...baseState,
      events: [
        {
          type: "event" as const,
          event: "exec.approval.requested",
          payload: { tool: "bash" },
        },
        {
          type: "event" as const,
          event: "session.tool",
          payload: { tool: "grep", ts: 1712345678000 },
        },
        {
          type: "event" as const,
          event: "file.edited",
          payload: { path: "/foo" },
        },
      ],
    };

    const html = renderToolExecutionRows(state as unknown as DashboardState);
    expect(html).toContain("grep");
    expect(html).not.toContain("bash");
    expect(html).not.toContain("/foo");
  });

  // --- renderFileTrackingRows ---

  it("renders file status snapshot with modified files", () => {
    const state = {
      ...baseState,
      fileStatus: [
        { path: "src/index.ts", status: "modified", language: "typescript" },
        { path: "README.md", status: "added" },
        { path: "old-file.js", status: "deleted" },
      ],
    };

    const html = renderFileTrackingRows(state as unknown as DashboardState);
    expect(html).toContain("Modified files");
    expect(html).toContain("3 files");
    expect(html).toContain("src/index.ts");
    expect(html).toContain("status-warn"); // modified
    expect(html).toContain("README.md");
    expect(html).toContain("status-ok"); // added
    expect(html).toContain("old-file.js");
    expect(html).toContain("status-error"); // deleted
    expect(html).toContain("typescript");
  });

  it("renders recent file events from SSE stream", () => {
    const state = {
      ...baseState,
      events: [
        {
          type: "event" as const,
          event: "file.edited",
          payload: { path: "src/main.ts", ts: 1712345678000 },
        },
        {
          type: "event" as const,
          event: "file.watcher.updated",
          payload: { path: "package.json", ts: 1712345679000 },
        },
      ],
    };

    const html = renderFileTrackingRows(state as unknown as DashboardState);
    expect(html).toContain("Recent file events");
    expect(html).toContain("2 events");
    expect(html).toContain("src/main.ts");
    expect(html).toContain("edited");
    expect(html).toContain("package.json");
    expect(html).toContain("watcher.updated");
  });

  it("renders both file status and file events together", () => {
    const state = {
      ...baseState,
      fileStatus: [{ path: "src/lib/store.ts", status: "modified" }],
      events: [
        {
          type: "event" as const,
          event: "file.edited",
          payload: { path: "src/lib/store.ts", ts: 1712345678000 },
        },
      ],
    };

    const html = renderFileTrackingRows(state as unknown as DashboardState);
    expect(html).toContain("Modified files");
    expect(html).toContain("Recent file events");
    expect(html).toContain("src/lib/store.ts");
  });

  it("renders empty-state when no file data exists", () => {
    const html = renderFileTrackingRows(baseState as unknown as DashboardState);
    expect(html).toContain("No file changes tracked yet.");
  });

  it("filters only file events from mixed event stream", () => {
    const state = {
      ...baseState,
      events: [
        { type: "event" as const, event: "heartbeat", payload: { ok: true } },
        {
          type: "event" as const,
          event: "file.edited",
          payload: { path: "test.ts", ts: 1712345678000 },
        },
        {
          type: "event" as const,
          event: "exec.approval.requested",
          payload: { tool: "bash" },
        },
      ],
    };

    const html = renderFileTrackingRows(state as unknown as DashboardState);
    expect(html).toContain("test.ts");
    expect(html).not.toContain("heartbeat");
    expect(html).not.toContain("bash");
  });

  // --- renderSessionDetailRows ---

  it("renders session detail rows with enriched data", () => {
    const state = {
      ...baseState,
      sessionDetails: [
        {
          key: "agent:ceo:main",
          agentId: "ceo",
          status: "running",
          displayName: "CEO Main",
          kind: "persistent",
          channel: "discord",
          messageCount: 42,
          tokenCount: 1200,
        },
        {
          key: "agent:ops:deploy",
          agentId: "ops",
          status: "idle",
          displayName: "Ops Deploy",
          kind: "ephemeral",
        },
      ],
    };

    const html = renderSessionDetailRows(state as unknown as DashboardState);
    expect(html).toContain("CEO Main");
    expect(html).toContain("ceo");
    expect(html).toContain("running");
    expect(html).toContain("persistent");
    expect(html).toContain("discord");
    expect(html).toContain("msgs:42");
    expect(html).toContain("tokens:1200");
    expect(html).toContain("Ops Deploy");
    expect(html).toContain("ops");
    expect(html).toContain("idle");
  });

  it("renders empty-state when session details is null", () => {
    const html = renderSessionDetailRows(
      baseState as unknown as DashboardState,
    );
    expect(html).toContain("No session detail data loaded.");
  });

  it("renders empty-state when session details is empty array", () => {
    const state = { ...baseState, sessionDetails: [] };
    const html = renderSessionDetailRows(state as unknown as DashboardState);
    expect(html).toContain("No active sessions.");
  });

  it("truncates session details beyond display limit", () => {
    const sessions = Array.from(
      { length: SESSION_DISPLAY_LIMIT + 5 },
      (_, i) => ({
        key: `s-${i}`,
        agentId: "ceo",
        status: "running",
        displayName: `Session ${i}`,
      }),
    );
    const state = { ...baseState, sessionDetails: sessions };
    const html = renderSessionDetailRows(state as unknown as DashboardState);
    expect(html).toContain("Session 0");
    expect(html).toContain("and");
    expect(html).toContain("more");
  });

  // --- Coverage gap: channel status with zero accounts (lines 608-609) ---

  it('renders channel with no accounts showing "no accounts" label', () => {
    const state = {
      ...baseState,
      channelsStatus: {
        ts: 0,
        channelOrder: ["telegram"],
        channelLabels: { telegram: "Telegram" },
        channels: {
          telegram: {
            configured: true,
            running: true,
            lastStartAt: null,
            lastStopAt: null,
            lastError: null,
          },
        },
        channelAccounts: { telegram: [] },
      },
    };

    const html = renderChannelsStatusRows(state as unknown as DashboardState);
    expect(html).toContain("Telegram");
    expect(html).toContain("running");
    expect(html).toContain("no accounts");
  });

  it('renders channel with missing accounts key as "no accounts"', () => {
    const state = {
      ...baseState,
      channelsStatus: {
        ts: 0,
        channelOrder: ["irc"],
        channelLabels: { irc: "IRC" },
        channels: {
          irc: {
            configured: true,
            running: false,
            lastStartAt: null,
            lastStopAt: null,
            lastError: null,
          },
        },
        channelAccounts: {},
      },
    };

    const html = renderChannelsStatusRows(state as unknown as DashboardState);
    expect(html).toContain("IRC");
    expect(html).toContain("stopped");
    expect(html).toContain("no accounts");
  });

  // --- Coverage gap: file tracking with >20 files overflow (line 879) ---

  it("shows overflow message when file status has more than 20 files", () => {
    const files = Array.from({ length: 25 }, (_, i) => ({
      path: `src/file-${i}.ts`,
      status: "modified",
    }));
    const state = { ...baseState, fileStatus: files };

    const html = renderFileTrackingRows(state as unknown as DashboardState);
    expect(html).toContain("25 files");
    expect(html).toContain("src/file-0.ts");
    expect(html).toContain("src/file-19.ts");
    // Should show overflow
    expect(html).toContain("and 5 more files");
    // Should NOT render file 20+
    expect(html).not.toContain("src/file-20.ts");
  });

  // --- Agent progress cards (gateway >= 2026.9) ---

  describe("normalizeProgressCard", () => {
    it("normalizes a valid card payload", () => {
      const card = normalizeProgressCard(
        {
          sessionKey: "agent:ceo:main",
          agentId: "ceo",
          title: "Migration work",
          steps: [
            { step: "pull main", status: "completed" },
            { step: "fix deps", status: "in_progress" },
            { step: "run tests", status: "pending" },
          ],
          updatedAt: "2026-09-14T17:00:00Z",
        },
        "agent:ceo:main",
      );
      expect(card).not.toBeNull();
      expect(card?.sessionKey).toBe("agent:ceo:main");
      expect(card?.agentId).toBe("ceo");
      expect(card?.title).toBe("Migration work");
      expect(card?.steps).toHaveLength(3);
      expect(card?.steps[1]).toEqual({
        step: "fix deps",
        status: "in_progress",
      });
    });

    it("falls back to the caller-supplied session key", () => {
      const card = normalizeProgressCard({ steps: [] }, "agent:ops:main");
      expect(card?.sessionKey).toBe("agent:ops:main");
    });

    it("skips malformed step entries and defaults unknown statuses to pending", () => {
      const card = normalizeProgressCard(
        {
          sessionKey: "agent:ceo:main",
          steps: [
            { step: "valid", status: "completed" },
            "garbage",
            null,
            { status: "in_progress" }, // no step name — skipped
            { step: "weird status", status: "bananas" },
          ],
        },
        "agent:ceo:main",
      );
      expect(card?.steps).toHaveLength(2);
      expect(card?.steps[0]).toEqual({ step: "valid", status: "completed" });
      expect(card?.steps[1]).toEqual({
        step: "weird status",
        status: "pending",
      });
    });

    it("returns null when no usable session key exists", () => {
      expect(normalizeProgressCard({ steps: [] })).toBeNull();
      expect(normalizeProgressCard(null, "")).toBeNull();
    });

    it("tolerates absent optional fields", () => {
      const card = normalizeProgressCard(
        {
          sessionKey: "agent:ceo:main",
          steps: [{ step: "only step", status: "completed" }],
        },
        "agent:ceo:main",
      );
      expect(card?.agentId).toBeUndefined();
      expect(card?.title).toBeUndefined();
      expect(card?.updatedAt).toBeUndefined();
    });
  });

  describe("renderProgressCardRows", () => {
    const card: ProgressCard = {
      sessionKey: "agent:ceo:main",
      title: "Migration work",
      steps: [
        { step: "pull main", status: "completed" },
        { step: "fix deps", status: "in_progress" },
        { step: "run tests", status: "pending" },
      ],
    };

    it("renders title, progress bar, and the in-progress step", () => {
      const html = renderProgressCardRows({ "agent:ceo:main": card }, []);
      expect(html).toContain("Migration work");
      expect(html).toContain("1/3");
      expect(html).toContain("fix deps");
    });

    it("shows the live marker only for sessions in activeRunIds", () => {
      const html = renderProgressCardRows({ "agent:ceo:main": card }, [
        "agent:ceo:main",
      ]);
      expect(html).toContain("● live");

      const htmlInactive = renderProgressCardRows(
        { "agent:ceo:main": card },
        [],
      );
      expect(htmlInactive).not.toContain("● live");
    });

    it("renders an empty-state row when no cards exist", () => {
      const html = renderProgressCardRows({}, null);
      expect(html).toContain("No progress cards loaded.");
    });

    it("falls back to sessionKey when the card has no title", () => {
      const untitled: ProgressCard = {
        sessionKey: "agent:pfy:main",
        steps: [],
      };
      const html = renderProgressCardRows({ "agent:pfy:main": untitled }, null);
      expect(html).toContain("agent:pfy:main");
    });
  });

  // --- Phase 3 panels (gateway >= 2026.9, method-gated) ---

  describe("normalizeTaskLedger", () => {
    it("normalizes a valid tasks.list payload", () => {
      const rows = normalizeTaskLedger([
        {
          id: "t1",
          name: "Deploy gateway",
          status: "running",
          priority: "high",
        },
        { id: "t2", title: "Review PRs", status: "pending" },
      ]);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        id: "t1",
        name: "Deploy gateway",
        status: "running",
        priority: "high",
      });
      expect(rows[1]).toEqual({
        id: "t2",
        name: "Review PRs",
        title: "Review PRs",
        status: "pending",
      });
    });

    it("tolerates object-wrapped payloads and skips malformed entries", () => {
      const rows = normalizeTaskLedger({
        tasks: ["garbage", { id: "t1", status: "done" }],
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe("done");
    });

    it("falls back id -> name -> title and drops empty optionals", () => {
      const rows = normalizeTaskLedger([
        { title: "Only title", status: "queued" },
      ]);
      expect(rows[0]?.id).toBe("Only title");
      expect(rows[0]?.name).toBe("Only title"); // name falls back to title
      expect(rows[0]?.priority).toBeUndefined();
    });
  });

  describe("renderTaskLedgerRows", () => {
    it("renders tasks with status badges and empty state", () => {
      const html = renderTaskLedgerRows([
        { id: "t1", name: "Deploy", status: "running" },
        { id: "t2", name: "Fix", status: "blocked" },
      ]);
      expect(html).toContain("Deploy");
      expect(html).toContain("running");
      expect(html).toContain("Fix");
    });

    it("renders empty state for null", () => {
      expect(renderTaskLedgerRows(null)).toContain("No task data loaded.");
    });
  });

  describe("normalizeUsageTimeseries + renderUsageTimeseriesRows", () => {
    it("normalizes ts/tokens/cost with date fallback and malformed skip", () => {
      const buckets = normalizeUsageTimeseries({
        timeseries: [
          { ts: "2026-09-14", tokens: 1200, cost: 0.5 },
          { date: "2026-09-13" },
          "garbage",
        ],
      });
      expect(buckets).toHaveLength(2);
      expect(buckets[0]).toEqual({ ts: "2026-09-14", tokens: 1200, cost: 0.5 });
      expect(buckets[1]?.ts).toBe("2026-09-13");
    });

    it("renders newest-last, capped at 30 with overflow note", () => {
      const many = Array.from({ length: 35 }, (_, i) => ({
        ts: `d-${i}`,
        tokens: i,
        cost: i,
      }));
      const html = renderUsageTimeseriesRows(many);
      expect(html).toContain("oldest 5 buckets hidden");
      expect(html).not.toContain("d-0<");
    });

    it("renders empty state for null", () => {
      expect(renderUsageTimeseriesRows(null)).toContain(
        "No usage timeseries data loaded.",
      );
    });
  });

  describe("normalizeNodeFleet + renderNodeFleetRows", () => {
    it("normalizes nodes with hostStats", () => {
      const nodes = normalizeNodeFleet({
        nodes: [
          {
            nodeId: "n1",
            name: "lorica",
            platform: "linux",
            version: "2026.9.4",
            connected: true,
            hostStats: {
              cpuCount: 16,
              memoryTotalBytes: 32_000_000_000,
              memoryFreeBytes: 16_000_000_000,
            },
          },
          { name: "keryx", connected: false },
        ],
      });
      expect(nodes).toHaveLength(2);
      expect(nodes[0]?.hostStats).toBeDefined();
      expect(nodes[1]?.connected).toBe(false);
    });

    it("renders connected/offline badges and memory detail", () => {
      const html = renderNodeFleetRows([
        {
          nodeId: "n1",
          name: "lorica",
          platform: "linux",
          connected: true,
          hostStats: {
            cpuCount: 16,
            memoryTotalBytes: 32_000_000_000,
            memoryFreeBytes: 16_000_000_000,
          },
        },
      ]);
      expect(html).toContain("lorica");
      expect(html).toContain("connected");
      expect(html).toContain("mem:");
    });

    it("renders empty state for null", () => {
      expect(renderNodeFleetRows(null)).toContain("No node fleet data loaded.");
    });
  });

  describe("normalizeStability + renderStabilityRows", () => {
    it("returns undefined for unparseable shapes, rows for valid", () => {
      expect(normalizeStability("garbage")).toBeUndefined();
      const entries = normalizeStability({
        entries: [{ kind: "restart", ts: "t1", summary: "gateway restarted" }],
      });
      expect(entries).toHaveLength(1);
      expect(entries?.[0]?.kind).toBe("restart");
    });

    it("renders stability feed entries", () => {
      const html = renderStabilityRows([
        { ts: "t1", kind: "restart", summary: "gateway restarted" },
      ]);
      expect(html).toContain("restart");
      expect(html).toContain("gateway restarted");
    });

    it("renders unavailable state for undefined", () => {
      expect(renderStabilityRows(undefined)).toContain(
        "Stability data unavailable.",
      );
    });
  });

  describe("normalizeAuditTimeline + renderAuditTimelineRows", () => {
    it("normalizes entries with actor fallback and outcome", () => {
      const rows = normalizeAuditTimeline({
        activity: [
          {
            ts: "t1",
            agentId: "ceo",
            action: "merge",
            target: "PR #93",
            outcome: "ok",
          },
          { ts: "t2", action: "deploy" },
        ],
      });
      expect(rows).toHaveLength(2);
      expect(rows[0]?.actor).toBe("ceo");
      expect(rows[0]?.target).toBe("PR #93");
      expect(rows[1]?.actor).toBeUndefined();
    });

    it("renders timeline with outcome badge and target detail", () => {
      const html = renderAuditTimelineRows([
        { ts: "t1", actor: "ceo", action: "merge", outcome: "ok" },
      ]);
      expect(html).toContain("merge");
      expect(html).toContain("ok");
    });

    it("renders empty state for null", () => {
      expect(renderAuditTimelineRows(null)).toContain("No audit data loaded.");
    });
  });

  describe("normalizeConfigSchema + renderConfigSchemaRows", () => {
    it("normalizes schema map skipping malformed values", () => {
      const schema = normalizeConfigSchema({
        "gateway.port": { type: "number", description: "Gateway port" },
        "bad.entry": "garbage",
      });
      expect(Object.keys(schema ?? {})).toEqual(["gateway.port"]);
      expect(schema?.["gateway.port"]?.type).toBe("number");
    });

    it("renders schema entries alphabetically", () => {
      const html = renderConfigSchemaRows({
        "zzz.key": { type: "string" },
        "aaa.key": { type: "number", description: "first alphabetically" },
      });
      expect(html).toContain("aaa.key");
      expect(html).toContain("zzz.key");
      expect(html.indexOf("aaa.key")).toBeLessThan(html.indexOf("zzz.key"));
    });

    it("renders empty state for null", () => {
      expect(renderConfigSchemaRows(null)).toContain(
        "No config schema data loaded.",
      );
    });
  });

  describe("normalizeSkillProposals + renderSkillProposalRows", () => {
    it("normalizes proposals with verdict fallback and unknown status", () => {
      const proposals = normalizeSkillProposals({
        proposals: [
          { id: "p1", status: "pending", author: "pfy", verdict: "clean" },
          { name: "p2", status: "weird", securityVerdict: "flagged" },
        ],
      });
      expect(proposals).toHaveLength(2);
      expect(proposals[0]).toEqual({
        id: "p1",
        status: "pending",
        author: "pfy",
        verdict: "clean",
      });
      expect(proposals[1]?.status).toBe("unknown");
      expect(proposals[1]?.verdict).toBe("flagged");
    });

    it("renders proposals with status badges", () => {
      const html = renderSkillProposalRows([
        { id: "p1", status: "pending", author: "pfy" },
      ]);
      expect(html).toContain("p1");
      expect(html).toContain("pending");
    });

    it("renders empty state for null and for empty queue", () => {
      expect(renderSkillProposalRows(null)).toContain(
        "No skill proposals loaded.",
      );
      expect(renderSkillProposalRows([])).toContain(
        "No pending skill proposals.",
      );
    });
  });

  describe("formatBytesToGb boundary branches", () => {
    it("formats small values with one decimal, large rounded, invalid as n/a", async () => {
      const { formatBytesToGb } = await import("./adapters");
      expect(formatBytesToGb(500_000_000)).toBe("0.5GB");
      expect(formatBytesToGb(150_000_000_000)).toBe("150GB");
      expect(formatBytesToGb(-1)).toBe("n/a");
      expect(formatBytesToGb("x")).toBe("n/a");
      expect(formatBytesToGb(Number.NaN)).toBe("n/a");
    });
  });

  describe("normalizeConfigSchema extra branches", () => {
    it("rejects array payloads and keeps default passthrough", () => {
      expect(normalizeConfigSchema(["array"])).toBeUndefined();
      const schema = normalizeConfigSchema({
        "key.with.default": { type: "string", default: "abc", path: "a.b" },
        skipped: null,
      });
      expect(schema?.["key.with.default"]).toEqual({
        type: "string",
        default: "abc",
        path: "a.b",
      });
      expect(schema?.skipped).toBeUndefined();
    });

    it("returns undefined for non-object payloads", () => {
      expect(normalizeConfigSchema("x")).toBeUndefined();
      expect(normalizeConfigSchema(null)).toBeUndefined();
    });
  });
});
