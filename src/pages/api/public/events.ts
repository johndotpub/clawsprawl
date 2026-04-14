import type { APIRoute } from 'astro';
import { getServerService, initializeService } from '../../../lib/gateway/server-service';

const KEEPALIVE_INTERVAL_MS = 30_000;

/** GET /api/public/events — lightweight snapshot invalidation stream for public cards. */
export const GET: APIRoute = async () => {
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

      const unsubscribeSnapshot = service.onSnapshotUpdated(() => {
        send('snapshot-updated', { ts: Date.now() });
      });

      const keepalive = setInterval(() => {
        send('ping', { ts: Date.now() });
      }, KEEPALIVE_INTERVAL_MS);

      send('snapshot-updated', { ts: Date.now() });
      controller.enqueue(encoder.encode(': connected\n\n'));

      cleanup = (): void => {
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
