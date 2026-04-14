/**
 * Server-side gateway service singleton.
 *
 * Maintains a persistent WebSocket connection **and** an SSE stream to the
 * OpenClaw gateway, caches the latest RPC results, and exposes methods for
 * Astro API routes to retrieve pre-normalized dashboard data. The WS carries
 * RPC responses + subscribed events, while the SSE stream provides the full
 * gateway event bus (tool executions, file edits, permissions, etc.).
 * The gateway token is read from the server-side `OPENCLAW_GATEWAY_TOKEN`
 * env var — it is NEVER exposed to the browser.
 *
 * @module server-service
 */

import { GatewayClient } from './client';
import { GatewaySseClient } from './sse-client';
import {
  normalizeAgents, normalizeChannelsStatus, normalizeConfigData, normalizeCronJobs,
  normalizeCronRuns, normalizeCronScheduler, normalizeFileStatus,
  normalizeHealth, normalizeMemoryStatus,
  normalizeModels, normalizePresence, normalizeSessionDetails, normalizeSessions,
  normalizeSkillsStatus, normalizeStatus, normalizeToolsCatalog, normalizeUsageCost,
  normalizeUsageStatus,
  countSessionsByAgent,
} from '../dashboard/adapters';
import type { EventFrame, ConnectionState } from './types';
import type { FileStatusEntry, ConfigResponse, SessionDetailEntry } from './types';
import { CLIENT_VERSION } from './protocol';

