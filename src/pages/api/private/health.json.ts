import type { APIRoute } from 'astro';
import { createPrivateAuthRequiredResponse, isPrivateRouteAllowed } from '../../../lib/auth/access';
import { initializeService } from '../../../lib/gateway/server-service';
import { CLIENT_VERSION } from '../../../lib/gateway/protocol';

/** GET /api/private/health.json — return private gateway connection health. */
export const GET: APIRoute = async ({ cookies }) => {
  if (!isPrivateRouteAllowed(cookies)) {
    return createPrivateAuthRequiredResponse();
  }

  const service = await initializeService();
  const snapshot = service.getSnapshot();
  const healthy = snapshot.connectionState === 'connected';

  return new Response(JSON.stringify({
    ok: healthy,
    connectionState: snapshot.connectionState,
    lastUpdatedAt: snapshot.lastUpdatedAt,
    lastSuccessfulSnapshotAt: snapshot.lastSuccessfulSnapshotAt,
    stale: snapshot.stale,
    reconnectCount: snapshot.reconnectCount,
    errorCount: snapshot.errorCount,
    serverVersion: snapshot.serverVersion,
    clientVersion: CLIENT_VERSION,
    availableMethods: snapshot.availableMethods.length,
    availableEvents: snapshot.availableEvents.length,
  }), {
    status: healthy ? 200 : 503,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};
