import type { APIRoute } from 'astro';
import { buildPublicSnapshot } from '../../../lib/dashboard/public-private';
import { getServerService, initializeService } from '../../../lib/gateway/server-service';

/** GET /api/public/dashboard.json — return public-safe cached dashboard snapshot. */
export const GET: APIRoute = async () => {
  const service = getServerService();
  await initializeService();

  const snapshot = buildPublicSnapshot(service.getSnapshot());
  const serializable = {
    connectionState: snapshot.connectionState,
    lastUpdatedAt: snapshot.lastUpdatedAt,
    agents: snapshot.agents,
    sessions: snapshot.sessions,
    models: snapshot.models,
    health: snapshot.health,
    status: snapshot.status,
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
    sessionsByAgent: {},
    serverVersion: snapshot.serverVersion,
    availableMethods: snapshot.availableMethods,
    availableEvents: snapshot.availableEvents,
  };

  return new Response(JSON.stringify(serializable), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};
