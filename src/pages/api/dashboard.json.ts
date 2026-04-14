/**
 * Deprecated mixed dashboard snapshot route.
 *
 * Public/private dashboard data is now split across `/api/public/*` and
 * `/api/private/*` routes to avoid leaking sensitive operational details.
 *
 * @module api/dashboard.json
 */

import type { APIRoute } from 'astro';
/** GET /api/dashboard.json — removed in favor of public/private route split. */
export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ ok: false, error: 'deprecated-route' }), {
    status: 410,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};
