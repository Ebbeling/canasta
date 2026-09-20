import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * A router, in about eighty lines.
 *
 * Express would do this too, and bring a dependency tree with it for a server
 * whose whole job is a dozen routes on a laptop. What is actually needed is
 * matching a method and a path with a couple of parameters in it, and that is
 * what this does.
 *
 * Handlers here are deliberately thin. Anything that decides something about a
 * tournament lives in `server/src/app`, and this file never imports it.
 */

export interface RequestContext {
  request: IncomingMessage;
  response: ServerResponse;
  /** Path parameters, e.g. `{ id: '…' }` for `/api/tournaments/:id`. */
  params: Record<string, string>;
  query: URLSearchParams;
  url: URL;
  /** The origin this request arrived on — what a QR code must point back at. */
  origin: string;
  /** Parsed JSON body, or undefined when there was none. */
  body?: unknown;
}

export type Handler = (context: RequestContext) => Promise<void> | void;

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

interface Route {
  method: Method;
  segments: string[];
  handler: Handler;
}

export interface Router {
  get(path: string, handler: Handler): void;
  post(path: string, handler: Handler): void;
  delete(path: string, handler: Handler): void;
  /** The matching route, or nothing. */
  match(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | undefined;
}

export function createRouter(): Router {
  const routes: Route[] = [];

  function add(method: Method, path: string, handler: Handler): void {
    routes.push({ method, segments: path.split('/').filter(Boolean), handler });
  }

  return {
    get: (path, handler) => add('GET', path, handler),
    post: (path, handler) => add('POST', path, handler),
    delete: (path, handler) => add('DELETE', path, handler),

    match(method, pathname) {
      const parts = pathname.split('/').filter(Boolean);

      for (const route of routes) {
        if (route.method !== method) continue;
        if (route.segments.length !== parts.length) continue;

        const params: Record<string, string> = {};
        let matched = true;

        for (let index = 0; index < route.segments.length; index += 1) {
          const segment = route.segments[index]!;
          const value = parts[index]!;

          if (segment.startsWith(':')) {
            params[segment.slice(1)] = decodeURIComponent(value);
          } else if (segment !== value) {
            matched = false;
            break;
          }
        }

        if (matched) return { handler: route.handler, params };
      }

      return undefined;
    },
  };
}

/** The largest body this server will read. A round of Canasta is a few hundred bytes. */
export const MAX_BODY_BYTES = 1_000_000;

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    // Refusing early rather than buffering whatever arrives: this server is on
    // an open WiFi, and a body it cannot possibly need should not be read.
    if (size > MAX_BODY_BYTES) throw new Error('Body too large');
    chunks.push(buffer);
  }

  if (chunks.length === 0) return undefined;

  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (text.length === 0) return undefined;

  return JSON.parse(text) as unknown;
}
