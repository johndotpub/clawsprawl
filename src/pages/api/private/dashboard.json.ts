import type { APIRoute } from 'astro';
import { createPrivateAuthRequiredResponse, isPrivateRouteAllowed } from '../../../lib/auth/access';
import { buildPrivateSnapshot } from '../../../lib/dashboard/public-private';
import { getServerService, initializeService } from '../../../lib/gateway/server-service';

/** GET /api/private/dashboard.json — return full private dashboard snapshot. */
export const GET: APIRoute = async ({ cookies }) => {
  if (!isPrivateRouteAllowed(cookies)) {
    return createPrivateAuthRequiredResponse();
  }

  const service = getServerService();
  await initializeService();

  const snapshot = buildPrivateSnapshot(service.getSnapshot());
  const serializable = {
    ...snapshot,
    sessionsByAgent: Object.fromEntries(snapshot.sessionsByAgent),
  };

  return new Response(JSON.stringify(serializable), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};
