// ---------------------------------------------------------------------------
// OpenClaw native WebSocket protocol types (protocol version 3)
// ---------------------------------------------------------------------------

// --- Connection states ---

/**
 * WebSocket connection lifecycle states.
 * The 7-state machine governs valid transitions (see state-machine.ts).
 */
export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'handshaking'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

// --- Wire frame types ---

/** Client → gateway request frame. */
export interface RequestFrame {
  type: 'req';
  id: string;
  method: string;
  params?: unknown;
}

/** Gateway → client response frame. */
export interface ResponseFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: ErrorShape;
}

/** Gateway → client (or broadcast) event frame. */
export interface EventFrame {
  type: 'event';
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: StateVersion;
}

/** Union of all wire frames. */
export type GatewayFrame = RequestFrame | ResponseFrame | EventFrame;

// --- Error shape ---

/** Structured error returned by the gateway in failed responses. */
export interface ErrorShape {
  code: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
  retryAfterMs?: number;
}

// --- State version (optimistic concurrency) ---

/** Optimistic concurrency version counters for presence and health. */
export interface StateVersion {
  presence: number;
  health: number;
}

// --- Handshake: ConnectParams (client → gateway, first message) ---

/** Client identity info sent in the `connect` handshake. */
export interface ConnectClientInfo {
  id: string;
  version: string;
  platform: string;
  mode: string;
  displayName?: string;
  deviceFamily?: string;
  modelIdentifier?: string;
  instanceId?: string;
}

/** Authentication credentials sent in the `connect` handshake. */
export interface ConnectAuth {
  token?: string;
  password?: string;
  bootstrapToken?: string;
  deviceToken?: string;
}

/** Full connect request parameters (protocol version, client info, auth, scopes). */
export interface ConnectParams {
  minProtocol: number;
  maxProtocol: number;
  client: ConnectClientInfo;
  auth?: ConnectAuth;
  role?: string;
  scopes?: string[];
  caps?: string[];
  locale?: string;
  userAgent?: string;
}

// --- Handshake: HelloOk (gateway → client, successful connect response) ---

/** Server identity in the HelloOk handshake response. */
export interface HelloOkServer {
  version: string;
  connId: string;
}

/** Advertised methods and events in the HelloOk handshake response. */
export interface HelloOkFeatures {
  methods: string[];
  events: string[];
}

/** Connection policy limits from the HelloOk handshake response. */
export interface HelloOkPolicy {
  maxPayload: number;
  maxBufferedBytes: number;
  tickIntervalMs: number;
}

/** Default session configuration from the gateway snapshot. */
export interface SessionDefaults {
  defaultAgentId: string;
  mainKey: string;
  mainSessionKey: string;
  scope?: string;
}

/** A connected client entry from the gateway presence snapshot. */
export interface PresenceEntry {
  ts: number;
  host?: string;
  ip?: string;
  version?: string;
  platform?: string;
  deviceFamily?: string;
  modelIdentifier?: string;
  mode?: string;
  lastInputSeconds?: number;
  reason?: string;
  tags?: string[];
  text?: string;
  deviceId?: string;
  roles?: string[];
  scopes?: string[];
  instanceId?: string;
}

/** Initial state snapshot included in the HelloOk handshake response. */
export interface Snapshot {
  presence: PresenceEntry[];
  health: HealthResponse | null;
  stateVersion: StateVersion;
  uptimeMs: number;
  configPath?: string;
  stateDir?: string;
  sessionDefaults?: SessionDefaults;
  authMode?: 'none' | 'token' | 'password' | 'trusted-proxy';
  updateAvailable?: {
    currentVersion: string;
    latestVersion: string;
    channel: string;
  };
}

/** Auth tokens and scopes issued by the gateway in HelloOk. */
export interface HelloOkAuth {
  deviceToken: string;
  role: string;
  scopes: string[];
  issuedAtMs?: number;
}

/** Successful handshake response from the gateway (protocol, server, features, snapshot). */
export interface HelloOk {
  type: 'hello-ok';
  protocol: number;
  server: HelloOkServer;
  features: HelloOkFeatures;
  snapshot: Snapshot;
  policy: HelloOkPolicy;
  auth?: HelloOkAuth;
  canvasHostUrl?: string;
}

// --- Data summaries (normalized from gateway responses) ---

/** Task execution statistics from the `status` response. */
export interface TaskStats {
  total: number;
  active: number;
  terminal: number;
  failures: number;
  byStatus: Record<string, number>;
  byRuntime: Record<string, number>;
}

/** Task audit counters (warnings, errors, by-code breakdown) from `status`. */
export interface TaskAudit {
  total: number;
  warnings: number;
  errors: number;
  byCode: Record<string, number>;
}

/** Per-agent session count from the `status` response. */
export interface StatusSessionsByAgent {
  agentId: string;
  count: number;
  path?: string;
}

