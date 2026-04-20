/**
 * Browser-side dashboard bootstrap.
 *
 * Public cards hydrate from `/api/public/*` routes and remain visible without
 * auth. Private cards and the raw realtime activity feed unlock only after a
 * server-validated ClawSprawl bearer token creates a server-backed httpOnly session.
 *
 * @module dashboard/bootstrap
 */

import { countSessionsByAgent } from './adapters';
import { PRIVATE_DASHBOARD_PANELS, PUBLIC_DASHBOARD_PANELS, type DashboardPanelDefinition } from './panel-config';
import {
  connectionClass,
  renderAgentRows,
  renderChannelsStatusRows,
  renderConfigRows,
  renderCronRows,
  renderCronSchedulerRows,
  renderEventRows,
  renderFileTrackingRows,
  renderHealthRows,
  renderMemoryStatusRows,
  renderModelRows,
  renderPermissionActivityRows,
  renderPresenceRows,
  renderProviderRows,
  renderSessionDetailRows,
  renderSessionRows,
  renderSkeletonRows,
  renderSkillsRows,
  renderStatusRows,
  renderToolCatalogRows,
  renderToolExecutionRows,
  renderUsageCostRows,
} from './renderers';
import { DashboardStore } from './store';
import type { DashboardSnapshotPayload, DashboardState } from './store';

export const BOOTSTRAP_CONFIG = {
  STALE_THRESHOLD_MS: 90_000,
  REFRESH_INTERVAL_MS: 30_000,
  EVENT_BATCH_DEBOUNCE_MS: 500,
  MAX_EVENTS: 200,
  STALE_CHECK_INTERVAL_MS: 5_000,
  PUBLIC_DASHBOARD_API_URL: '/api/public/dashboard.json',
  PRIVATE_DASHBOARD_API_URL: '/api/private/dashboard.json',
  PUBLIC_EVENTS_API_URL: '/api/public/events',
  PRIVATE_EVENTS_API_URL: '/api/private/events',
  PRIVATE_SESSION_API_URL: '/api/private/session',
} as const;

interface DashboardRootDataset {
  privateViewEnabled: boolean;
  privateConfigured: boolean;
  accessMode: 'public' | 'token' | 'insecure';
}

interface DashboardElements {
  rootEl: HTMLElement | null;
  stateEl: HTMLElement | null;
  agentsEl: HTMLElement | null;
  sessionsEl: HTMLElement | null;
  updatedEl: HTMLElement | null;
  messageEl: HTMLElement | null;
  agentListEl: HTMLElement | null;
  eventListEl: HTMLElement | null;
  eventFiltersEl: HTMLElement | null;
  retryButtonEl: HTMLButtonElement | null;
  retryNoteEl: HTMLElement | null;
  staleBadgeEl: HTMLElement | null;
  reconnectCountEl: HTMLElement | null;
  errorCountEl: HTMLElement | null;
  heroAgentCountEl: HTMLElement | null;
  heroStatusDotEl: HTMLElement | null;
  heroStatusTextEl: HTMLElement | null;
  privateViewFormEl: HTMLFormElement | null;
  privateViewTokenEl: HTMLInputElement | null;
  privateViewLockEl: HTMLButtonElement | null;
  statusListEl: HTMLElement | null;
  healthListEl: HTMLElement | null;
  presenceListEl: HTMLElement | null;
  cronListEl: HTMLElement | null;
  providerListEl: HTMLElement | null;
  sessionListEl: HTMLElement | null;
  modelListEl: HTMLElement | null;
  usageCostListEl: HTMLElement | null;
  memoryStatusListEl: HTMLElement | null;
  toolCatalogListEl: HTMLElement | null;
  skillsListEl: HTMLElement | null;
  channelsStatusListEl: HTMLElement | null;
  cronSchedulerListEl: HTMLElement | null;
  configListEl: HTMLElement | null;
  permissionActivityListEl: HTMLElement | null;
  toolExecutionListEl: HTMLElement | null;
  fileTrackingListEl: HTMLElement | null;
  sessionDetailListEl: HTMLElement | null;
}

type MetadataPanelKey = DashboardPanelDefinition['key'];

