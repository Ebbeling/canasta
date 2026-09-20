import { createServer as createHttpServer, type Server } from 'node:http';
import { z } from 'zod';
import {
  API_PREFIX,
  TOURNAMENT_PROTOCOL_VERSION,
  commandEnvelopeSchema,
  completeMatchSchema,
  pairingRequestSchema,
  pairingValidateSchema,
  startMatchSchema,
  submitResultSchema,
  type Health,
} from '@/net/protocol';
import { newId } from '@/domain/ids';
import type { Container } from '../app/container';
import type { ServerConfig } from '../config';
import { createRouter, readJsonBody, type RequestContext } from './router';
import { sendError, sendJson, sendOutcome } from './respond';
import { openSse } from './sse';
import { createStaticSite } from './static';

/**
 * The HTTP surface.
 *
 * Every handler here does the same three things: read what came in, hand it to
 * `container.api`, and write what came back. There is no tournament rule, no
 * pairing and no scoring in this file — deliberately, and there is an
 * architecture test that says so.
 */

const createTournamentSchema = z.object({
  name: z.string().min(1),
  settings: z.record(z.string(), z.unknown()),
  gameSettings: z.record(z.string(), z.unknown()),
  participants: z.array(
    z.object({
      kind: z.enum(['player', 'team']),
      name: z.string(),
      memberNames: z.array(z.string()).default([]),
    }),
  ),
});

export interface CanastaServer {
  http: Server;
  /** Resolves once the socket is listening. */
  listen(): Promise<void>;
  close(): Promise<void>;
  address(): { port: number } | undefined;
}

