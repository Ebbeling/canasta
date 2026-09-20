import type { ServerResponse } from 'node:http';
import type { ApiError, ApiErrorCode } from '@/net/protocol';
import type { Outcome } from '../app/tournamentApi';

/**
 * Turning an application answer into an HTTP one.
 *
 * The only place in the server that knows what a status code is. Everything
 * above speaks in outcomes.
 */

export function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body ?? null);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    // Nothing the API returns may be cached: a table's state is the one thing
    // that must never come from a stale copy.
    'cache-control': 'no-store',
  });
  response.end(payload);
}

export function sendError(
  response: ServerResponse,
  status: number,
  error: ApiErrorCode,
  message: string,
  extra: Partial<ApiError> = {},
): void {
  sendJson(response, status, { error, message, ...extra });
}

/** Writes whichever half of an outcome came back. */
export function sendOutcome<T>(response: ServerResponse, outcome: Outcome<T>, status = 200): void {
  if (outcome.ok) sendJson(response, status, outcome.value);
  else sendJson(response, outcome.status, outcome.error);
}