function queryElements(): DashboardElements {
  const elements: DashboardElements = {
    rootEl: document.querySelector('#gateway-dashboard-root'),
    stateEl: document.querySelector('#gateway-connection-state'),
    agentsEl: document.querySelector('#gateway-agents'),
    sessionsEl: document.querySelector('#gateway-sessions'),
    updatedEl: document.querySelector('#gateway-updated'),
    messageEl: document.querySelector('#gateway-message'),
    agentListEl: document.querySelector('#gateway-agent-list'),
    eventListEl: document.querySelector('#gateway-event-list'),
    eventFiltersEl: document.querySelector('#gateway-event-filters'),
    retryButtonEl: document.querySelector('#gateway-retry'),
    retryNoteEl: document.querySelector('#gateway-retry-note'),
    staleBadgeEl: document.querySelector('#gateway-stale-badge'),
    reconnectCountEl: document.querySelector('#gateway-reconnect-count'),
    errorCountEl: document.querySelector('#gateway-error-count'),
    heroAgentCountEl: document.querySelector('#hero-agent-count'),
    heroStatusDotEl: document.querySelector('#hero-status-dot'),
    heroStatusTextEl: document.querySelector('#hero-status-text'),
    privateViewFormEl: document.querySelector('#private-view-form'),
    privateViewTokenEl: document.querySelector('#private-view-token'),
    privateViewLockEl: document.querySelector('#private-view-lock'),
    statusListEl: null,
    healthListEl: null,
    presenceListEl: null,
    cronListEl: null,
    providerListEl: null,
    sessionListEl: null,
    modelListEl: null,
    usageCostListEl: null,
    memoryStatusListEl: null,
    toolCatalogListEl: null,
    skillsListEl: null,
    channelsStatusListEl: null,
    cronSchedulerListEl: null,
    configListEl: null,
    permissionActivityListEl: null,
    toolExecutionListEl: null,
    fileTrackingListEl: null,
    sessionDetailListEl: null,
  };

  for (const panel of [...PUBLIC_DASHBOARD_PANELS, ...PRIVATE_DASHBOARD_PANELS]) {
    elements[panel.key as MetadataPanelKey] = document.querySelector(`#${panel.id}`);
  }

  return elements;
}

function setText(node: HTMLElement | null, value: string): void {
  if (node) node.textContent = value;
}

function readRootDataset(rootEl: HTMLElement | null): DashboardRootDataset {
  const mode = rootEl?.getAttribute('data-access-mode');
  return {
    privateViewEnabled: rootEl?.getAttribute('data-private-view-enabled') === 'true',
    privateConfigured: rootEl?.getAttribute('data-private-configured') === 'true',
    accessMode: mode === 'token' || mode === 'insecure' ? mode : 'public',
  };
}

function applySnapshotToStore(store: DashboardStore, snapshot: DashboardSnapshotPayload, fallbackState?: DashboardState): void {
  store.applySnapshot({
    connectionState: snapshot.connectionState ?? fallbackState?.connectionState ?? 'idle',
    lastSuccessfulSnapshotAt: snapshot.lastSuccessfulSnapshotAt,
    stale: snapshot.stale,
    reconnectCount: snapshot.reconnectCount,
    errorCount: snapshot.errorCount,
    status: snapshot.status,
    agents: snapshot.agents,
    sessions: snapshot.sessions,
    cronJobs: snapshot.cronJobs,
    cronRuns: snapshot.cronRuns,
    models: snapshot.models,
    health: snapshot.health,
    presence: snapshot.presence,
    usageCost: snapshot.usageCost,
    usageStatus: snapshot.usageStatus,
    toolsCatalog: snapshot.toolsCatalog,
    skillsStatus: snapshot.skillsStatus,
    channelsStatus: snapshot.channelsStatus,
    cronScheduler: snapshot.cronScheduler,
    memoryStatus: snapshot.memoryStatus,
    configData: snapshot.configData,
    fileStatus: snapshot.fileStatus,
    sessionDetails: snapshot.sessionDetails,
  });
}

interface GatewayDashboardOptions {
  publicDashboardApiUrl?: string;
  privateDashboardApiUrl?: string;
  publicEventsApiUrl?: string;
  privateEventsApiUrl?: string;
  privateSessionApiUrl?: string;
}