/** Full gateway status response (tasks, audit, sessions, heartbeat, channels). */
export interface GatewayStatus {
  ok?: boolean;
  version?: string;
  uptimeMs?: number;
  runtimeVersion?: string;
  tasks?: TaskStats;
  taskAudit?: TaskAudit;
  channelSummary?: string[];
  sessions?: {
    count: number;
    byAgent?: StatusSessionsByAgent[];
    defaults?: Record<string, unknown>;
    [key: string]: unknown;
  };
  heartbeat?: {
    defaultAgentId?: string;
    agents?: Array<{
      agentId: string;
      enabled: boolean;
      every: string;
      everyMs: number | null;
    }>;
  };
  [key: string]: unknown;
}

/** Agent model configuration — primary model with optional fallbacks. */
export interface AgentModel {
  primary: string;
  fallbacks?: string[];
}

/** Normalized agent summary from `agents.list`. */
export interface AgentSummary {
  id: string;
  name?: string;
  model?: AgentModel | string;
  workspace?: string;
  [key: string]: unknown;
}

/** Wire shape of the `agents.list` response envelope. */
export interface AgentsListResponse {
  defaultId: string;
  mainKey: string;
  scope: string;
  agents: AgentSummary[];
}

/** Normalized session summary from `sessions.list`. */
export interface SessionSummary {
  key: string;
  kind?: string;
  displayName?: string;
  channel?: string;
  chatType?: string;
  updatedAt?: number;
  sessionId?: string;
  agentId?: string;
  [key: string]: unknown;
}

/** Wire shape of the `sessions.list` response envelope. */
export interface SessionsListResponse {
  ts: number;
  path: string;
  count: number;
  defaults: {
    modelProvider: string;
    model: string;
    contextTokens: number;
  };
  sessions: SessionSummary[];
}

/** Cron schedule object — kind (cron/interval), expression, and timezone. */
export interface CronSchedule {
  kind: string;
  expr: string;
  tz?: string;
}

/** Normalized cron job summary from `cron.list`. */
export interface CronJobSummary {
  id: string;
  name: string;
  enabled?: boolean;
  schedule?: CronSchedule;
  sessionTarget?: string;
  createdAtMs?: number;
  updatedAtMs?: number;
  [key: string]: unknown;
}

/** Wire shape of the `cron.list` response envelope. */
export interface CronJobsListResponse {
  jobs: CronJobSummary[];
}

/** Individual cron execution entry from `cron.runs`. */
export interface CronRunEntry {
  ts: number;
  jobId: string;
  /** Human-readable job name (may differ from `jobId`). */
  name?: string;
  /** Alternative job name field used by some gateway versions. */
  jobName?: string;
  action?: string;
  status?: string;
  summary?: string;
  runAt?: number;
  error?: string | Record<string, unknown>;
  [key: string]: unknown;
}

/** Wire shape of the `cron.runs` response envelope. */
export interface CronRunsResponse {
  entries: CronRunEntry[];
}

/** Normalized model info from `models.list`. */
export interface ModelInfo {
  id: string;
  name?: string;
  provider?: string;
  contextWindow?: number;
  reasoning?: boolean;
  input?: string[];
  [key: string]: unknown;
}

/** Wire shape of the `models.list` response envelope. */
export interface ModelsListResponse {
  models: ModelInfo[];
}

/** Normalized health response from the `health` RPC. */
export interface HealthResponse {
  ok: boolean;
  ts: number;
  durationMs?: number;
  channels?: Record<string, unknown>;
  channelOrder?: string[];
  channelLabels?: Record<string, string>;
  heartbeatSeconds?: number;
  defaultAgentId?: string;
  agents?: unknown[];
  [key: string]: unknown;
}

// --- Client options ---

/** Configuration options for {@link GatewayClient}. */
export interface GatewayClientOptions {
  /** WebSocket URL for the gateway (e.g. ws://localhost:18789/ws). */
  url: string;
  /** Fallback WebSocket URL if primary fails. */
  fallbackUrl?: string;
  /** Gateway auth token (OPENCLAW_GATEWAY_TOKEN). */
  token?: string;
  /** Client identifier sent in ConnectParams. Defaults to 'gateway-client'. */
  clientId?: string;
  /** Client mode sent in ConnectParams. Defaults to 'ui'. */
  clientMode?: string;
  /** Client display name. */
  clientDisplayName?: string;
  /** Client version string. */
  clientVersion?: string;
  /** Operator role. Defaults to 'operator'. */
  role?: string;
  /** Requested scopes. Defaults to ['operator.read']. */
  scopes?: string[];
  /** Enable automatic reconnect. Defaults to true. */
  reconnect?: boolean;
  /** Minimum reconnect delay in ms. Defaults to 800. */
  minReconnectDelayMs?: number;
  /** Maximum reconnect delay in ms. Defaults to 30000. */
  maxReconnectDelayMs?: number;
  /** Timeout for connection + handshake in ms. Defaults to 10000. */
  connectTimeoutMs?: number;
  /** Timeout for RPC calls in ms. Defaults to 30000. */
  rpcTimeoutMs?: number;
  /**
   * Origin header for server-side WebSocket connections.
   * Required by gateways that enforce `controlUi.allowedOrigins`.
   * Typically set to the gateway's own HTTP base URL (e.g. `http://127.0.0.1:18789`).
   * Ignored in browser environments where the browser sets Origin automatically.
   */
  origin?: string;
}

