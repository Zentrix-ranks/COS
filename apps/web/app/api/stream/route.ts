// apps/web/app/api/stream/route.ts
// Realtime hub: Server-Sent Events bridge over Redis pub/sub. Source: spec/02 §3.1 (realtime
// hub), §5 (realtime path: worker emits → Redis pub/sub → control-plane hub → SSE → browser),
// doc 07 §5.2. OQ-02 (doc 02 §14): start with SSE.
import { REALTIME_CHANNEL } from '@cos/shared';
import IORedis from 'ioredis';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs'; // long-lived connection; not edge (doc 02 §14 OQ-02).
export const dynamic = 'force-dynamic';

export function GET(req: NextRequest): Response {
  const redisUrl = process.env.REDIS_URL;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // If Redis isn't configured, emit a single offline event and keep the stream open
      // (heartbeats) so the client shows a degraded-but-connected state (doc 07 §5.3).
      let sub: IORedis | null = null;
      if (redisUrl) {
        sub = new IORedis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: false });
        sub.on('error', () => send('realtime.error', { message: 'redis unavailable' }));
        void sub.subscribe(REALTIME_CHANNEL).then(
          () => send('realtime.ready', { channel: REALTIME_CHANNEL }),
          () => send('realtime.error', { message: 'subscribe failed' }),
        );
        sub.on('message', (_channel, message) => {
          controller.enqueue(encoder.encode(`event: run.status\ndata: ${message}\n\n`));
        });
      } else {
        send('realtime.offline', { reason: 'REDIS_URL not configured' });
      }

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 15000);

      const close = () => {
        clearInterval(heartbeat);
        if (sub) void sub.quit().catch(() => undefined);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener('abort', close);
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
