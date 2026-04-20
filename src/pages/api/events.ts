/**
 * Deprecated mixed SSE endpoint.
 *
 * Public/private realtime streams are now split across `/api/public/events`
 * and `/api/private/events` to avoid leaking private operational data.
 *
 * Event types sent to browser:
 * - `gateway-event` — real-time gateway event frames (from WS + SSE)
 * - `snapshot-updated` — signals that a fresh dashboard snapshot is available
 * - `ping` — keepalive (every 30s)
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
      'Sunset': 'Sat, 01 Mar 2026 00:00:00 GMT',
      'Link': '</api/public/events>; rel="successor-version"',
    },
  });
};
