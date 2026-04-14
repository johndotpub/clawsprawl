import type { APIRoute } from 'astro';
import { buildPublicSnapshot } from '../../../lib/dashboard/public-private';
import { getServerService, initializeService } from '../../../lib/gateway/server-service';

/** GET /api/public/dashboard.json — return public-safe cached dashboard snapshot. */
export const GET: APIRoute = async () => {
  const service = getServerService();
  await initializeService();

  const snapshot = buildPublicSnapshot(service.getSnapshot());
  const serializable = {
    ...snapshot,
    sessionsByAgent: {},
  };

  return new Response(JSON.stringify(serializable), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};