export function initGatewayDashboard(options: GatewayDashboardOptions = {}): void {
  const elements = queryElements();
  let enabledFilters = new Set(['cron', 'heartbeat', 'session', 'message', 'tool', 'permission', 'file', 'health', 'presence', 'other']);
  let fetchInFlight = false;
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let staleTimer: ReturnType<typeof setInterval> | null = null;
  let eventDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let publicEventSource: EventSource | null = null;
  let privateEventSource: EventSource | null = null;
  const staleThresholdMs = BOOTSTRAP_CONFIG.STALE_THRESHOLD_MS;

  const publicDashboardApiUrl = options.publicDashboardApiUrl ?? BOOTSTRAP_CONFIG.PUBLIC_DASHBOARD_API_URL;
  const privateDashboardApiUrl = options.privateDashboardApiUrl ?? BOOTSTRAP_CONFIG.PRIVATE_DASHBOARD_API_URL;
  const publicEventsApiUrl = options.publicEventsApiUrl ?? BOOTSTRAP_CONFIG.PUBLIC_EVENTS_API_URL;
  const privateEventsApiUrl = options.privateEventsApiUrl ?? BOOTSTRAP_CONFIG.PRIVATE_EVENTS_API_URL;
  const privateSessionApiUrl = options.privateSessionApiUrl ?? BOOTSTRAP_CONFIG.PRIVATE_SESSION_API_URL;
  const rootDataset = readRootDataset(elements.rootEl);

  const store = new DashboardStore(BOOTSTRAP_CONFIG.MAX_EVENTS);
  const privateViewEnabled = rootDataset.privateViewEnabled;
  const privateConfigured = rootDataset.privateConfigured;

  const panelKeys: (keyof DashboardElements)[] = [
    'agentListEl',
    ...PUBLIC_DASHBOARD_PANELS.map((panel) => panel.key),
    ...(privateViewEnabled ? ['eventListEl' as const, ...PRIVATE_DASHBOARD_PANELS.map((panel) => panel.key)] : []),
  ];

  function renderSkeletons(): void {
    const skeleton = renderSkeletonRows(3);
    for (const key of panelKeys) {
      const el = elements[key];
      if (el) (el as HTMLElement).innerHTML = skeleton;
    }
  }

  function scheduleRefresh(): void {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      void fetchDashboard();
    }, BOOTSTRAP_CONFIG.REFRESH_INTERVAL_MS);
  }

  function scheduleStaleChecks(): void {
    if (staleTimer) clearInterval(staleTimer);
    staleTimer = setInterval(() => {
      const snapshot = store.getSnapshot();
      const source = snapshot.lastSuccessfulSnapshotAt ?? snapshot.lastUpdatedAt;
      if (!source) {
        store.setStale(true);
        return;
      }
      const age = Date.now() - new Date(source).getTime();
      store.setStale(age > staleThresholdMs);
    }, BOOTSTRAP_CONFIG.STALE_CHECK_INTERVAL_MS);
  }

  function scheduleEventRefresh(): void {
    if (eventDebounceTimer) return;
    eventDebounceTimer = setTimeout(() => {
      eventDebounceTimer = null;
      void fetchDashboard();
    }, BOOTSTRAP_CONFIG.EVENT_BATCH_DEBOUNCE_MS);
  }

  window.addEventListener('beforeunload', () => {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    if (staleTimer) { clearInterval(staleTimer); staleTimer = null; }
    if (eventDebounceTimer) { clearTimeout(eventDebounceTimer); eventDebounceTimer = null; }
    if (publicEventSource) { publicEventSource.close(); publicEventSource = null; }
    if (privateEventSource) { privateEventSource.close(); privateEventSource = null; }
    unsubscribeStore();
    if (elements.eventFiltersEl) elements.eventFiltersEl.removeEventListener('change', onFilterChange);
    if (elements.retryButtonEl) elements.retryButtonEl.removeEventListener('click', onRetryClick);
    if (elements.privateViewFormEl) elements.privateViewFormEl.removeEventListener('submit', onFormSubmit);
    if (elements.privateViewLockEl) elements.privateViewLockEl.removeEventListener('click', onLockClick);
  });

  const renderState = (state: DashboardState): void => {
    setText(elements.stateEl, state.connectionState);
    if (elements.stateEl) elements.stateEl.className = connectionClass(state.connectionState);

    setText(elements.agentsEl, String(state.agents.length));
    setText(elements.sessionsEl, String(state.sessions.length));
    setText(elements.updatedEl, state.lastUpdatedAt ? new Date(state.lastUpdatedAt).toLocaleTimeString() : '-');

    if (elements.agentListEl) {
      elements.agentListEl.innerHTML = renderAgentRows(state, countSessionsByAgent(state.sessions));
    }

    if (privateViewEnabled && elements.eventListEl) {
      elements.eventListEl.innerHTML = renderEventRows(state, enabledFilters);
    }

  const panelRenderers: Record<MetadataPanelKey, (s: typeof state) => string> = {
    cronListEl: renderCronRows,
    providerListEl: renderProviderRows,
    sessionListEl: renderSessionRows,
    modelListEl: renderModelRows,
    healthListEl: renderHealthRows,
    statusListEl: renderStatusRows,
    presenceListEl: renderPresenceRows,
    usageCostListEl: renderUsageCostRows,
    toolCatalogListEl: renderToolCatalogRows,
    skillsListEl: renderSkillsRows,
    channelsStatusListEl: renderChannelsStatusRows,
    cronSchedulerListEl: renderCronSchedulerRows,
    memoryStatusListEl: renderMemoryStatusRows,
    configListEl: renderConfigRows,
    permissionActivityListEl: renderPermissionActivityRows,
    toolExecutionListEl: renderToolExecutionRows,
    fileTrackingListEl: renderFileTrackingRows,
    sessionDetailListEl: renderSessionDetailRows,
  };

    const panelCache = new Map<string, string>();

    const safeSetInnerHTML = (el: HTMLElement | null, html: string, cacheKey: string): void => {
      if (!el) return;
      const prev = panelCache.get(cacheKey);
      if (prev === html) return;
      panelCache.set(cacheKey, html);
      el.innerHTML = html;
    };

    for (const panel of PUBLIC_DASHBOARD_PANELS) {
      const el = elements[panel.key];
      if (el) {
        try {
          safeSetInnerHTML(el as HTMLElement, panelRenderers[panel.key](state), panel.key);
        } catch (err) {
          console.error(`Panel ${panel.key} render failed:`, err);
          (el as HTMLElement).innerHTML = '<li class="text-red-400">Panel render error</li>';
        }
      }
    }

    if (privateViewEnabled) {
      for (const panel of PRIVATE_DASHBOARD_PANELS) {
        const el = elements[panel.key];
        if (el) safeSetInnerHTML(el as HTMLElement, panelRenderers[panel.key](state), panel.key);
      }
    }

    setText(elements.reconnectCountEl, String(state.reconnectCount));
    setText(elements.errorCountEl, String(state.errorCount));
    if (elements.staleBadgeEl) {
      elements.staleBadgeEl.textContent = state.stale ? 'stale ⚠️' : 'fresh ✅';
      elements.staleBadgeEl.className = state.stale ? 'status-badge status-error' : 'status-badge status-ok';
    }

    if (elements.retryNoteEl) {
      if (state.connectionState === 'connected') {
        elements.retryNoteEl.textContent = privateViewEnabled
          ? 'Connected via SSR. Public and private views are live.'
          : 'Connected via SSR. Public view is live.';
      } else if (state.connectionState === 'reconnecting') {
        elements.retryNoteEl.textContent = 'Server reconnecting to gateway...';
      } else if (state.connectionState === 'handshaking') {
        elements.retryNoteEl.textContent = 'Server authenticating with gateway...';
      } else {
        elements.retryNoteEl.textContent = 'Server-side gateway connection pending.';
      }
    }

    setText(elements.heroAgentCountEl, state.connectionState === 'connected' ? String(state.agents.length) : '-');

    if (elements.heroStatusDotEl) {
      const dotColorClass =
        state.connectionState === 'connected'
          ? 'bg-terminal-green animate-connection-pulse'
          : state.connectionState === 'connecting' || state.connectionState === 'reconnecting' || state.connectionState === 'handshaking'
            ? 'bg-terminal-amber animate-connection-pulse'
            : state.connectionState === 'error'
              ? 'bg-terminal-error'
              : 'bg-terminal-muted';
      elements.heroStatusDotEl.className = `h-2 w-2 rounded-full ${dotColorClass}`;
    }

    if (elements.heroStatusTextEl) {
      const statusText =
        state.connectionState === 'connected'
          ? `${state.agents.length} agent${state.agents.length !== 1 ? 's' : ''} online`
          : state.connectionState === 'connecting'
            ? 'Connecting to gateway...'
            : state.connectionState === 'handshaking'
              ? 'Authenticating...'
              : state.connectionState === 'reconnecting'
                ? 'Reconnecting...'
                : state.connectionState === 'error'
                  ? 'Gateway error'
                  : 'Waiting for gateway...';
      elements.heroStatusTextEl.textContent = statusText;
    }
  };

  const onFilterChange = () => {
    const selected = Array.from(elements.eventFiltersEl?.querySelectorAll('input[type="checkbox"]:checked') ?? []).map(
      (node) => node.getAttribute('value'),
    );
    enabledFilters = new Set(selected.filter((value): value is string => Boolean(value)));
    renderState(store.getSnapshot());
  };

  if (elements.eventFiltersEl) {
    elements.eventFiltersEl.addEventListener('change', onFilterChange);
  }

  const unsubscribeStore = store.subscribe(renderState);

  async function fetchSnapshot(url: string, onAuthFailure?: () => void): Promise<DashboardSnapshotPayload | null> {
    const response = await fetch(url);
    if (response.status === 401) {
      onAuthFailure?.();
      return null;
    }
    if (!response.ok) {
      console.warn('[clawsprawl] dashboard fetch failed:', response.status, url);
      store.setConnectionState('error');
      return null;
    }
    const data = await response.json();
    if (typeof data !== 'object' || data === null || !('connectionState' in data)) {
      console.warn('[clawsprawl] dashboard fetch returned invalid shape:', url);
      return null;
    }
    return data as DashboardSnapshotPayload;
  }

  async function fetchDashboard(): Promise<void> {
    if (fetchInFlight) return;
    fetchInFlight = true;

    try {
      const publicData = await fetchSnapshot(publicDashboardApiUrl);
      if (publicData) {
        applySnapshotToStore(store, publicData);
      }

      if (privateViewEnabled) {
        const privateData = await fetchSnapshot(privateDashboardApiUrl, () => {
          window.location.reload();
        });
        if (privateData) {
          applySnapshotToStore(store, privateData, store.getSnapshot());
        }
      }

      store.markSnapshotSuccess();
      const panelCount = PUBLIC_DASHBOARD_PANELS.length + 2 + (privateViewEnabled ? PRIVATE_DASHBOARD_PANELS.length + 1 : 0);
      setText(elements.messageEl, privateViewEnabled
        ? `Connected via SSR. ${panelCount} panels visible with private view unlocked.`
        : `Connected via SSR. ${panelCount} public panels visible.`);
    } catch (err) {
      console.error('[clawsprawl] dashboard fetch error:', err);
      store.setConnectionState('error');
      store.setConnectionState('error');
      setText(elements.messageEl, 'Failed to fetch dashboard data from server. Retrying...');
    } finally {
      fetchInFlight = false;
    }
  }

  function connectPublicSSE(): void {
    if (publicEventSource) publicEventSource.close();
    publicEventSource = new EventSource(publicEventsApiUrl);
    publicEventSource.addEventListener('snapshot-updated', () => {
      void fetchDashboard();
    });
    publicEventSource.onerror = () => {
      console.warn('[clawsprawl] public SSE connection error — will auto-reconnect.');
    };
  }

  function connectPrivateSSE(): void {
    if (!privateViewEnabled) return;
    if (privateEventSource) privateEventSource.close();

    privateEventSource = new EventSource(privateEventsApiUrl);
    privateEventSource.addEventListener('gateway-event', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        store.pushEvent({ type: 'event', event: data.event, payload: data.payload, seq: data.seq });
        scheduleEventRefresh();
      } catch {
        /* Ignore malformed events */
      }
    });
    privateEventSource.addEventListener('snapshot-updated', () => {
      void fetchDashboard();
    });
    privateEventSource.onerror = () => {
      console.warn('[clawsprawl] private SSE connection error — will auto-reconnect.');
    };
  }

  async function unlockPrivateView(token: string): Promise<void> {
    const response = await fetch(privateSessionApiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      setText(elements.messageEl, 'Private view unlock failed. Check your token and try again.');
      return;
    }

    window.location.reload();
  }

  async function lockPrivateView(): Promise<void> {
    await fetch(privateSessionApiUrl, { method: 'DELETE' });
    window.location.reload();
  }

  async function bootstrap(): Promise<void> {
    renderSkeletons();
    store.setConnectionState('connecting');

    await fetchDashboard();
    connectPublicSSE();
    connectPrivateSSE();
    scheduleRefresh();
    scheduleStaleChecks();
  }

  const onRetryClick = () => { void bootstrap(); };
  const onFormSubmit = (event: Event) => {
    event.preventDefault();
    const token = elements.privateViewTokenEl?.value?.trim() ?? '';
    if (!privateConfigured || token.length === 0) {
      setText(elements.messageEl, 'Enter a valid bearer token to unlock private view.');
      return;
    }
    void unlockPrivateView(token);
  };
  const onLockClick = () => { void lockPrivateView(); };

  if (elements.retryButtonEl) {
    elements.retryButtonEl.addEventListener('click', onRetryClick);
  }

  if (elements.privateViewFormEl && elements.privateViewTokenEl) {
    elements.privateViewFormEl.addEventListener('submit', onFormSubmit);
  }

  if (elements.privateViewLockEl) {
    elements.privateViewLockEl.addEventListener('click', onLockClick);
  }

  void bootstrap();
}
