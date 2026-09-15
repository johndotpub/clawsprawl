import type {
  AgentSummary,
  ChannelsStatusResponse,
  ConfigResponse,
  CronJobSummary,
  CronRunEntry,
  CronSchedulerStatus,
  FileStatusEntry,
  GatewayStatus,
  HealthResponse,
  MemoryStatusResponse,
  ModelInfo,
  PresenceEntry,
  ProgressCard,
  AuditTimelineEntry,
  ConfigSchemaEntry,
  NodeFleetEntry,
  SessionDetailEntry,
  SkillProposalEntry,
  StabilityEntry,
  TaskLedgerEntry,
  UsageTimeseriesEntry,
  SessionSummary,
  SkillsStatusResponse,
  ToolsCatalogResponse,
  UsageCostResponse,
  UsageStatusResponse,
} from "../gateway/types";

/** Per-provider health summary derived from live model data. */
export interface ProviderHealthSummary {
  provider: string;
  modelCount: number;
  /** Always `'healthy'` — models.list provides no error/degraded signals. */
  status: "healthy";
}

/** Coerce `value` to an array, returning an empty array if it is not one. */
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Coerce `value` to a plain object record, returning an empty record if it is not one. */
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Return `value` as a string if it is one, otherwise return `fallback`.
 *
 * @param value - The value to check.
 * @param fallback - Default string returned when `value` is not a string.
 * @returns `value` if it is a string, otherwise `fallback`.
 */
export function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * Return `value` as a number if it is one, otherwise return `fallback`.
 *
 * @param value - The value to check.
 * @param fallback - Default number returned when `value` is not a number.
 * @returns `value` if it is a number, otherwise `fallback`.
 */
export function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

/** Return `value` as a number if it is one, otherwise `null`. */
function asNumberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/** Return `value` as a string if it is one, otherwise `null`. */
function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Build an optional spread object `{ [key]: value }` when `value` is a string.
 * Returns `{}` when `value` is not a string, so it vanishes in a spread.
 *
 * @param key - Object key to produce.
 * @param value - Value to check — included only when it is a string.
 * @returns `{ [key]: value }` or `{}`.
 */
function optionalString<K extends string>(
  key: K,
  value: unknown,
): { [P in K]?: string } {
  return typeof value === "string"
    ? ({ [key]: value } as { [P in K]?: string })
    : ({} as { [P in K]?: string });
}

/**
 * Build an optional spread object `{ [key]: value }` when `value` is a number.
 * Returns `{}` when `value` is not a number, so it vanishes in a spread.
 *
 * @param key - Object key to produce.
 * @param value - Value to check — included only when it is a number.
 * @returns `{ [key]: value }` or `{}`.
 */
function optionalNumber<K extends string>(
  key: K,
  value: unknown,
): { [P in K]?: number } {
  return typeof value === "number"
    ? ({ [key]: value } as { [P in K]?: number })
    : ({} as { [P in K]?: number });
}

/**
 * Unwrap a gateway response envelope.
 *
 * Many gateway RPC responses wrap their payload in `{ [key]: [...] }`.
 * This helper extracts the inner array from the named property, falling
 * back to treating the payload as a bare array for backwards compat.
 */
function unwrapEnvelope(payload: unknown, key: string): unknown[] {
  const record = asRecord(payload);
  return asArray(record[key] ?? payload);
}

/**
 * Normalize agents.list response.
 *
 * The native gateway returns `{ defaultId, mainKey, scope, agents: [...] }`.
 * We also tolerate a bare array for backwards compat with test fixtures.
 *
 * @param payload - Raw gateway response to normalize.
 * @returns Normalized array of agent summaries.
 */
export function normalizeAgents(payload: unknown): AgentSummary[] {
  // Native protocol: { agents: [...] }
  const source = unwrapEnvelope(payload, "agents");
  return source
    .map((entry) => asRecord(entry))
    .map((entry, index) => ({
      id: asString(entry.id, `agent-${index}`),
      ...optionalString("name", entry.name),
      ...(entry.model !== undefined ? { model: entry.model } : {}),
      ...optionalString("workspace", entry.workspace),
    })) as AgentSummary[];
}

/**
 * Extract defaultId from agents.list response. @internal
 *
 * @param payload - Raw gateway response containing agent metadata.
 * @returns The default agent ID string, or `undefined` if absent.
 */
export function extractDefaultAgentId(payload: unknown): string | undefined {
  const record = asRecord(payload);
  return typeof record.defaultId === "string" ? record.defaultId : undefined;
}

/**
 * Normalize sessions.list response.
 *
 * The native gateway returns `{ ts, path, count, defaults, sessions: [...] }`.
 * We also tolerate a bare array for backwards compat.
 *
 * @param payload - Raw gateway response to normalize.
 * @returns Normalized array of session summaries.
 */
export function normalizeSessions(payload: unknown): SessionSummary[] {
  const source = unwrapEnvelope(payload, "sessions");
  return source.map((entry, index) => {
    const rec = asRecord(entry);
    // The native protocol uses 'key' as the unique ID, not 'id'
    const key = asString(rec.key, asString(rec.id, `session-${index}`));
    // Extract agentId from the key if not explicit (e.g. "agent:ceo:main" → "ceo")
    const agentId = asString(
      rec.agentId,
      key.startsWith("agent:") ? (key.split(":")[1] ?? "unknown") : "unknown",
    );
    return {
      ...rec,
      key,
      agentId,
      ...optionalString("displayName", rec.displayName),
      ...optionalString("channel", rec.channel),
      ...(rec.updatedAt !== undefined
        ? { updatedAt: rec.updatedAt as number }
        : {}),
    };
  });
}

