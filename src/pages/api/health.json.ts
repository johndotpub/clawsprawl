/**
 * Deprecated mixed health route.
 *
 * Private gateway health now lives behind `/api/private/health.json`.
 *
 * @module api/health.json
 */

import type { APIRoute } from 'astro';
/** GET /api/health.json — removed in favor of private health route. */
export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ ok: false, error: 'deprecated-route' }), {
    status: 410,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};
