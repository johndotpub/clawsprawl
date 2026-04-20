import type {
  AgentSummary,
  ChannelsStatusResponse,
  ConfigResponse,
  ConnectionState,
  CronJobSummary,
  CronRunEntry,
  CronSchedulerStatus,
  EventFrame,
  FileStatusEntry,
  GatewayStatus,
  HealthResponse,
  MemoryStatusResponse,
  ModelInfo,
  PresenceEntry,
  SessionDetailEntry,
  SessionSummary,
  SkillsStatusResponse,
  ToolsCatalogResponse,
  UsageCostResponse,
  UsageStatusResponse,
} from '../gateway/types';

/** Complete state snapshot for the dashboard UI. */
export interface DashboardState {
  connectionState: ConnectionState;
  lastUpdatedAt: string | null;
  lastSuccessfulSnapshotAt: string | null;
  stale: boolean;
  reconnectCount: number;
  errorCount: number;
  status: GatewayStatus | null;
  health: HealthResponse | null;
  presence: PresenceEntry[];
  agents: AgentSummary[];
  sessions: SessionSummary[];
  cronJobs: CronJobSummary[];
  cronRuns: CronRunEntry[];
  models: ModelInfo[];
  events: EventFrame[];
  /** Token usage totals and daily breakdown from `usage.cost`. */
  usageCost: UsageCostResponse | null;
  /** Provider quota/remaining summary from `usage.status`. */
  usageStatus: UsageStatusResponse | null;
  /** Tool catalog (groups + tools) from `tools.catalog`. */
  toolsCatalog: ToolsCatalogResponse | null;
  /** Installed skills inventory from `skills.status`. */
  skillsStatus: SkillsStatusResponse | null;
  /** Rich channel status with accounts from `channels.status`. */
  channelsStatus: ChannelsStatusResponse | null;
  /** Cron scheduler status (enabled, job count, next wake) from `cron.status`. */
  cronScheduler: CronSchedulerStatus | null;
  /** Memory/dreaming subsystem health from `doctor.memory.status`. */
  memoryStatus: MemoryStatusResponse | null;
  /** Running gateway configuration from `config.get` RPC. */
  configData: ConfigResponse | null;
  /** Modified files list from `agents.files.list` RPC. */
  fileStatus: FileStatusEntry[] | null;
  /** Session detail entries derived from `sessions.list` RPC data. */
  sessionDetails: SessionDetailEntry[] | null;
}

/** Snapshot payload shape returned by dashboard snapshot API routes. */
export interface DashboardSnapshotPayload {
  connectionState?: ConnectionState;
  lastSuccessfulSnapshotAt?: string | null;
  stale?: boolean;
  reconnectCount?: number;
  errorCount?: number;
  status?: GatewayStatus | null;
  health?: HealthResponse | null;
  presence?: PresenceEntry[];
  agents?: AgentSummary[];
  sessions?: SessionSummary[];
  cronJobs?: CronJobSummary[];
  cronRuns?: CronRunEntry[];
  models?: ModelInfo[];
  usageCost?: UsageCostResponse | null;
  usageStatus?: UsageStatusResponse | null;
  toolsCatalog?: ToolsCatalogResponse | null;
  skillsStatus?: SkillsStatusResponse | null;
  channelsStatus?: ChannelsStatusResponse | null;
  cronScheduler?: CronSchedulerStatus | null;
  memoryStatus?: MemoryStatusResponse | null;
  configData?: ConfigResponse | null;
  fileStatus?: FileStatusEntry[] | null;
  sessionDetails?: SessionDetailEntry[] | null;
}

type StateListener = (state: DashboardState) => void;

const DEFAULT_STATE: DashboardState = {
  connectionState: 'idle',
  lastUpdatedAt: null,
  lastSuccessfulSnapshotAt: null,
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
};

/** Maximum events retained in the ring buffer (default 200). */
const DEFAULT_MAX_EVENTS = 200;

/** Maximum daily cost entries retained in usageCost.daily. */
const MAX_DAILY_COST_ENTRIES = 365;

/**
 * Reactive state store for the ClawSprawl dashboard.
 *
 * Holds the complete {@link DashboardState} snapshot and notifies subscribers
 * on every update. All panel data flows through setter methods that merge a
 * partial patch and bump `lastUpdatedAt`.
 */
export class DashboardStore {
  private state: DashboardState = { ...DEFAULT_STATE };
  private listeners = new Set<StateListener>();
  private maxEvents: number;
  private lastNotifiedAt = 0;
  private eventBuffer: EventFrame[] = [];
  private eventHead = 0;
  private eventCount = 0;

