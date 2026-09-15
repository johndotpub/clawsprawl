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
} from "./renderers/shared";

export {
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
 renderSkillsRows,
 renderSkillProposalRows,
 renderStatusRows,
 renderStabilityRows,
 renderToolCatalogRows,
 renderToolExecutionRows,
 renderUsageCostRows,
 renderUsageTimeseriesRows,
 renderTaskLedgerRows,
} from "./renderers/panels";
