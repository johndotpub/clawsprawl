/**
 * Dashboard renderer entrypoint.
 *
 * Re-exports shared renderer helpers and panel renderers from modularized
 * submodules to keep existing imports stable.
 */

export {
  connectionClass,
  escapeHtml,
  eventBucket,
  formatAge,
  formatContextWindow,
  renderSkeletonRows,
} from './renderers/shared';

export {
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
  renderSkillsRows,
  renderStatusRows,
  renderToolCatalogRows,
  renderToolExecutionRows,
  renderUsageCostRows,
} from './renderers/panels';