export function createCanastaServer(container: Container, config: ServerConfig): CanastaServer {
  const startedAt = new Date().toISOString();
  const serverId = newId();
  const site = createStaticSite(config.webRoot, config.basePath);
  const router = createRouter();

  const version = process.env.npm_package_version ?? '0.1.0';

  /* ------------------------------------------------------------- health */

  router.get(`${API_PREFIX}/health`, ({ response }) => {
    const health: Health = {
      status: 'ok',
      version,
      protocolVersion: TOURNAMENT_PROTOCOL_VERSION,
      serverId,
      startedAt,
    };
    sendJson(response, 200, health);
  });

  /* -------------------------------------------------------- tournaments */

  router.get(`${API_PREFIX}/tournaments`, async ({ response }) => {
    sendJson(response, 200, { tournaments: await container.services.tournaments.list() });
  });

  router.post(`${API_PREFIX}/tournaments`, async ({ response, body }) => {
    const parsed = createTournamentSchema.safeParse(body);
    if (!parsed.success) {
      return sendError(response, 400, 'badRequest', 'Dit toernooi kan zo niet worden aangemaakt.');
    }

    // The application layer validates the setup properly; this only checks the
    // envelope is the right shape before handing it over.
    const outcome = await container.services.tournaments.create(
      parsed.data as unknown as Parameters<typeof container.services.tournaments.create>[0],
    );

    if (!outcome.ok) {
      return outcome.reason === 'validation'
        ? sendError(response, 422, 'validation', outcome.issues[0]?.message ?? 'Ongeldig.', {
            issues: outcome.issues.map((issue) => ({
              code: issue.code,
              severity: issue.severity,
              message: issue.message,
            })),
          })
        : sendError(response, 400, 'badRequest', 'Dit toernooi kon niet worden aangemaakt.');
    }

    container.hub.publish('tournament', outcome.tournament.id);
    sendOutcome(response, await container.api.state(outcome.tournament.id), 201);
  });

  router.get(`${API_PREFIX}/tournaments/:id`, async ({ response, params }) => {
    const tournament = await container.services.tournaments.get(params.id!);
    if (!tournament) return sendError(response, 404, 'notFound', 'Dit toernooi bestaat niet.');
    sendJson(response, 200, tournament);
  });

  router.get(`${API_PREFIX}/tournaments/:id/state`, async ({ response, params }) => {
    sendOutcome(response, await container.api.state(params.id!));
  });

  router.post(`${API_PREFIX}/tournaments/:id/commands`, async ({ response, params, body }) => {
    const parsed = commandEnvelopeSchema.safeParse(body);
    if (!parsed.success) {
      return sendError(response, 400, 'badRequest', 'Deze opdracht is niet geldig.');
    }
    sendOutcome(response, await container.api.execute(params.id!, parsed.data));
  });

  router.post(`${API_PREFIX}/tournaments/:id/pairing`, async ({ response, params, body }) => {
    const parsed = pairingRequestSchema.safeParse(body ?? {});
    if (!parsed.success) return sendError(response, 400, 'badRequest', 'Ongeldig verzoek.');
    sendOutcome(response, await container.api.propose(params.id!, parsed.data as never));
  });

  router.post(`${API_PREFIX}/tournaments/:id/pairing/validate`, async ({ response, params, body }) => {
    const parsed = pairingValidateSchema.safeParse(body);
    if (!parsed.success) return sendError(response, 400, 'badRequest', 'Ongeldig verzoek.');
    sendOutcome(response, await container.api.validatePairing(params.id!, parsed.data.matches as never));
  });

  /* -------------------------------------------------------------- tables */

  router.get(`${API_PREFIX}/tournaments/:id/tables`, async ({ response, params }) => {
    const outcome = await container.api.tables(params.id!);
    if (!outcome.ok) return sendOutcome(response, outcome);
    sendJson(response, 200, { tables: outcome.value });
  });

  router.post(`${API_PREFIX}/tournaments/:id/tables`, async ({ response, params, body }) => {
    const name = typeof (body as { name?: unknown })?.name === 'string'
      ? ((body as { name: string }).name)
      : undefined;

    const added = await container.api.execute(params.id!, { command: { kind: 'addTable', name } });
    if (!added.ok) return sendOutcome(response, added);

    const outcome = await container.api.tables(params.id!);
    if (!outcome.ok) return sendOutcome(response, outcome);
    sendJson(response, 201, { tables: outcome.value });
  });

  router.post(
    `${API_PREFIX}/tournaments/:id/tables/:tableId/session`,
    async ({ response, params }) => {
      sendOutcome(response, await container.api.issueSession(params.id!, params.tableId!), 201);
    },
  );

  router.delete(
    `${API_PREFIX}/tournaments/:id/tables/:tableId/session`,
    async ({ response, params }) => {
      sendOutcome(response, await container.api.revokeSession(params.id!, params.tableId!));
    },
  );

  /* ------------------------------------------------------- table session */

  router.get(`${API_PREFIX}/table/session/:token`, ({ response, params }) => {
    const outcome = container.api.resolveSession(params.token!);
    if (!outcome.ok) return sendOutcome(response, outcome);

    // Only what the device needs to know it is paired; never the tournament.
    sendJson(response, 200, {
      tournamentId: outcome.value.tournamentId,
      tableId: outcome.value.tableId,
      protocolVersion: TOURNAMENT_PROTOCOL_VERSION,
    });
  });

  router.get(`${API_PREFIX}/table/session/:token/state`, async ({ response, params }) => {
    sendOutcome(response, await container.api.tableState(params.token!));
  });

  router.post(`${API_PREFIX}/table/session/:token/match/start`, async ({ response, params, body }) => {
    const parsed = startMatchSchema.safeParse(body);
    if (!parsed.success) return sendError(response, 400, 'badRequest', 'Ongeldig verzoek.');
    sendOutcome(
      response,
      await container.api.startTableMatch(params.token!, parsed.data.matchId, parsed.data.idempotencyKey),
    );
  });

  router.post(`${API_PREFIX}/table/session/:token/match/result`, async ({ response, params, body }) => {
    const parsed = submitResultSchema.safeParse(body);
    if (!parsed.success) return sendError(response, 400, 'badRequest', 'Ongeldig verzoek.');

    sendOutcome(
      response,
      await container.api.submitResult(params.token!, {
        matchId: parsed.data.matchId,
        expectedRevision: parsed.data.expectedRevision,
        idempotencyKey: parsed.data.idempotencyKey,
        inputs: parsed.data.inputs as never,
      }),
    );
  });

  router.post(
    `${API_PREFIX}/table/session/:token/match/complete`,
    async ({ response, params, body }) => {
      const parsed = completeMatchSchema.safeParse(body);
      if (!parsed.success) return sendError(response, 400, 'badRequest', 'Ongeldig verzoek.');
      sendOutcome(response, await container.api.completeMatch(params.token!, parsed.data));
    },
  );

  /* -------------------------------------------------------------- events */

  router.get(`${API_PREFIX}/events`, ({ response, query }) => {
    const tournamentId = query.get('tournamentId');
    if (!tournamentId) {
      return sendError(response, 400, 'badRequest', 'tournamentId ontbreekt.');
    }
    openSse(response, container.hub, { tournamentId });
  });

  router.get(`${API_PREFIX}/table/session/:token/events`, ({ response, params }) => {
    const outcome = container.api.resolveSession(params.token!);
    if (!outcome.ok) return sendOutcome(response, outcome);

    openSse(response, container.hub, {
      tournamentId: outcome.value.tournamentId,
      tableId: outcome.value.tableId,
    });
  });

  /* --------------------------------------------------------- the server */

  const http = createHttpServer(async (request, response) => {
    // Only used to parse the path and the query. What a link must point at is
    // decided by the server, not by whoever happens to be asking — see
    // `resolveOrigin`.
    const host = request.headers.host ?? `localhost:${config.port}`;
    const url = new URL(request.url ?? '/', `http://${host}`);

    try {
      const route = router.match(request.method ?? 'GET', url.pathname);

      if (route) {
        const context: RequestContext = {
          request,
          response,
          params: route.params,
          query: url.searchParams,
          url,
          body:
            request.method === 'POST' || request.method === 'PUT'
              ? await readJsonBody(request)
              : undefined,
        };
        await route.handler(context);
        return;
      }

      if (url.pathname.startsWith(API_PREFIX)) {
        return sendError(response, 404, 'notFound', 'Onbekend eindpunt.');
      }

      if (site.serve(url.pathname, response)) return;

      sendError(
        response,
        404,
        'notFound',
        'De app is niet meegeleverd. Draai eerst `npm run build`.',
      );
    } catch (error) {
      if (response.headersSent) {
        response.end();
        return;
      }
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      sendError(response, 500, 'serverError', message);
    }
  });

  // An idle stream can be dropped by a router or a phone's power saving. A
  // comment every twenty seconds keeps it alive and, when it does not arrive,
  // is how the client notices it has gone.
  const heartbeat = setInterval(() => container.hub.heartbeat(), 20_000);
  heartbeat.unref();

  return {
    http,

    listen() {
      return new Promise((resolve, reject) => {
        http.once('error', reject);
        http.listen(config.port, config.host, () => {
          http.off('error', reject);
          resolve();
        });
      });
    },

    close() {
      clearInterval(heartbeat);
      container.hub.closeAll();
      return new Promise((resolve) => {
        http.closeAllConnections?.();
        http.close(() => resolve());
      });
    },

    address() {
      const info = http.address();
      return info && typeof info === 'object' ? { port: info.port } : undefined;
    },
  };
}