  /** Minimum interval between `lastUpdatedAt` timestamp bumps (ms). */
  private static readonly UPDATE_DEBOUNCE_MS = 1_000;

  constructor(maxEvents = DEFAULT_MAX_EVENTS) {
    this.maxEvents = maxEvents;
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  /** Return the current immutable state snapshot. */
  getSnapshot(): DashboardState {
    return { ...this.state, events: this.getOrderedEvents() };
  }

  /** Update the WebSocket connection state, incrementing counters as needed. */
  setConnectionState(connectionState: ConnectionState): void {
    if (connectionState === 'reconnecting') {
      this.update({ connectionState, reconnectCount: this.state.reconnectCount + 1 });
      return;
    }
    if (connectionState === 'error' || connectionState === 'disconnected') {
      this.update({ connectionState, errorCount: this.state.errorCount + 1 });
      return;
    }
    this.update({ connectionState });
  }

  /** Record a successful data snapshot, clearing the stale flag. */
  markSnapshotSuccess(timestamp = new Date().toISOString()): void {
    this.update({ lastSuccessfulSnapshotAt: timestamp, stale: false });
  }

  /** Toggle the stale flag (skips update if already at the target value). */
  setStale(stale: boolean): void {
    if (this.state.stale === stale) {
      return;
    }
    this.update({ stale });
  }

  /** Update gateway status from `status` RPC. */
  setStatus(status: GatewayStatus): void {
    this.update({ status });
  }

  /** Update agent list from `agents.list` RPC. */
  setAgents(agents: AgentSummary[]): void {
    this.update({ agents });
  }

  /** Update session list from `sessions.list` RPC. */
  setSessions(sessions: SessionSummary[]): void {
    this.update({ sessions });
  }

  /** Update cron job list from `cron.list` RPC. */
  setCronJobs(cronJobs: CronJobSummary[]): void {
    this.update({ cronJobs });
  }

  /** Update cron run history from `cron.runs` RPC. */
  setCronRuns(cronRuns: CronRunEntry[]): void {
    this.update({ cronRuns });
  }

  /** Update model list from `models.list` RPC. */
  setModels(models: ModelInfo[]): void {
    this.update({ models });
  }

  /** Update health response from `health` RPC. */
  setHealth(health: HealthResponse): void {
    this.update({ health });
  }

  /** Update presence entries from gateway snapshot or `presence.list`. */
  setPresence(presence: PresenceEntry[]): void {
    this.update({ presence });
  }

  /** Update token usage data from `usage.cost`. */
  setUsageCost(usageCost: UsageCostResponse): void {
    if (usageCost.daily && usageCost.daily.length > MAX_DAILY_COST_ENTRIES) {
      usageCost = { ...usageCost, daily: usageCost.daily.slice(-MAX_DAILY_COST_ENTRIES) };
    }
    this.update({ usageCost });
  }

  /** Update provider quota summary from `usage.status`. */
  setUsageStatus(usageStatus: UsageStatusResponse): void {
    this.update({ usageStatus });
  }

  /** Update tool catalog from `tools.catalog`. */
  setToolsCatalog(toolsCatalog: ToolsCatalogResponse): void {
    this.update({ toolsCatalog });
  }

  /** Update skills inventory from `skills.status`. */
  setSkillsStatus(skillsStatus: SkillsStatusResponse): void {
    this.update({ skillsStatus });
  }

  /** Update channels status from `channels.status`. */
  setChannelsStatus(channelsStatus: ChannelsStatusResponse): void {
    this.update({ channelsStatus });
  }

  /** Update cron scheduler status from `cron.status`. */
  setCronScheduler(cronScheduler: CronSchedulerStatus): void {
    this.update({ cronScheduler });
  }

  /** Update memory/dreaming health from `doctor.memory.status`. */
  setMemoryStatus(memoryStatus: MemoryStatusResponse): void {
    this.update({ memoryStatus });
  }

  /** Update running configuration from `config.get`. */
  setConfigData(configData: ConfigResponse): void {
    this.update({ configData });
  }

  /** Update modified files list from `agents.files.list`. */
  setFileStatus(fileStatus: FileStatusEntry[]): void {
    this.update({ fileStatus });
  }

  /** Update session detail entries derived from `sessions.list`. */
  setSessionDetails(sessionDetails: SessionDetailEntry[]): void {
    this.update({ sessionDetails });
  }

  /** Push a single event to the front of the ring buffer. */
  pushEvent(event: EventFrame): void {
    if (this.eventCount < this.maxEvents) {
      this.eventBuffer.push(event);
      this.eventCount += 1;
    } else {
      this.eventBuffer[this.eventHead] = event;
      this.eventHead = (this.eventHead + 1) % this.maxEvents;
    }
    this.update({ events: this.getOrderedEvents() });
  }

  /** Push multiple events to the front of the ring buffer (no-op for empty array). */
  pushEvents(events: EventFrame[]): void {
    if (events.length === 0) {
      return;
    }
    for (const event of events) {
      if (this.eventCount < this.maxEvents) {
        this.eventBuffer.push(event);
        this.eventCount += 1;
      } else {
        this.eventBuffer[this.eventHead] = event;
        this.eventHead = (this.eventHead + 1) % this.maxEvents;
      }
    }
    this.update({ events: this.getOrderedEvents() });
  }

  private getOrderedEvents(): EventFrame[] {
    if (this.eventCount < this.maxEvents) {
      return [...this.eventBuffer].reverse();
    }
    const result: EventFrame[] = new Array(this.maxEvents);
    for (let i = 0; i < this.maxEvents; i++) {
      result[i] = this.eventBuffer[(this.eventHead + i) % this.maxEvents];
    }
    return result.reverse();
  }

  /**
   * Apply a full server snapshot in a single state update.
   *
   * This avoids per-field setter churn in the browser bootstrap path and allows
   * explicit null-clears for optional sections (`configData`, `fileStatus`, etc.).
   */
  applySnapshot(snapshot: DashboardSnapshotPayload): void {
    const patch: Partial<DashboardState> = {};

    if (snapshot.connectionState !== undefined) patch.connectionState = snapshot.connectionState;
    if (snapshot.lastSuccessfulSnapshotAt !== undefined) patch.lastSuccessfulSnapshotAt = snapshot.lastSuccessfulSnapshotAt;
    if (snapshot.stale !== undefined) patch.stale = snapshot.stale;
    if (snapshot.reconnectCount !== undefined) patch.reconnectCount = snapshot.reconnectCount;
    if (snapshot.errorCount !== undefined) patch.errorCount = snapshot.errorCount;
    if (snapshot.status !== undefined) patch.status = snapshot.status;
    if (snapshot.health !== undefined) patch.health = snapshot.health;
    if (snapshot.presence !== undefined) patch.presence = snapshot.presence;
    if (snapshot.agents !== undefined) patch.agents = snapshot.agents;
    if (snapshot.sessions !== undefined) patch.sessions = snapshot.sessions;
    if (snapshot.cronJobs !== undefined) patch.cronJobs = snapshot.cronJobs;
    if (snapshot.cronRuns !== undefined) patch.cronRuns = snapshot.cronRuns;
    if (snapshot.models !== undefined) patch.models = snapshot.models;
    if (snapshot.usageCost !== undefined) patch.usageCost = snapshot.usageCost && snapshot.usageCost.daily && snapshot.usageCost.daily.length > MAX_DAILY_COST_ENTRIES
      ? { ...snapshot.usageCost, daily: snapshot.usageCost.daily.slice(-MAX_DAILY_COST_ENTRIES) }
      : snapshot.usageCost;
    if (snapshot.usageStatus !== undefined) patch.usageStatus = snapshot.usageStatus;
    if (snapshot.toolsCatalog !== undefined) patch.toolsCatalog = snapshot.toolsCatalog;
    if (snapshot.skillsStatus !== undefined) patch.skillsStatus = snapshot.skillsStatus;
    if (snapshot.channelsStatus !== undefined) patch.channelsStatus = snapshot.channelsStatus;
    if (snapshot.cronScheduler !== undefined) patch.cronScheduler = snapshot.cronScheduler;
    if (snapshot.memoryStatus !== undefined) patch.memoryStatus = snapshot.memoryStatus;
    if (snapshot.configData !== undefined) patch.configData = snapshot.configData;
    if (snapshot.fileStatus !== undefined) patch.fileStatus = snapshot.fileStatus;
    if (snapshot.sessionDetails !== undefined) patch.sessionDetails = snapshot.sessionDetails;

    this.update(patch);
  }

  private update(patch: Partial<DashboardState>): void {
    const now = Date.now();
    const ts = now - this.lastNotifiedAt >= DashboardStore.UPDATE_DEBOUNCE_MS
      ? new Date(now).toISOString()
      : this.state.lastUpdatedAt ?? new Date(now).toISOString();
    if (ts !== this.state.lastUpdatedAt) this.lastNotifiedAt = now;

    this.state = {
      ...this.state,
      ...patch,
      lastUpdatedAt: ts,
    };
    for (const listener of this.listeners) {
      try { listener(this.state); } catch (err) { console.error('[clawsprawl:store] listener error:', err); }
    }
  }
}