// --- Extended data summaries (from additional gateway RPCs) ---

/** Daily token usage row from `usage.cost`. */
export interface UsageCostDay {
  date: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
}

/** Response shape for `usage.cost`. */
export interface UsageCostResponse {
  updatedAt: number;
  days: number;
  daily: UsageCostDay[];
  totals: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    totalCost: number;
  };
}

/** Per-provider quota/remaining summary from `usage.status`. */
export interface UsageStatusProvider {
  provider: string;
  status: string;
  used: number | null;
  limit: number | null;
  remaining: number | null;
  resetAt: number | null;
}

/** Response shape for `usage.status`. */
export interface UsageStatusResponse {
  updatedAt: number;
  providers: UsageStatusProvider[];
}

/** Individual tool entry from `tools.catalog`. */
export interface ToolEntry {
  id: string;
  label: string;
  description: string;
  source: string;
  defaultProfiles?: string[];
}

/** Tool group from `tools.catalog`. */
export interface ToolGroup {
  id: string;
  label: string;
  source: string;
  tools: ToolEntry[];
}

/** Response shape for `tools.catalog`. */
export interface ToolsCatalogResponse {
  agentId: string;
  profiles: Array<{ id: string; label: string }>;
  groups: ToolGroup[];
}

/** Installed skill entry from `skills.status`. */
export interface SkillEntry {
  name: string;
  description: string;
  source: string;
  bundled: boolean;
  emoji?: string;
  homepage?: string;
  always: boolean;
  disabled: boolean;
  eligible: boolean;
  missing?: {
    bins: string[];
    env: string[];
  };
}

/** Response shape for `skills.status`. */
export interface SkillsStatusResponse {
  workspaceDir: string;
  managedSkillsDir: string;
  skills: SkillEntry[];
}

/** Per-channel account detail from `channels.status`. */
export interface ChannelAccountDetail {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  running: boolean;
  connected: boolean;
  lastStartAt: number | null;
  lastStopAt: number | null;
  lastError: string | null;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
  reconnectAttempts: number;
  bot?: { id: string; username: string };
}

/** Response shape for `channels.status`. */
export interface ChannelsStatusResponse {
  ts: number;
  channelOrder: string[];
  channelLabels: Record<string, string>;
  channels: Record<string, {
    configured: boolean;
    running: boolean;
    lastStartAt: number | null;
    lastStopAt: number | null;
    lastError: string | null;
  }>;
  channelAccounts: Record<string, ChannelAccountDetail[]>;
}

/** Response shape for `cron.status`. */
export interface CronSchedulerStatus {
  enabled: boolean;
  jobs: number;
  nextWakeAtMs: number | null;
  storePath?: string;
}

/** Dreaming phase config from `doctor.memory.status`. */
export interface DreamingPhase {
  enabled: boolean;
  cron: string;
  lookbackDays?: number;
  limit?: number;
  minScore?: number;
  [key: string]: unknown;
}

/** Response shape for `doctor.memory.status`. */
export interface MemoryStatusResponse {
  agentId: string;
  provider: string;
  embedding: { ok: boolean };
  dreaming: {
    enabled: boolean;
    phases: Record<string, DreamingPhase>;
    shortTermCount: number;
    recallSignalCount: number;
    totalSignalCount: number;
    promotedTotal: number;
    promotedToday: number;
    [key: string]: unknown;
  };
}

// --- RPC response types (panels with working RPC data sources) ---

/** File status entry from `agents.files.list` RPC. */
export interface FileStatusEntry {
  path: string;
  status: string;
  language?: string;
  sizeBytes?: number;
  modifiedAt?: number;
  [key: string]: unknown;
}

/** Gateway configuration snapshot from `config.get` RPC. */
export interface ConfigResponse {
  /** Raw config key-value pairs — structure varies by gateway version. */
  [key: string]: unknown;
}

/** Session detail entry derived from `sessions.list` RPC data. */
export interface SessionDetailEntry {
  /** Session key (e.g. `agent:ceo:main`). */
  key: string;
  /** Agent that owns this session. */
  agentId: string;
  /** Human-readable display name. */
  displayName?: string;
  /** Current session status (running, idle, closed, error). */
  status: string;
  /** Session kind (persistent, ephemeral). */
  kind?: string;
  /** Channel the session is bound to. */
  channel?: string;
  /** Number of messages in the session. */
  messageCount?: number;
  /** Total token usage for this session. */
  tokenCount?: number;
  /** Epoch-ms of last activity. */
  lastActivityAt?: number;
  /** Epoch-ms of session creation. */
  createdAt?: number;
  /** Extra fields from gateway. */
  [key: string]: unknown;
}