/**
 * Extract session count from sessions.list response. @internal
 *
 * @param payload - Raw gateway response containing session metadata.
 * @returns The session count, or `0` if absent.
 */
export function extractSessionCount(payload: unknown): number {
  const record = asRecord(payload);
  return typeof record.count === "number" ? record.count : 0;
}

/**
 * Normalize cron.list response.
 *
 * The native gateway returns `{ jobs: [...] }`.
 * We also tolerate a bare array.
 *
 * @param payload - Raw gateway response to normalize.
 * @returns Normalized array of cron job summaries.
 */
export function normalizeCronJobs(payload: unknown): CronJobSummary[] {
  const source = unwrapEnvelope(payload, "jobs");
  return source.map((entry, index) => {
    const rec = asRecord(entry);
    return {
      ...rec,
      id: asString(rec.id, `cron-job-${index}`),
      name: asString(rec.name, `cron-job-${index}`),
      ...(rec.enabled !== undefined ? { enabled: Boolean(rec.enabled) } : {}),
      ...(rec.schedule ? { schedule: rec.schedule } : {}),
    };
  }) as CronJobSummary[];
}

/**
 * Normalize cron.runs response.
 *
 * The native gateway returns `{ entries: [...] }`.
 * We also tolerate a bare array.
 *
 * @param payload - Raw gateway response to normalize.
 * @returns Normalized array of cron run entries.
 */
export function normalizeCronRuns(payload: unknown): CronRunEntry[] {
  if (Array.isArray(payload))
    return payload.map((entry) => ({ ...asRecord(entry) })) as CronRunEntry[];
  const source = unwrapEnvelope(payload, "entries");
  return source.map((entry) => ({ ...asRecord(entry) })) as CronRunEntry[];
}

/**
 * Normalize models.list response.
 *
 * The native gateway returns `{ models: [...] }`.
 * We also tolerate a bare array.
 *
 * @param payload - Raw gateway response to normalize.
 * @returns Normalized array of model info objects.
 */
export function normalizeModels(payload: unknown): ModelInfo[] {
  const source = unwrapEnvelope(payload, "models");
  return source.map((entry) => {
    const rec = asRecord(entry);
    const id = asString(rec.id, asString(rec.name, ""));
    const provider =
      asString(rec.provider, id.includes("/") ? id.split("/")[0] : "") ||
      undefined;

    return {
      ...rec,
      ...(id ? { id } : {}),
      ...(rec.name ? { name: String(rec.name) } : {}),
      ...(provider ? { provider } : {}),
      ...(rec.contextWindow !== undefined
        ? { contextWindow: Number(rec.contextWindow) }
        : {}),
      ...(rec.reasoning !== undefined
        ? { reasoning: Boolean(rec.reasoning) }
        : {}),
    };
  }) as ModelInfo[];
}

/**
 * Count the number of sessions attributed to each agent.
 *
 * @param sessions - Array of session summaries to aggregate.
 * @returns Map from agent ID to session count.
 */
