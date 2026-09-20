import type { ServerResponse } from 'node:http';
import type { ServerEvent } from '@/net/protocol';
import type { Hub, Subscription } from '../app/hub';

/**
 * Server-Sent Events, and why not WebSocket.
 *
 * Everything that has to travel from server to client here is "something
 * changed, re-read it". That is exactly one direction, it is text, and the
 * browser reconnects on its own when the WiFi drops — which is the hard part of
 * a tournament hall and the thing a hand-rolled socket would have to
 * reimplement. Commands go the other way as ordinary POSTs, which get retries,
 * status codes and idempotency for free.
 *
 * A WebSocket would cost a dependency and a reconnect loop to buy duplex we do
 * not use. If a future feature needs the client to stream, this is the file
 * that changes.
 */

export interface SseStream {
  subscription: Subscription;
}

export function openSse(
  response: ServerResponse,
  hub: Hub,
  options: { tournamentId: string; tableId?: string },
): SseStream {
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    // Some proxies buffer by default and would hold every event until the
    // stream closed, which is the opposite of the point.
    'x-accel-buffering': 'no',
  });

  // Tells the browser how long to wait before reconnecting after a drop.
  response.write('retry: 2000\n\n');

  const send = (event: ServerEvent) => {
    response.write(`event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
  };

  const subscription = hub.subscribe({ ...options, send });

  const stop = () => subscription.close();
  response.on('close', stop);
  response.on('error', stop);

  return { subscription };
}
