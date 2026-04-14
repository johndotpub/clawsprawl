/**
 * Shared dashboard panel metadata.
 *
 * This module is the single source of truth for panel list IDs, titles,
 * layout classes, and list container classes used by both:
 * - `GatewayBootstrap.astro` (markup)
 * - `bootstrap.ts` (DOM lookup + rendering)
 */

/** Declarative metadata for one rendered dashboard panel list. */
export interface DashboardPanelDefinition {
  /** Internal key used by bootstrap wiring. */
  key:
    | 'statusListEl'
    | 'healthListEl'
    | 'presenceListEl'
    | 'cronListEl'
    | 'providerListEl'
    | 'sessionListEl'
    | 'modelListEl'
    | 'usageCostListEl'
    | 'memoryStatusListEl'
    | 'toolCatalogListEl'
    | 'skillsListEl'
    | 'channelsStatusListEl'
    | 'cronSchedulerListEl'
    | 'configListEl'
    | 'permissionActivityListEl'
    | 'toolExecutionListEl'
    | 'fileTrackingListEl'
    | 'sessionDetailListEl';
  /** DOM id for the panel's `<ul>` list container. */
  id: string;
  /** Human-readable panel heading. */
  title: string;
  /** Whether the panel is safe for public unauthenticated display. */
  visibility: 'public' | 'private';
  /** Short reason shown in locked preview state for private panels. */
  lockedReason?: string;
  /** Class list for the panel `<article>`. */
  articleClassName: string;
  /** Class list for the panel `<ul>`. */
  listClassName: string;
}

/**
 * Panels rendered from shared metadata.
 *
 * Note: The connection/agents panel and activity-feed panel are custom layouts
 * and remain authored directly in `GatewayBootstrap.astro`.
 */
export const DASHBOARD_PANEL_DEFINITIONS: DashboardPanelDefinition[] = [
  { key: 'statusListEl', id: 'gateway-status-list', title: 'System Status', visibility: 'public', articleClassName: 'terminal-panel', listClassName: 'mt-3 space-y-2 text-xs text-terminal-muted' },
  { key: 'healthListEl', id: 'gateway-health-list', title: 'Channel Health', visibility: 'public', articleClassName: 'terminal-panel', listClassName: 'mt-3 space-y-2 text-xs text-terminal-muted' },
  { key: 'presenceListEl', id: 'gateway-presence-list', title: 'Connected Clients', visibility: 'private', lockedReason: 'contains client identity', articleClassName: 'terminal-panel', listClassName: 'mt-3 space-y-2 text-xs text-terminal-muted' },
  { key: 'cronListEl', id: 'gateway-cron-list', title: 'Cron Health', visibility: 'public', articleClassName: 'terminal-panel', listClassName: 'mt-3 space-y-2 text-xs text-terminal-muted' },
  { key: 'providerListEl', id: 'gateway-provider-list', title: 'Model Providers', visibility: 'public', articleClassName: 'terminal-panel', listClassName: 'mt-3 space-y-2 text-xs text-terminal-muted' },
  { key: 'sessionListEl', id: 'gateway-session-list', title: 'Sessions', visibility: 'private', lockedReason: 'contains detailed operator activity', articleClassName: 'terminal-panel lg:col-span-2', listClassName: 'mt-3 max-h-64 space-y-2 overflow-auto text-xs text-terminal-muted' },
  { key: 'modelListEl', id: 'gateway-model-list', title: 'Model Browser', visibility: 'public', articleClassName: 'terminal-panel lg:col-span-2', listClassName: 'mt-3 max-h-64 space-y-2 overflow-auto text-xs text-terminal-muted' },
  { key: 'usageCostListEl', id: 'gateway-usage-cost-list', title: '🔢 Token Usage', visibility: 'public', articleClassName: 'terminal-panel', listClassName: 'mt-3 space-y-2 text-xs text-terminal-muted' },
  { key: 'memoryStatusListEl', id: 'gateway-memory-status-list', title: '🧠 Memory Health', visibility: 'public', articleClassName: 'terminal-panel', listClassName: 'mt-3 space-y-2 text-xs text-terminal-muted' },
  { key: 'toolCatalogListEl', id: 'gateway-tool-catalog-list', title: '🛠️ Tool Catalog', visibility: 'public', articleClassName: 'terminal-panel', listClassName: 'mt-3 max-h-64 space-y-2 overflow-auto text-xs text-terminal-muted' },
  { key: 'skillsListEl', id: 'gateway-skills-list', title: '🎯 Skills Inventory', visibility: 'public', articleClassName: 'terminal-panel', listClassName: 'mt-3 max-h-64 space-y-2 overflow-auto text-xs text-terminal-muted' },
  { key: 'channelsStatusListEl', id: 'gateway-channels-status-list', title: '📡 Channel Accounts', visibility: 'public', articleClassName: 'terminal-panel', listClassName: 'mt-3 space-y-2 text-xs text-terminal-muted' },
  { key: 'cronSchedulerListEl', id: 'gateway-cron-scheduler-list', title: '⏰ Scheduler', visibility: 'public', articleClassName: 'terminal-panel', listClassName: 'mt-3 space-y-2 text-xs text-terminal-muted' },
  { key: 'configListEl', id: 'gateway-config-list', title: '⚙️ Configuration', visibility: 'private', lockedReason: 'contains internal settings', articleClassName: 'terminal-panel lg:col-span-2', listClassName: 'mt-3 max-h-64 space-y-2 overflow-auto text-xs text-terminal-muted' },
  { key: 'permissionActivityListEl', id: 'gateway-permission-activity-list', title: '🔐 Permission Activity', visibility: 'private', lockedReason: 'contains approval activity', articleClassName: 'terminal-panel', listClassName: 'mt-3 max-h-56 space-y-2 overflow-auto text-xs text-terminal-muted' },
  { key: 'toolExecutionListEl', id: 'gateway-tool-execution-list', title: '⚡ Tool Executions', visibility: 'private', lockedReason: 'contains tool activity', articleClassName: 'terminal-panel', listClassName: 'mt-3 max-h-56 space-y-2 overflow-auto text-xs text-terminal-muted' },
  { key: 'fileTrackingListEl', id: 'gateway-file-tracking-list', title: '📂 File Changes', visibility: 'private', lockedReason: 'contains file paths', articleClassName: 'terminal-panel lg:col-span-2', listClassName: 'mt-3 max-h-64 space-y-2 overflow-auto text-xs text-terminal-muted' },
  { key: 'sessionDetailListEl', id: 'gateway-session-detail-list', title: '📋 Session Details', visibility: 'private', lockedReason: 'contains detailed session data', articleClassName: 'terminal-panel lg:col-span-2', listClassName: 'mt-3 max-h-64 space-y-2 overflow-auto text-xs text-terminal-muted' },
];

/** Dashboard panel count shown in connection status copy. */
export const DASHBOARD_PANEL_COUNT = DASHBOARD_PANEL_DEFINITIONS.length + 2;

/** Panels that can be shown publicly without auth. */
export const PUBLIC_DASHBOARD_PANELS = DASHBOARD_PANEL_DEFINITIONS.filter((panel) => panel.visibility === 'public');

/** Panels that require private-view auth to reveal live data. */
export const PRIVATE_DASHBOARD_PANELS = DASHBOARD_PANEL_DEFINITIONS.filter((panel) => panel.visibility === 'private');