export function countSessionsByAgent(
  sessions: SessionSummary[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    const agentId = asString(session.agentId, "unknown");
    counts.set(agentId, (counts.get(agentId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Format an event frame as a compact preview string for the Activity Feed.
 *
 * @param event - Raw event object to format.
 * @returns A compact single-line preview string.
 */
export function formatEventPreview(event: unknown): string {
  const record = asRecord(event);
  const name = asString(record.event, "event");
  const payload = "payload" in record ? record.payload : null;
  const raw = payload ? JSON.stringify(payload) : "no payload";
  const payloadText = raw.length > 120 ? `${raw.slice(0, 120)}…` : raw;
  return `${name}: ${payloadText}`;
}

/**
 * Derive provider health purely from live model data.
 * No expectedProviders — only providers that actually responded to models.list appear.
 *
 * @param models - Array of model info objects from the gateway.
 * @returns Sorted array of per-provider health summaries.
 */
export function summarizeProviderHealth(
  models: ModelInfo[],
): ProviderHealthSummary[] {
  const counts = new Map<string, number>();

  for (const model of models) {
    const provider = asString(model.provider, "unknown");
    counts.set(provider, (counts.get(provider) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([provider, modelCount]) => ({
      provider,
      modelCount,
      status: "healthy" as const,
    }));
}

/**
 * Return the first (latest) run for each unique job ID or name.
 * Assumes `runs` is pre-sorted newest-first — the first match per key wins.
 *
 * @param runs - Pre-sorted array of cron run entries (newest first).
 * @returns Map from job key to the latest cron run entry.
 */
export function latestCronRunsByJob(
  runs: CronRunEntry[],
): Map<string, CronRunEntry> {
  const map = new Map<string, CronRunEntry>();

  for (const run of runs) {
    const key = asString(
      run.jobId,
      asString(run.name, asString(run.jobName, "")),
    );
    if (key && !map.has(key)) {
      map.set(key, run);
    }
  }

  return map;
}

/**
 * Extract a human-readable error message from a cron run entry.
 *
 * @param run - The cron run entry to inspect, or `undefined`.
 * @returns A trimmed error string, or an empty string if no error is found.
 */
export function extractCronRunError(run: CronRunEntry | undefined): string {
  if (!run) {
    return "";
  }

  if (typeof run.error === "string" && run.error.trim().length > 0) {
    return run.error.trim();
  }

  const nested = run.error as Record<string, unknown> | undefined;
  if (
    nested &&
    typeof nested.message === "string" &&
    nested.message.trim().length > 0
  ) {
    return nested.message.trim();
  }

  return "";
}

/**
 * Normalize health response payload.
 *
 * The gateway returns a rich health object. We pass it through with
 * minimal transformation — just ensure the top-level shape is valid.
 *
 * @param payload - Raw gateway health response to normalize.
 * @returns Normalized health response object.
 */
export function normalizeHealth(payload: unknown): HealthResponse {
  const record = asRecord(payload);
  return {
    ok: record.ok === true,
    ts: asNumber(record.ts, 0),
    ...optionalNumber("durationMs", record.durationMs),
    ...(record.channels
      ? { channels: record.channels as Record<string, unknown> }
      : {}),
    ...(Array.isArray(record.channelOrder)
      ? { channelOrder: record.channelOrder as string[] }
      : {}),
    ...(record.channelLabels
      ? { channelLabels: record.channelLabels as Record<string, string> }
      : {}),
    ...optionalNumber("heartbeatSeconds", record.heartbeatSeconds),
    ...optionalString("defaultAgentId", record.defaultAgentId),
    ...(Array.isArray(record.agents) ? { agents: record.agents } : {}),
  };
}

/**
 * Normalize status response to GatewayStatus.
 *
 * The gateway returns tasks, taskAudit, sessions, heartbeat, channelSummary, etc.
 *
 * @param payload - Raw gateway status response to normalize.
 * @returns Normalized gateway status object.
 */
export function normalizeStatus(payload: unknown): GatewayStatus {
  const record = asRecord(payload);
  return {
    ok: true,
    ...optionalString("runtimeVersion", record.runtimeVersion),
    ...(record.tasks ? { tasks: record.tasks as GatewayStatus["tasks"] } : {}),
    ...(record.taskAudit
      ? { taskAudit: record.taskAudit as GatewayStatus["taskAudit"] }
      : {}),
    ...(Array.isArray(record.channelSummary)
      ? { channelSummary: record.channelSummary as string[] }
      : {}),
    ...(record.sessions
      ? { sessions: normalizeStatusSessions(record.sessions) }
      : {}),
    ...(record.heartbeat
      ? { heartbeat: record.heartbeat as GatewayStatus["heartbeat"] }
      : {}),
  };
}

function normalizeStatusSessions(payload: unknown): GatewayStatus["sessions"] {
  const record = asRecord(payload);
  const byAgent = asArray(record.byAgent).map((entry) => {
    const rec = asRecord(entry);
    return {
      agentId: asString(rec.agentId, "unknown"),
      count: asNumber(rec.count, 0),
      ...optionalString("path", rec.path),
    };
  });
  return {
    count: asNumber(record.count, 0),
    ...(byAgent.length > 0 ? { byAgent } : {}),
    ...(record.defaults
      ? { defaults: record.defaults as Record<string, unknown> }
      : {}),
  };
}

/**
 * Normalize presence entries from the HelloOk snapshot.
 *
 * @param payload - Raw presence array from the gateway.
 * @returns Normalized array of presence entries.
 */
export function normalizePresence(payload: unknown): PresenceEntry[] {
  return asArray(payload).map((entry) => {
    const rec = asRecord(entry);
    return {
      ts: asNumber(rec.ts, 0),
      ...optionalString("host", rec.host),
      ...optionalString("ip", rec.ip),
      ...optionalString("version", rec.version),
      ...optionalString("platform", rec.platform),
      ...optionalString("deviceFamily", rec.deviceFamily),
      ...optionalString("mode", rec.mode),
      ...optionalString("reason", rec.reason),
      ...optionalString("text", rec.text),
      ...(Array.isArray(rec.roles) ? { roles: rec.roles as string[] } : {}),
      ...(Array.isArray(rec.scopes) ? { scopes: rec.scopes as string[] } : {}),
      ...optionalString("instanceId", rec.instanceId),
    };
  });
}

/**
 * Extract channel health summaries from the health response.
 * Returns a flat array of { channel, label, ok, probeMs, botUsername } objects.
 */
export interface ChannelHealthSummary {
  channel: string;
  label: string;
  configured: boolean;
  running: boolean;
  probeOk: boolean;
  probeMs: number | null;
  botUsername: string | null;
  lastError: string | null;
}

/**
 * Extract channel health summaries from a health response.
 *
 * @param health - The normalized health response, or `null`.
 * @returns Flat array of per-channel health summary objects.
 */
export function extractChannelHealth(
  health: HealthResponse | null,
): ChannelHealthSummary[] {
  if (!health?.channels) return [];

  const order = health.channelOrder ?? Object.keys(health.channels);
  const labels = health.channelLabels ?? {};

  return order.map((channel) => {
    const data = asRecord(
      (health.channels as Record<string, unknown>)?.[channel],
    );
    const probe = asRecord(data.probe);
    const bot = asRecord(probe.bot);
    return {
      channel,
      label: labels[channel] ?? channel,
      configured: data.configured === true,
      running: data.running === true,
      probeOk: probe.ok === true,
      probeMs: asNumberOrNull(probe.elapsedMs),
      botUsername: asStringOrNull(bot.username),
      lastError: asStringOrNull(data.lastError),
    };
  });
}

// ---------------------------------------------------------------------------
// Extended data normalizers — new dashboard panels
// ---------------------------------------------------------------------------

/**
 * Normalize `usage.cost` response into {@link UsageCostResponse}.
 * Returns safe defaults if the payload is missing or malformed.
 *
 * @param payload - Raw gateway usage cost response to normalize.
 * @returns Normalized usage cost response with daily breakdown and totals.
 */
export function normalizeUsageCost(payload: unknown): UsageCostResponse {
  const record = asRecord(payload);
  const daily = asArray(record.daily).map((entry) => {
    const rec = asRecord(entry);
    return {
      date: asString(rec.date, ""),
      input: asNumber(rec.input, 0),
      output: asNumber(rec.output, 0),
      cacheRead: asNumber(rec.cacheRead, 0),
      cacheWrite: asNumber(rec.cacheWrite, 0),
      totalTokens: asNumber(rec.totalTokens, 0),
      totalCost: asNumber(rec.totalCost, 0),
    };
  });
  const totals = asRecord(record.totals);
  return {
    updatedAt: asNumber(record.updatedAt, 0),
    days: asNumber(record.days, daily.length),
    daily,
    totals: {
      input: asNumber(totals.input, 0),
      output: asNumber(totals.output, 0),
      cacheRead: asNumber(totals.cacheRead, 0),
      cacheWrite: asNumber(totals.cacheWrite, 0),
      totalTokens: asNumber(totals.totalTokens, 0),
      totalCost: asNumber(totals.totalCost, 0),
    },
  };
}

/**
 * Normalize `usage.status` response into {@link UsageStatusResponse}.
 *
 * The upstream shape can vary by provider/runtime; this normalizer extracts a
 * stable per-provider summary for dashboard display.
 *
 * @param payload - Raw gateway usage status response to normalize.
 * @returns Normalized provider usage summary payload.
 */
export function normalizeUsageStatus(payload: unknown): UsageStatusResponse {
  const record = asRecord(payload);

  const sourceRows = Array.isArray(record.providers)
    ? record.providers
    : Array.isArray(record.status)
      ? record.status
      : Array.isArray(record.windows)
        ? record.windows
        : [];

  const providers = sourceRows
    .map((entry) => {
      const rec = asRecord(entry);
      const provider = asString(
        rec.provider,
        asString(rec.name, asString(rec.id, "")),
      ).trim();
      if (!provider) return null;

      const used = asNumberOrNull(rec.used ?? rec.current ?? rec.consumed);
      const limit = asNumberOrNull(rec.limit ?? rec.max ?? rec.quota);
      const remaining = asNumberOrNull(rec.remaining ?? rec.left);
      const resetAt = asNumberOrNull(
        rec.resetAt ?? rec.resetAtMs ?? rec.windowEndsAt,
      );
      const status = asString(
        rec.status,
        remaining !== null && remaining <= 0 ? "exhausted" : "ok",
      );

      return {
        provider,
        status,
        used,
        limit,
        remaining,
        resetAt,
      };
    })
    .filter(
      (entry): entry is UsageStatusResponse["providers"][number] =>
        entry !== null,
    );

  return {
    updatedAt: asNumber(record.updatedAt ?? record.ts, Date.now()),
    providers,
  };
}

/**
 * Normalize `tools.catalog` response into {@link ToolsCatalogResponse}.
 *
 * @param payload - Raw gateway tools catalog response to normalize.
 * @returns Normalized tools catalog with profiles and grouped tools.
 */
export function normalizeToolsCatalog(payload: unknown): ToolsCatalogResponse {
  const record = asRecord(payload);
  const groups = asArray(record.groups).map((group) => {
    const g = asRecord(group);
    const tools = asArray(g.tools).map((tool) => {
      const t = asRecord(tool);
      return {
        id: asString(t.id, ""),
        label: asString(t.label, ""),
        description: asString(t.description, ""),
        source: asString(t.source, ""),
        ...(Array.isArray(t.defaultProfiles)
          ? { defaultProfiles: t.defaultProfiles as string[] }
          : {}),
      };
    });
    return {
      id: asString(g.id, ""),
      label: asString(g.label, ""),
      source: asString(g.source, ""),
      tools,
    };
  });
  return {
    agentId: asString(record.agentId, ""),
    profiles: asArray(record.profiles).map((p) => {
      const pr = asRecord(p);
      return { id: asString(pr.id, ""), label: asString(pr.label, "") };
    }),
    groups,
  };
}

/**
 * Normalize `skills.status` response into {@link SkillsStatusResponse}.
 *
 * @param payload - Raw gateway skills status response to normalize.
 * @returns Normalized skills status with workspace info and skill entries.
 */
export function normalizeSkillsStatus(payload: unknown): SkillsStatusResponse {
  const record = asRecord(payload);
  const skills = asArray(record.skills).map((entry) => {
    const rec = asRecord(entry);
    const missing = asRecord(rec.missing);
    return {
      name: asString(rec.name, ""),
      description: asString(rec.description, ""),
      source: asString(rec.source, ""),
      bundled: rec.bundled === true,
      ...optionalString("emoji", rec.emoji),
      ...optionalString("homepage", rec.homepage),
      always: rec.always === true,
      disabled: rec.disabled === true,
      eligible: rec.eligible === true,
      missing: {
        bins: asArray(missing.bins).map(String),
        env: asArray(missing.env).map(String),
      },
    };
  });
  return {
    workspaceDir: asString(record.workspaceDir, ""),
    managedSkillsDir: asString(record.managedSkillsDir, ""),
    skills,
  };
}

/**
 * Normalize `channels.status` response into {@link ChannelsStatusResponse}.
 *
 * @param payload - Raw gateway channels status response to normalize.
 * @returns Normalized channels status with per-channel details and accounts.
 */
export function normalizeChannelsStatus(
  payload: unknown,
): ChannelsStatusResponse {
  const record = asRecord(payload);
  const channelOrder = Array.isArray(record.channelOrder)
    ? (record.channelOrder as string[])
    : [];
  const channelLabels =
    typeof record.channelLabels === "object" && record.channelLabels !== null
      ? (record.channelLabels as Record<string, string>)
      : {};
  const rawChannels = asRecord(record.channels);
  const channels: ChannelsStatusResponse["channels"] = {};
  for (const [key, val] of Object.entries(rawChannels)) {
    const ch = asRecord(val);
    channels[key] = {
      configured: ch.configured === true,
      running: ch.running === true,
      lastStartAt: asNumberOrNull(ch.lastStartAt),
      lastStopAt: asNumberOrNull(ch.lastStopAt),
      lastError: asStringOrNull(ch.lastError),
    };
  }
  const rawAccounts = asRecord(record.channelAccounts);
  const channelAccounts: ChannelsStatusResponse["channelAccounts"] = {};
  for (const [key, val] of Object.entries(rawAccounts)) {
    channelAccounts[key] = asArray(val).map((entry) => {
      const acc = asRecord(entry);
      const bot = asRecord(acc.bot);
      return {
        accountId: asString(acc.accountId, "default"),
        enabled: acc.enabled === true,
        configured: acc.configured === true,
        running: acc.running === true,
        connected: acc.connected === true,
        lastStartAt: asNumberOrNull(acc.lastStartAt),
        lastStopAt: asNumberOrNull(acc.lastStopAt),
        lastError: asStringOrNull(acc.lastError),
        lastInboundAt: asNumberOrNull(acc.lastInboundAt),
        lastOutboundAt: asNumberOrNull(acc.lastOutboundAt),
        reconnectAttempts: asNumber(acc.reconnectAttempts, 0),
        ...(bot.id
          ? {
              bot: { id: String(bot.id), username: asString(bot.username, "") },
            }
          : {}),
      };
    });
  }
  return {
    ts: asNumber(record.ts, 0),
    channelOrder,
    channelLabels,
    channels,
    channelAccounts,
  };
}

/**
 * Normalize `cron.status` response into {@link CronSchedulerStatus}.
 *
 * @param payload - Raw gateway cron scheduler response to normalize.
 * @returns Normalized cron scheduler status object.
 */
export function normalizeCronScheduler(payload: unknown): CronSchedulerStatus {
  const record = asRecord(payload);
  return {
    enabled: record.enabled === true,
    jobs: asNumber(record.jobs, 0),
    nextWakeAtMs: asNumberOrNull(record.nextWakeAtMs),
    ...optionalString("storePath", record.storePath),
  };
}

/**
 * Normalize `doctor.memory.status` response into {@link MemoryStatusResponse}.
 *
 * @param payload - Raw gateway memory status response to normalize.
 * @returns Normalized memory status with embedding and dreaming details.
 */
export function normalizeMemoryStatus(payload: unknown): MemoryStatusResponse {
  const record = asRecord(payload);
  const dreaming = asRecord(record.dreaming);
  const rawPhases = asRecord(dreaming.phases);
  const phases: Record<
    string,
    { enabled: boolean; cron: string; [key: string]: unknown }
  > = {};
  for (const [key, val] of Object.entries(rawPhases)) {
    const phase = asRecord(val);
    phases[key] = {
      ...phase,
      enabled: phase.enabled === true,
      cron: asString(phase.cron, ""),
    };
  }
  const embedding = asRecord(record.embedding);
  return {
    agentId: asString(record.agentId, ""),
    provider: asString(record.provider, ""),
    embedding: { ok: embedding.ok === true },
    dreaming: {
      enabled: dreaming.enabled === true,
      phases,
      shortTermCount: asNumber(dreaming.shortTermCount, 0),
      recallSignalCount: asNumber(dreaming.recallSignalCount, 0),
      totalSignalCount: asNumber(dreaming.totalSignalCount, 0),
      promotedTotal: asNumber(dreaming.promotedTotal, 0),
      promotedToday: asNumber(dreaming.promotedToday, 0),
    },
  };
}

/**
 * Format a raw token count compactly for display (e.g. 30_386_855 → "30.4M").
 *
 * When `trimZero` is true, trailing `.0` is stripped (e.g. 1_000_000 → "1M"
 * instead of "1.0M"). This mode is used by {@link formatContextWindow} in
 * renderers.ts for concise context-window labels.
 *
 * @param tokens - Raw token count to format.
 * @param trimZero - When true, strip trailing `.0` from rounded values.
 * @returns Compact human-readable token count string (e.g. "30.4M", "1k").
 */
export function formatTokenCount(tokens: number, trimZero = false): string {
  const fmt = (value: number, divisor: number, suffix: string): string => {
    const scaled = value / divisor;
    return trimZero && value % divisor === 0
      ? `${scaled.toFixed(0)}${suffix}`
      : `${scaled.toFixed(1)}${suffix}`;
  };
  if (tokens >= 1_000_000_000) return fmt(tokens, 1_000_000_000, "B");
  if (tokens >= 1_000_000) return fmt(tokens, 1_000_000, "M");
  if (tokens >= 1_000) return fmt(tokens, 1_000, "k");
  return String(tokens);
}

// ---------------------------------------------------------------------------
// RPC normalizers — progress card panel (agent-scoped, gateway ≥ 2026.9)
// ---------------------------------------------------------------------------

/** Valid progress-card step statuses (unknown raw statuses default to `pending`). */
const PROGRESS_CARD_STATUSES = new Set(["pending", "in_progress", "completed"]);

/**
 * Build an optional spread object `{ [key]: value }` when `value` is a non-empty
 * string. Returns `{}` otherwise, so it vanishes in a spread. Unlike
 * {@link optionalString}, empty strings are treated as absent (gateway omits
 * empty fields rather than sending `""`).
 */
function optionalNonEmptyString<K extends string>(
  key: K,
  value: unknown,
): { [P in K]?: string } {
  return typeof value === "string" && value.length > 0
    ? ({ [key]: value } as { [P in K]?: string })
    : ({} as { [P in K]?: string });
}

/**
 * Normalize a `progressCard.get` RPC response into a {@link ProgressCard}.
 *
 * Tolerant by design — the gateway publishes one card per session (≤ 50 steps,
 * one `in_progress` at a time) but payload shapes vary across gateway builds:
 * - `title` is read when present, `agentId`/`updatedAt` pass through when strings.
 * - `steps` must be an array; malformed entries (non-object, missing/non-string
 *   `step` name) are skipped; unrecognized `status` values default to `pending`.
 * - Empty or absent `steps` is tolerated (normalizes to an empty array).
 *
 * @param payload - Raw `progressCard.get` response payload.
 * @param fallbackSessionKey - Session key used when the payload omits `sessionKey`
 *   (the caller fetched per-key, so it knows the key).
 * @returns The normalized card, or `null` when the payload is not an object or
 *   has no usable session key.
 */
export function normalizeProgressCard(
  payload: unknown,
  fallbackSessionKey = "",
): ProgressCard | null {
  const record = asRecord(payload);
  const sessionKey = asString(record.sessionKey, fallbackSessionKey);
  if (sessionKey.length === 0) return null;

  const rawSteps = Array.isArray(record.steps) ? record.steps : [];
  const steps = rawSteps.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return []; // skip malformed
    const rec = entry as Record<string, unknown>;
    const step = typeof rec.step === "string" ? rec.step : "";
    if (step.length === 0) return []; // skip malformed
    const status =
      typeof rec.status === "string" && PROGRESS_CARD_STATUSES.has(rec.status)
        ? (rec.status as ProgressCard["steps"][number]["status"])
        : "pending";
    return [{ step, status }];
  });

  return {
    sessionKey,
    ...optionalNonEmptyString("agentId", record.agentId),
    ...optionalNonEmptyString("title", record.title),
    steps,
    ...optionalNonEmptyString("updatedAt", record.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// RPC normalizers — Phase 3 read-only panels (gateway ≥ 2026.9)
// ---------------------------------------------------------------------------

/** Format a byte count as GB (one decimal, `n/a` for absent/invalid values). */
export function formatBytesToGb(bytes: unknown): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0)
    return "n/a";
  const gb = bytes / 1_000_000_000;
  return gb >= 100 ? `${Math.round(gb)}GB` : `${gb.toFixed(1)}GB`;
}

/**
 * Extract a tolerant list from an RPC payload that may be a bare array or an
 * object wrapping one under a common key (`tasks`, `items`, `entries`,
 * `nodes`, `events`, `lanes`, `entries`, `proposals`, ...). Returns `null` when
 * no array can be found so callers can distinguish "absent" from "empty".
 */
function tolerantList(payload: unknown, keys: string[]): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (typeof payload !== "object" || payload === null) return null;
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return null;
}

/**
 * Normalize a `tasks.list` RPC response into {@link TaskLedgerEntry} rows.
 *
 * Tolerant by design — accepts a bare array or an object wrapping one under
 * `tasks`/`items`/`entries`. Per task: `name` falls back to `title` then `id`;
 * unrecognized `status` strings default to `unknown`; `priority` is kept only
 * when a string. Malformed entries are skipped.
 */
export function normalizeTaskLedger(payload: unknown): TaskLedgerEntry[] {
  const raw = tolerantList(payload, ["tasks", "items", "entries"]) ?? [];
  return raw.flatMap((entry, index) => {
    if (typeof entry !== "object" || entry === null) return []; // skip malformed
    const rec = entry as Record<string, unknown>;
    const id = asString(
      rec.id,
      asString(rec.name, asString(rec.title, `task-${index}`)),
    );
    const name = asString(rec.name, asString(rec.title, "")) || undefined;
    const title = asString(rec.title, "") || undefined;
    const status = asString(rec.status, "unknown");
    const priority = asString(rec.priority, "") || undefined;
    return [
      {
        id,
        ...(name ? { name } : {}),
        ...(title ? { title } : {}),
        status,
        ...(priority ? { priority } : {}),
      },
    ];
  });
}

/**
 * Normalize a `sessions.usage.timeseries` RPC response into
 * {@link UsageTimeseriesEntry} buckets.
 *
 * Tolerant by design — accepts a bare array or an object wrapping one under
 * `timeseries`/`buckets`/`items`. Per bucket: `ts` (falls back to `date`) and
 * numeric `tokens`/`cost` when present; malformed entries are skipped.
 */
export function normalizeUsageTimeseries(
  payload: unknown,
): UsageTimeseriesEntry[] {
  const raw = tolerantList(payload, ["timeseries", "buckets", "items"]) ?? [];
  return raw.flatMap((entry, index) => {
    if (typeof entry !== "object" || entry === null) return []; // skip malformed
    const rec = entry as Record<string, unknown>;
    const ts = asString(rec.ts, asString(rec.date, ""));
    if (ts.length === 0) return []; // skip malformed — a bucket without a label renders nothing
    const tokens = asNumberOrNull(rec.tokens) ?? undefined;
    const cost = asNumberOrNull(rec.cost) ?? undefined;
    const fallbackTs = ts || `bucket-${index}`;
    return [
      {
        ts: fallbackTs,
        ...(tokens !== undefined ? { tokens } : {}),
        ...(cost !== undefined ? { cost } : {}),
      },
    ];
  });
}

/**
 * Normalize a `node.list` RPC response into {@link NodeFleetEntry} rows.
 *
 * Tolerant by design — accepts a bare array or an object wrapping one under
 * `nodes`/`items`/`list`. Per node: `nodeId` falls back to `name`;
 * `connected` is only kept when a boolean; `hostStats` is kept when the
 * nested object carries any recognized field. Malformed entries are skipped.
 */
export function normalizeNodeFleet(payload: unknown): NodeFleetEntry[] {
  const raw = tolerantList(payload, ["nodes", "items", "list"]) ?? [];
  return raw.flatMap((entry, index) => {
    if (typeof entry !== "object" || entry === null) return []; // skip malformed
    const rec = entry as Record<string, unknown>;
    const nodeId = asString(
      rec.nodeId,
      asString(rec.id, asString(rec.name, `node-${index}`)),
    );
    const name = asString(rec.name, "") || undefined;
    const platform = asString(rec.platform, "") || undefined;
    const version = asString(rec.version, "") || undefined;
    const connected =
      typeof rec.connected === "boolean" ? rec.connected : undefined;
    const lastSeenAtMs =
      typeof rec.lastSeenAtMs === "number" ? rec.lastSeenAtMs : undefined;
    const stats =
      typeof rec.hostStats === "object" && rec.hostStats !== null
        ? (rec.hostStats as Record<string, unknown>)
        : {};
    const cpuCount =
      typeof stats.cpuCount === "number" ? stats.cpuCount : undefined;
    const memoryTotalBytes =
      typeof stats.memoryTotalBytes === "number"
        ? stats.memoryTotalBytes
        : undefined;
    const memoryFreeBytes =
      typeof stats.memoryFreeBytes === "number"
        ? stats.memoryFreeBytes
        : undefined;
    const hostStats =
      cpuCount !== undefined ||
      memoryTotalBytes !== undefined ||
      memoryFreeBytes !== undefined
        ? {
            ...(cpuCount !== undefined ? { cpuCount } : {}),
            ...(memoryTotalBytes !== undefined ? { memoryTotalBytes } : {}),
            ...(memoryFreeBytes !== undefined ? { memoryFreeBytes } : {}),
          }
        : undefined;
    return [
      {
        nodeId,
        ...(name ? { name } : {}),
        ...(platform ? { platform } : {}),
        ...(version ? { version } : {}),
        ...(connected !== undefined ? { connected } : {}),
        ...(lastSeenAtMs !== undefined ? { lastSeenAtMs } : {}),
        ...(hostStats ? { hostStats } : {}),
      },
    ];
  });
}

/**
 * Normalize a `diagnostics.stability` RPC response into {@link StabilityEntry}
 * rows.
 *
 * Tolerant by design — accepts a bare array or an object wrapping one under
 * `entries`/`lanes`/`events`. Per entry: `kind` falls back to `type`/`name`;
 * `summary` falls back to `message`. Returns `undefined` when the payload has
 * no parseable shape so the panel degrades to its empty state (never throws).
 */
export function normalizeStability(
  payload: unknown,
): StabilityEntry[] | undefined {
  const raw = tolerantList(payload, ["entries", "lanes", "events"]);
  if (raw === null) return undefined; // unparseable shape → empty state
  return raw.flatMap((entry, index) => {
    if (typeof entry !== "object" || entry === null) return []; // skip malformed
    const rec = entry as Record<string, unknown>;
    const kind = asString(rec.kind, asString(rec.type, asString(rec.name, "")));
    if (kind.length === 0) return []; // skip malformed — no kind to render
    const ts = asString(rec.ts, asString(rec.at, `#${index}`));
    const summary =
      asString(rec.summary, asString(rec.message, "")) || undefined;
    return [{ ts, kind, ...(summary ? { summary } : {}) }];
  });
}

/**
 * Normalize an `audit.activity.list` RPC response into {@link AuditTimelineEntry}
 * rows.
 *
 * Tolerant by design — accepts a bare array or an object wrapping one under
 * `entries`/`activity`/`audit`. Per entry: `actor` falls back to `agentId`,
 * `action` to `kind`, `target` to `summary`; `outcome` is kept only when a
 * string. Malformed entries are skipped.
 */
export function normalizeAuditTimeline(payload: unknown): AuditTimelineEntry[] {
  const raw = tolerantList(payload, ["entries", "activity", "audit"]) ?? [];
  return raw.flatMap((entry, index) => {
    if (typeof entry !== "object" || entry === null) return []; // skip malformed
    const rec = entry as Record<string, unknown>;
    const ts = asString(rec.ts, asString(rec.at, `#${index}`));
    const actor = asString(rec.actor, asString(rec.agentId, "")) || undefined;
    const action = asString(rec.action, asString(rec.kind, ""));
    if (action.length === 0) return []; // skip malformed — no action to render
    const target = asString(rec.target, asString(rec.summary, "")) || undefined;
    const outcome = asString(rec.outcome, "") || undefined;
    return [
      {
        ts,
        ...(actor ? { actor } : {}),
        action,
        ...(target ? { target } : {}),
        ...(outcome ? { outcome } : {}),
      },
    ];
  });
}

/**
 * Normalize a `config.schema` RPC response into a map of key →
 * {@link ConfigSchemaEntry}.
 *
 * Tolerant by design — the payload must be an object map; per value, only
 * string `type`/`description`/`path` fields and any `default` are kept.
 * Returns `undefined` for non-object payloads so the panel degrades to its
 * empty state (never throws).
 */
export function normalizeConfigSchema(
  payload: unknown,
): Record<string, ConfigSchemaEntry> | undefined {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return undefined;
  }
  const result: Record<string, ConfigSchemaEntry> = {};
  for (const [key, raw] of Object.entries(payload as Record<string, unknown>)) {
    if (typeof raw !== "object" || raw === null) continue; // skip malformed
    const rec = raw as Record<string, unknown>;
    const type = asString(rec.type, "") || undefined;
    const description = asString(rec.description, "") || undefined;
    const path = asString(rec.path, "") || undefined;
    const hasDefault = "default" in rec;
    result[key] = {
      ...(type ? { type } : {}),
      ...(description ? { description } : {}),
      ...(hasDefault ? { default: rec.default } : {}),
      ...(path ? { path } : {}),
    };
  }
  return result;
}

/** Valid skill-proposal statuses (unknown raw statuses default to `unknown`). */
const SKILL_PROPOSAL_STATUSES = new Set(["pending", "approved", "rejected"]);

/**
 * Normalize a `skills.proposals.list` RPC response into {@link SkillProposalEntry}
 * rows.
 *
 * Tolerant by design — accepts a bare array or an object wrapping one under
 * `proposals`/`items`. Per proposal: `id` falls back to `name`; unrecognized
 * `status` values default to `unknown`; `verdict` falls back to
 * `securityVerdict`/`verdict` when a string. Malformed entries are skipped.
 */
export function normalizeSkillProposals(
  payload: unknown,
): SkillProposalEntry[] {
  const raw = tolerantList(payload, ["proposals", "items", "entries"]) ?? [];
  return raw.flatMap((entry, index) => {
    if (typeof entry !== "object" || entry === null) return []; // skip malformed
    const rec = entry as Record<string, unknown>;
    const id = asString(rec.id, asString(rec.name, `proposal-${index}`));
    const status = asString(
      rec.status,
      "unknown",
    ) as SkillProposalEntry["status"];
    const author = asString(rec.author, "") || undefined;
    const verdict =
      asString(rec.verdict, asString(rec.securityVerdict, "")) || undefined;
    return [
      {
        id,
        status: SKILL_PROPOSAL_STATUSES.has(status) ? status : "unknown",
        ...(author ? { author } : {}),
        ...(verdict ? { verdict } : {}),
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// RPC normalizers — config panel
// ---------------------------------------------------------------------------

/**
 * Normalize `config.get` RPC response into a {@link ConfigResponse}.
 * The gateway returns a plain JSON object with its running configuration.
 *
 * @param payload - Raw gateway config response to normalize.
 * @returns Normalized config response object.
 */
const CONFIG_SAFE_KEYS = new Set([
  "model",
  "temperature",
  "maxTokens",
  "provider",
  "region",
  "apiKey",
  "baseUrl",
  "topP",
  "topK",
  "frequencyPenalty",
  "presencePenalty",
  "stop",
  "systemPrompt",
  "responseFormat",
  "seed",
  "logprobs",
  "tools",
  "toolChoice",
  "parallelToolCalls",
  "port",
  "debug",
  "agents",
  "host",
  "version",
  "uptime",
  "pid",
  "status",
]);

export function normalizeConfigData(payload: unknown): ConfigResponse {
  const record = asRecord(payload);
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (CONFIG_SAFE_KEYS.has(key)) safe[key] = value;
  }
  return safe as ConfigResponse;
}

// ---------------------------------------------------------------------------
// RPC normalizers — file tracking panel
// ---------------------------------------------------------------------------

/**
 * Normalize `agents.files.list` RPC response into an array of {@link FileStatusEntry}.
 * The gateway returns either a bare array or `{ files: [...] }`.
 *
 * @param payload - Raw gateway file status response to normalize.
 * @returns Normalized array of file status entries.
 */
export function normalizeFileStatus(payload: unknown): FileStatusEntry[] {
  const source = Array.isArray(payload)
    ? payload
    : unwrapEnvelope(payload, "files");
  return source.map((entry) => {
    const rec = asRecord(entry);
    return {
      ...rec,
      path: asString(rec.path, "unknown"),
      status: asString(rec.status, "unknown"),
      ...optionalString("language", rec.language),
      ...optionalNumber("sizeBytes", rec.sizeBytes),
      ...optionalNumber("modifiedAt", rec.modifiedAt),
    };
  });
}

// ---------------------------------------------------------------------------
// Session details — derived from sessions.list data
// ---------------------------------------------------------------------------

/**
 * Derive session detail entries from `sessions.list` RPC response.
 *
 * The gateway's `sessions.list` already returns per-session metadata that the
 * Session Details panel needs. This normalizer reshapes that data into
 * {@link SessionDetailEntry} objects — no separate RPC call is required.
 *
 * Accepts either a `sessions.list` envelope `{ sessions: [...] }`, a bare
 * array of sessions, or a name-keyed map `{ sessionKey: { ... } }`.
 *
 * @param payload - Raw gateway sessions.list response to normalize.
 * @returns Normalized array of session detail entries.
 */
export function normalizeSessionDetails(
  payload: unknown,
): SessionDetailEntry[] {
  if (Array.isArray(payload)) {
    return payload.map((entry) => normalizeSingleSessionDetail("", entry));
  }
  const record = asRecord(payload);
  // Unwrap sessions.list envelope: { sessions: [...] }
  if (Array.isArray(record.sessions)) {
    return (record.sessions as unknown[]).map((entry) =>
      normalizeSingleSessionDetail("", entry),
    );
  }
  // Legacy map shape: { sessionKey: { ... } }
  return Object.entries(record).map(([key, val]) =>
    normalizeSingleSessionDetail(key, val),
  );
}

/** Normalize a single session detail entry (shared by array, envelope, and map paths). */
function normalizeSingleSessionDetail(
  fallbackKey: string,
  entry: unknown,
): SessionDetailEntry {
  const rec = asRecord(entry);
  const key = asString(rec.key, fallbackKey || "unknown");
  // Derive agentId from key if not explicit (e.g. "agent:ceo:main" → "ceo")
  const agentId = asString(
    rec.agentId,
    key.startsWith("agent:") ? (key.split(":")[1] ?? "") : "",
  );
  return {
    ...rec,
    key,
    agentId,
    status: asString(rec.status, "unknown"),
    ...optionalString("displayName", rec.displayName),
    ...optionalString("kind", rec.kind),
    ...optionalString("channel", rec.channel),
    ...optionalNumber("messageCount", rec.messageCount),
    ...optionalNumber("tokenCount", rec.tokenCount),
    ...optionalNumber("lastActivityAt", rec.lastActivityAt),
    ...optionalNumber("createdAt", rec.createdAt),
  };
}