/** Parse comma-separated gateway scopes from env into a trimmed array. */
function parseGatewayScopes(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const scopes = value
    .split(',')
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
  return scopes.length > 0 ? scopes : undefined;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Server-side service configuration constants. */
export const SERVICE_CONFIG = {
  /** Interval between automatic RPC data refreshes (ms). Polls are reconciliation only; events drive real-time updates. */
  REFRESH_INTERVAL_MS: 120_000,
  /** Debounce window for event-driven cache invalidation (ms). */
  EVENT_INVALIDATION_DEBOUNCE_MS: 500,
  /** Maximum events retained in the server-side ring buffer. */
  MAX_EVENTS: 500,
  /** Default gateway WebSocket URL. */
  DEFAULT_GATEWAY_URL: 'ws://localhost:18789/ws',
  /** Fallback gateway WebSocket URL. */
  FALLBACK_GATEWAY_URL: 'ws://127.0.0.1:18789/ws',
  /** Default gateway HTTP base URL (used for SSE and REST endpoints). */
  DEFAULT_GATEWAY_HTTP_URL: 'http://127.0.0.1:18789',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Cached panel data served to browser via API routes. @internal */
export interface DashboardSnapshot {
  connectionState: ConnectionState;
  lastUpdatedAt: string | null;
  lastSuccessfulSnapshotAt: string | null;
  stale: boolean;
  reconnectCount: number;
  errorCount: number;
  agents: ReturnType<typeof normalizeAgents>;
  sessions: ReturnType<typeof normalizeSessions>;
  cronJobs: ReturnType<typeof normalizeCronJobs>;
  cronRuns: ReturnType<typeof normalizeCronRuns>;
  models: ReturnType<typeof normalizeModels>;
  health: ReturnType<typeof normalizeHealth> | null;
  status: ReturnType<typeof normalizeStatus> | null;
  presence: ReturnType<typeof normalizePresence>;
  usageCost: ReturnType<typeof normalizeUsageCost> | null;
  usageStatus: ReturnType<typeof normalizeUsageStatus> | null;
  toolsCatalog: ReturnType<typeof normalizeToolsCatalog> | null;
  skillsStatus: ReturnType<typeof normalizeSkillsStatus> | null;
  channelsStatus: ReturnType<typeof normalizeChannelsStatus> | null;
  cronScheduler: ReturnType<typeof normalizeCronScheduler> | null;
  memoryStatus: ReturnType<typeof normalizeMemoryStatus> | null;
  configData: ConfigResponse | null;
  fileStatus: FileStatusEntry[] | null;
  sessionDetails: SessionDetailEntry[] | null;
  sessionsByAgent: ReturnType<typeof countSessionsByAgent>;
  serverVersion: string | null;
  availableMethods: string[];
  availableEvents: string[];
}

/** Listener for server-side events forwarded to browser SSE clients. @internal */
export type ServerEventListener = (event: EventFrame) => void;

/** Listener notified when the dashboard snapshot is refreshed. @internal */
export type SnapshotUpdatedListener = () => void;

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

/**
 * Server-side gateway integration service.
 *
 * This class is instantiated once per Astro server process and maintains the
 * persistent WebSocket connection to the OpenClaw gateway. Browser clients
 * never connect to the gateway directly — they consume data from Astro API
 * routes which read from this service's cache.
 */
export class GatewayServerService {
  private client: GatewayClient;
  private sseClient: GatewaySseClient;
  private httpBaseUrl: string;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private invalidationTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshInFlight = false;
  private reconnectCount = 0;
  private errorCount = 0;
  private eventBuffer: EventFrame[] = [];
  private eventSeq = 0;
  private eventListeners = new Set<ServerEventListener>();
  private snapshotListeners = new Set<SnapshotUpdatedListener>();
  private initialized = false;
  private initializeInFlight: Promise<void> | null = null;

  /** Cached dashboard data. */
  private cache: DashboardSnapshot = {
    connectionState: 'idle',
    lastUpdatedAt: null,
    lastSuccessfulSnapshotAt: null,
    stale: true,
    reconnectCount: 0,
    errorCount: 0,
    agents: [],
    sessions: [],
    cronJobs: [],
    cronRuns: [],
    models: [],
    health: null,
    status: null,
    presence: [],
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
    sessionsByAgent: new Map(),
    serverVersion: null,
    availableMethods: [],
    availableEvents: [],
  };

  constructor() {
    const gatewayUrl = process.env.OPENCLAW_GATEWAY_WS_URL
      ?? SERVICE_CONFIG.DEFAULT_GATEWAY_URL;
    const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN ?? '';
    const gatewayScopes = parseGatewayScopes(process.env.OPENCLAW_GATEWAY_SCOPES);

    this.client = new GatewayClient({
      url: gatewayUrl,
      fallbackUrl: SERVICE_CONFIG.FALLBACK_GATEWAY_URL,
      token: gatewayToken || undefined,
      clientId: 'openclaw-control-ui',
      clientMode: 'webchat',
      clientVersion: CLIENT_VERSION,
      clientDisplayName: 'ClawSprawl Dashboard (SSR)',
      role: 'operator',
      scopes: gatewayScopes,
      reconnect: true,
      origin: process.env.OPENCLAW_GATEWAY_HTTP_URL ?? SERVICE_CONFIG.DEFAULT_GATEWAY_HTTP_URL,
    });

    this.client.onStateChange((state) => {
      this.cache.connectionState = state;
      if (state === 'reconnecting') {
        this.reconnectCount += 1;
        this.cache.reconnectCount = this.reconnectCount;
      }
      if (state === 'error') {
        this.errorCount += 1;
        this.cache.errorCount = this.errorCount;
      }
      if (state === 'connected') {
        this.scheduleRefresh();
      }
    });

    this.client.onEvent((event) => {
      this.pushEvent(event);
      this.scheduleInvalidation();
    });

    // --- SSE client for the gateway's full event bus ---
    this.httpBaseUrl = process.env.OPENCLAW_GATEWAY_HTTP_URL
      ?? SERVICE_CONFIG.DEFAULT_GATEWAY_HTTP_URL;

    this.sseClient = new GatewaySseClient({
      url: `${this.httpBaseUrl}/event`,
      token: gatewayToken || undefined,
      reconnect: true,
    });

    this.sseClient.onEvent((event) => {
      this.pushEvent(event);
      this.scheduleInvalidation();
    });

    this.sseClient.onStateChange((state) => {
      if (state === 'error') {
        console.warn('[clawsprawl:server] SSE stream error — will auto-reconnect.');
      }
    });
  }

  // --- Public API ---

  /**
   * Initialize the service: connect to the gateway and start polling.
   * Safe to call multiple times — only the first call has effect.
   *
   * @returns A promise that resolves once the gateway connection and initial data refresh complete.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializeInFlight) {
      await this.initializeInFlight;
      return;
    }

    this.initializeInFlight = this.initializeInternal();
    try {
      await this.initializeInFlight;
    } finally {
      this.initializeInFlight = null;
    }
  }

  /**
   * Run one initialization attempt.
   *
   * Sets `initialized=true` only after the gateway handshake and first refresh
   * complete successfully. If initialization fails, the service remains
   * re-initializable on the next request.
   */
  private async initializeInternal(): Promise<void> {
    try {
      const helloOk = await this.client.connect();

      if (helloOk.server) {
        this.cache.serverVersion = helloOk.server.version;
        this.cache.status = normalizeStatus({
          ok: true,
          version: helloOk.server.version,
          runtimeVersion: helloOk.server.version,
          uptimeMs: helloOk.snapshot?.uptimeMs,
        });
      }

      if (helloOk.snapshot?.presence) {
        this.cache.presence = normalizePresence(helloOk.snapshot.presence);
      }

      if (helloOk.snapshot?.health) {
        this.cache.health = normalizeHealth(helloOk.snapshot.health);
      }

      this.cache.availableMethods = helloOk.features?.methods ?? [];
      this.cache.availableEvents = helloOk.features?.events ?? [];

      await this.refreshData();

      // Start SSE stream for gateway event bus (runs alongside WS)
      void this.sseClient.connect();
      this.initialized = true;
    } catch (err) {
      console.warn('[clawsprawl:server] gateway bootstrap failed:', err);
      this.cache.connectionState = 'error';
      this.initialized = false;
    }
  }

  /**
   * Get the current cached dashboard snapshot.
   *
   * @returns A shallow copy of the current {@link DashboardSnapshot}.
   */
  getSnapshot(): DashboardSnapshot {
    return { ...this.cache };
  }

  /**
   * Get buffered events since a given sequence number.
   *
   * @param sinceSeq - Sequence number after which to return events.
   * @returns An object containing the matching events and the latest sequence number.
   */
  getEventsSince(sinceSeq: number): { events: (EventFrame & { seq: number })[]; latestSeq: number } {
    const events = this.eventBuffer
      .filter((e) => ((e as EventFrame & { seq: number }).seq ?? 0) > sinceSeq)
      .map((e) => e as EventFrame & { seq: number });
    return { events, latestSeq: this.eventSeq };
  }

  /**
   * Subscribe to real-time events for SSE forwarding. Returns unsubscribe function.
   *
   * @param listener - Callback invoked for each buffered {@link EventFrame}.
   * @returns An unsubscribe function that removes the listener.
   */
  onEvent(listener: ServerEventListener): () => void {
    this.eventListeners.add(listener);
    return () => { this.eventListeners.delete(listener); };
  }

  /**
   * Subscribe to snapshot-updated notifications. Fires after each successful
   * {@link refreshData} cycle so SSE clients can push a `snapshot-updated`
   * event to the browser.
   *
   * @param listener - Callback invoked when a fresh snapshot is available.
   * @returns An unsubscribe function that removes the listener.
   */
  onSnapshotUpdated(listener: SnapshotUpdatedListener): () => void {
    this.snapshotListeners.add(listener);
    return () => { this.snapshotListeners.delete(listener); };
  }

  /** Current gateway connection state. */
  get connectionState(): ConnectionState {
    return this.cache.connectionState;
  }

  // --- Internal ---

  /** Push an event into the ring buffer and notify SSE listeners. */
  private pushEvent(event: EventFrame): void {
    this.eventSeq += 1;
    const stamped = { ...event, seq: this.eventSeq };
    this.eventBuffer.push(stamped);
    if (this.eventBuffer.length > SERVICE_CONFIG.MAX_EVENTS) {
      this.eventBuffer = this.eventBuffer.slice(-SERVICE_CONFIG.MAX_EVENTS);
    }
    for (const listener of this.eventListeners) {
      try { listener(stamped); } catch { /* swallow listener errors */ }
    }
  }

  /** Schedule a debounced cache invalidation (re-fetch) after receiving events. */
  private scheduleInvalidation(): void {
    if (this.invalidationTimer) return;
    this.invalidationTimer = setTimeout(() => {
      this.invalidationTimer = null;
      void this.refreshData();
    }, SERVICE_CONFIG.EVENT_INVALIDATION_DEBOUNCE_MS);
  }

  /** Schedule periodic polling as a reconciliation fallback. */
  private scheduleRefresh(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(() => {
      void this.refreshData();
    }, SERVICE_CONFIG.REFRESH_INTERVAL_MS);
  }

  /**
   * Safely apply a normalizer to raw RPC data, logging and swallowing errors.
   * Each normalizer runs independently so one failure cannot block others.
   *
   * @param label - Human-readable label for error logging (e.g. "status").
   * @param raw - Raw RPC response data (null if the RPC call failed).
   * @param normalizer - Normalizer function to apply to the raw data.
   * @returns The normalized result, or `undefined` if `raw` is null or the normalizer throws.
   */
  private safeNormalize<T>(label: string, raw: unknown, normalizer: (data: unknown) => T): T | undefined {
    if (!raw) return undefined;
    try {
      return normalizer(raw);
    } catch (err) {
      console.warn(`[clawsprawl:server] normalizer "${label}" failed:`, err);
      return undefined;
    }
  }

  /** Notify all snapshot listeners that a fresh snapshot is available. */
  private notifySnapshotUpdated(): void {
    for (const listener of this.snapshotListeners) {
      try { listener(); } catch { /* swallow listener errors */ }
    }
  }

  /** Fetch all dashboard data via RPC calls. */
  private async refreshData(): Promise<void> {
    if (this.refreshInFlight || this.client.connectionState !== 'connected') return;

    this.refreshInFlight = true;

    try {
      // Parallel RPC fetches — all data comes from the gateway WebSocket
      const [status, agents, sessions, cronJobs, cronRuns, models, health, presence, usageCost, usageStatus, toolsCatalog, skillsStatus, channelsStatus, cronScheduler, memoryStatus, configData, fileStatus] = await Promise.all([
        this.client.call('status').catch(() => null),
        this.client.call('agents.list').catch(() => null),
        this.client.call('sessions.list').catch(() => null),
        this.client.call('cron.list').catch(() => null),
        this.client.call('cron.runs').catch(() => null),
        this.client.call('models.list').catch(() => null),
        this.client.call('health').catch(() => null),
        this.client.call('presence.list').catch(() => null),
        this.client.call('usage.cost').catch(() => null),
        this.client.call('usage.status').catch(() => null),
        this.client.call('tools.catalog').catch(() => null),
        this.client.call('skills.status').catch(() => null),
        this.client.call('channels.status').catch(() => null),
        this.client.call('cron.status').catch(() => null),
        this.client.call('doctor.memory.status').catch(() => null),
        this.client.call('config.get').catch(() => null),
        this.client.call('agents.files.list').catch(() => null),
      ]);

      // Each normalizer is wrapped individually so one failure cannot block
      // others from caching their results. This is critical for resilience
      // against unexpected gateway response shapes.
      const nStatus = this.safeNormalize('status', status, (d) => normalizeStatus(d as Record<string, unknown>));
      const nAgents = this.safeNormalize('agents', agents, normalizeAgents);
      const nSessions = this.safeNormalize('sessions', sessions, normalizeSessions);
      const nCronJobs = this.safeNormalize('cronJobs', cronJobs, normalizeCronJobs);
      const nCronRuns = this.safeNormalize('cronRuns', cronRuns, normalizeCronRuns);
      const nModels = this.safeNormalize('models', models, normalizeModels);
      const nHealth = this.safeNormalize('health', health, (d) => normalizeHealth(d as Record<string, unknown>));
      const nPresence = this.safeNormalize('presence', presence, normalizePresence);
      const nUsageCost = this.safeNormalize('usageCost', usageCost, normalizeUsageCost);
      const nUsageStatus = this.safeNormalize('usageStatus', usageStatus, normalizeUsageStatus);
      const nToolsCatalog = this.safeNormalize('toolsCatalog', toolsCatalog, normalizeToolsCatalog);
      const nSkillsStatus = this.safeNormalize('skillsStatus', skillsStatus, normalizeSkillsStatus);
      const nChannelsStatus = this.safeNormalize('channelsStatus', channelsStatus, normalizeChannelsStatus);
      const nCronScheduler = this.safeNormalize('cronScheduler', cronScheduler, normalizeCronScheduler);
      const nMemoryStatus = this.safeNormalize('memoryStatus', memoryStatus, normalizeMemoryStatus);
      const nConfigData = this.safeNormalize('configData', configData, normalizeConfigData);
      const nFileStatus = this.safeNormalize('fileStatus', fileStatus, normalizeFileStatus);

      // Session details derived from sessions.list — no separate RPC needed
      const nSessionDetails = this.safeNormalize('sessionDetails', sessions, normalizeSessionDetails);

      if (nStatus !== undefined) this.cache.status = nStatus;
      if (nAgents !== undefined) this.cache.agents = nAgents;
      if (nSessions !== undefined) {
        this.cache.sessions = nSessions;
        this.cache.sessionsByAgent = countSessionsByAgent(nSessions);
      }
      if (nSessionDetails !== undefined) this.cache.sessionDetails = nSessionDetails;
      if (nCronJobs !== undefined) this.cache.cronJobs = nCronJobs;
      if (nCronRuns !== undefined) this.cache.cronRuns = nCronRuns;
      if (nModels !== undefined) this.cache.models = nModels;
      if (nHealth !== undefined) this.cache.health = nHealth;
      if (nPresence !== undefined) this.cache.presence = nPresence;
      if (nUsageCost !== undefined) this.cache.usageCost = nUsageCost;
      if (nUsageStatus !== undefined) this.cache.usageStatus = nUsageStatus;
      if (nToolsCatalog !== undefined) this.cache.toolsCatalog = nToolsCatalog;
      if (nSkillsStatus !== undefined) this.cache.skillsStatus = nSkillsStatus;
      if (nChannelsStatus !== undefined) this.cache.channelsStatus = nChannelsStatus;
      if (nCronScheduler !== undefined) this.cache.cronScheduler = nCronScheduler;
      if (nMemoryStatus !== undefined) this.cache.memoryStatus = nMemoryStatus;
      if (nConfigData !== undefined) this.cache.configData = nConfigData;
      if (nFileStatus !== undefined) this.cache.fileStatus = nFileStatus;

      const now = new Date().toISOString();
      this.cache.lastUpdatedAt = now;
      this.cache.lastSuccessfulSnapshotAt = now;
      this.cache.stale = false;

      this.notifySnapshotUpdated();
    } catch (err) {
      console.warn('[clawsprawl:server] data refresh failed:', err);
    } finally {
      this.refreshInFlight = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

let _instance: GatewayServerService | null = null;

/**
 * Get the global server-side gateway service singleton.
 * Creates the instance on first call. Call {@link initializeService} to
 * start the gateway connection.
 *
 * @returns The singleton {@link GatewayServerService} instance.
 */
export function getServerService(): GatewayServerService {
  if (!_instance) {
    _instance = new GatewayServerService();
  }
  return _instance;
}

/**
 * Initialize the server-side gateway connection.
 * Safe to call multiple times — only the first call connects.
 *
 * @returns A promise that resolves with the initialized {@link GatewayServerService} singleton.
 */
export async function initializeService(): Promise<GatewayServerService> {
  const service = getServerService();
  await service.initialize();
  return service;
}
