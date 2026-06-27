/**
 * Deprecated mixed SSE endpoint.
 *
 * Public/private realtime streams are now split across `/api/public/events`
 * and `/api/private/events` to avoid leaking private operational data.
 *
 * @module api/events
 */

import type { APIRoute } from 'astro';
/** GET /api/events — removed in favor of public/private route split. */
export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ ok: false, error: 'deprecated-route' }), {
    status: 410,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Deprecation': 'true',
      'Link': '</api/public/events>; rel="successor-version"',
    },
  });
};
