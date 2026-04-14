import type { APIRoute } from 'astro';
import { createPrivateAuthRequiredResponse, isPrivateRouteAllowed } from '../../../lib/auth/access';
import { buildPrivateEvent } from '../../../lib/dashboard/public-private';
import { getServerService, initializeService } from '../../../lib/gateway/server-service';

const KEEPALIVE_INTERVAL_MS = 30_000;

/** GET /api/private/events — authenticated SSE stream with private realtime events. */
export const GET: APIRoute = async ({ cookies }) => {
  if (!isPrivateRouteAllowed(cookies)) {
    return createPrivateAuthRequiredResponse();
  }

  const service = getServerService();
  await initializeService();

  let cleanup: (() => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (event: string, data: unknown): void => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* Stream closed */
        }
      };

      const unsubscribe = service.onEvent((event) => {
        const payload = buildPrivateEvent(event);
        send('gateway-event', {
          event: payload.event,
          payload: payload.payload,
          seq: (payload as Record<string, unknown>).seq,
        });
      });

      const unsubscribeSnapshot = service.onSnapshotUpdated(() => {
        send('snapshot-updated', {
          connectionState: service.connectionState,
          ts: Date.now(),
        });
      });

      const keepalive = setInterval(() => {
        send('ping', { ts: Date.now() });
      }, KEEPALIVE_INTERVAL_MS);

      send('snapshot-updated', {
        connectionState: service.connectionState,
        ts: Date.now(),
      });
      controller.enqueue(encoder.encode(': connected\n\n'));

      cleanup = (): void => {
        unsubscribe();
        unsubscribeSnapshot();
        clearInterval(keepalive);
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
};
