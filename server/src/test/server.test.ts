import { afterEach, describe, expect, it } from 'vitest';
import type { PairingResponse, TableState, TournamentState } from '@/net/protocol';
import { TOURNAMENT_PROTOCOL_VERSION } from '@/net/protocol';
import {
  idempotencyKey,
  startTestServer,
  teamInput,
  tournamentInput,
  type TestServer,
} from './harness';

/**
 * The tournament server, over HTTP.
 *
 * Everything here goes through a real socket and a real database. What is being
 * proved is not that the tournament rules work — they are the same ones the
 * browser runs and have their own tests — but the three things that only appear
 * once there is more than one device: who may act, whether they were looking at
 * the current state, and what happens when a request arrives twice.
 */

let running: TestServer[] = [];

async function server(options?: Parameters<typeof startTestServer>[0]) {
  const started = await startTestServer(options);
  running.push(started);
  return started;
}

afterEach(async () => {
  await Promise.all(running.map((entry) => entry.dispose().catch(() => undefined)));
  running = [];
});

/** Creates a tournament and returns its id and first state. */
async function withTournament(api: TestServer, count = 8) {
  const created = await api.call<TournamentState>('POST', '/api/tournaments', tournamentInput(count));
  expect(created.status).toBe(201);
  return created.body.tournament.id;
}

/** Proposes and confirms the next round. */
async function confirmRound(api: TestServer, id: string) {
  const pairing = await api.call<PairingResponse>('POST', `/api/tournaments/${id}/pairing`, {});
  expect(pairing.status).toBe(200);

  const confirmed = await api.call<TournamentState>('POST', `/api/tournaments/${id}/commands`, {
    command: { kind: 'confirmRound', matches: pairing.body.matches },
  });
  expect(confirmed.status).toBe(200);
  return confirmed.body;
}

/** Hands a table a session and returns its token. */
async function sessionFor(api: TestServer, id: string, index: number) {
  const tables = await api.call<{ tables: { table: { id: string } }[] }>(
    'GET',
    `/api/tournaments/${id}/tables`,
  );
  const tableId = tables.body.tables[index]!.table.id;

  const issued = await api.call<{ joinUrl: string }>(
    'POST',
    `/api/tournaments/${id}/tables/${tableId}/session`,
  );
  expect(issued.status).toBe(201);

  return { tableId, token: issued.body.joinUrl.split('/table/')[1]! };
}

describe('the server itself', () => {
  it('starts and answers a health check', async () => {
    const api = await server();
    const health = await api.call<{ status: string; protocolVersion: number }>(
      'GET',
      '/api/health',
    );

    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');
    expect(health.body.protocolVersion).toBe(TOURNAMENT_PROTOCOL_VERSION);
  });

  it('answers an unknown endpoint with a code, not a stack trace', async () => {
    const api = await server();
    const missing = await api.call<{ error: string }>('GET', '/api/nothing-here');

    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('notFound');
  });

  it('refuses a request that is not shaped like a tournament', async () => {
    const api = await server();
    const bad = await api.call<{ error: string }>('POST', '/api/tournaments', { name: '' });

    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('badRequest');
  });

  it('refuses a tournament the application layer will not accept', async () => {
    const api = await server();
    // Two participants cannot fill a table of four.
    const bad = await api.call<{ error: string; issues?: unknown[] }>(
      'POST',
      '/api/tournaments',
      tournamentInput(2),
    );

    expect(bad.status).toBe(422);
    expect(bad.body.error).toBe('validation');
    expect(bad.body.issues?.length).toBeGreaterThan(0);
  });
});

describe('persistence', () => {
  it('still has the tournament after a restart', async () => {
    const first = await server();
    const id = await withTournament(first);
    await confirmRound(first, id);

    const before = await first.call<TournamentState>('GET', `/api/tournaments/${id}/state`);
    await first.stop();

    // The same directory, a new process's worth of objects.
    const second = await server({ directory: first.config.databasePath.replace(/[\\/][^\\/]+$/, '') });
    const after = await second.call<TournamentState>('GET', `/api/tournaments/${id}/state`);

    expect(after.status).toBe(200);
    expect(after.body.revision).toBe(before.body.revision);
    expect(after.body.tournament.rounds).toHaveLength(1);
    expect(after.body.tournament.tables).toHaveLength(2);
  });

  it(`keeps a table’s session across a restart`, async () => {
    const first = await server();
    const id = await withTournament(first);
    await confirmRound(first, id);
    const { token } = await sessionFor(first, id, 0);

    await first.stop();
    const second = await server({
      directory: first.config.databasePath.replace(/[\\/][^\\/]+$/, ''),
    });

    const state = await second.call<TableState>('GET', `/api/table/session/${token}/state`);
    expect(state.status).toBe(200);
    expect(state.body.session.table.number).toBe(1);
  });
});

describe('physical tables', () => {
  it('creates one table per playing match when a round is confirmed', async () => {
    const api = await server();
    const id = await withTournament(api);
    const state = await confirmRound(api, id);

    const round = state.tournament.rounds[0]!;
    expect(round.matches).toHaveLength(2);
    expect(round.matches.every((match) => match.tableId)).toBe(true);
    expect(new Set(round.matches.map((match) => match.tableId)).size).toBe(2);
    expect(state.tournament.tables).toHaveLength(2);
  });

  it('keeps a table on the same device across rounds, with a new match', async () => {
    const api = await server();
    const id = await withTournament(api);
    const first = await confirmRound(api, id);
    const { token, tableId } = await sessionFor(api, id, 0);

    const before = await api.call<TableState>('GET', `/api/table/session/${token}/state`);
    const firstMatchId = before.body.match!.id;

    // Play the round out and close it.
    await playOut(api, id, first, { 0: token });
    const closed = await api.call<TournamentState>('POST', `/api/tournaments/${id}/commands`, {
      command: { kind: 'completeRound', roundId: first.tournament.rounds[0]!.id },
    });
    expect(closed.status).toBe(200);

    await confirmRound(api, id);

    const after = await api.call<TableState>('GET', `/api/table/session/${token}/state`);
    expect(after.status).toBe(200);
    // Same table, same session, different match.
    expect(after.body.session.table.id).toBe(tableId);
    expect(after.body.match!.id).not.toBe(firstMatchId);
    expect(after.body.round!.sequence).toBe(2);
  });

  it('will not retire a table that is playing', async () => {
    const api = await server();
    const id = await withTournament(api);
    const state = await confirmRound(api, id);
    const tableId = state.tournament.rounds[0]!.matches[0]!.tableId!;

    const refused = await api.call<{ error: string }>('POST', `/api/tournaments/${id}/commands`, {
      command: { kind: 'setTableActive', tableId, active: false },
    });

    expect(refused.status).toBe(422);
    expect(refused.body.error).toBe('validation');
  });
});

/**
 * Plays every table of the current round to a finish, as the tables would.
 *
 * Takes the tokens it should use rather than issuing its own: handing a table a
 * new session invalidates the one the device is holding, which is the behaviour
 * under test elsewhere and would quietly break this helper.
 */
async function playOut(
  api: TestServer,
  id: string,
  state: TournamentState,
  tokens: Record<number, string> = {},
) {
  const round = state.tournament.rounds.at(-1)!;

  for (let index = 0; index < round.matches.length; index += 1) {
    const match = round.matches[index]!;
    if (match.kind === 'bye') continue;

    const token = tokens[index] ?? (await sessionFor(api, id, index)).token;
    const opened = await api.call<TableState>('GET', `/api/table/session/${token}/state`);
    const matchId = opened.body.match!.id;

    const started = await api.call<TableState>(
      'POST',
      `/api/table/session/${token}/match/start`,
      { matchId, idempotencyKey: idempotencyKey('start') },
    );

    const teams = started.body.game!.game.teams;
    let revision = started.body.match!.revision;

    for (let round = 1; round <= 8; round += 1) {
      const submitted = await api.call<TableState>(
        'POST',
        `/api/table/session/${token}/match/result`,
        {
          matchId,
          expectedRevision: revision,
          idempotencyKey: idempotencyKey(`r${round}`),
          inputs: [teamInput(teams[0]!.id, 1200), teamInput(teams[1]!.id, 150)],
        },
      );
      expect(submitted.status).toBe(200);
      revision = submitted.body.match!.revision;
      if (submitted.body.match!.status === 'done') break;
    }
  }
}

describe('a table session', () => {
  it('sees its own table, its round and the people at it', async () => {
    const api = await server();
    const id = await withTournament(api);
    await confirmRound(api, id);
    const { token } = await sessionFor(api, id, 0);

    const state = await api.call<TableState>('GET', `/api/table/session/${token}/state`);

    expect(state.status).toBe(200);
    expect(state.body.session.table.number).toBe(1);
    expect(state.body.session.tournamentName).toBe('Testtoernooi');
    expect(state.body.round?.sequence).toBe(1);
    expect(state.body.match?.sideLines).toHaveLength(2);
    expect(state.body.match?.participantNames).toHaveLength(4);
    expect(state.body.match?.status).toBe('waiting');
  });

  it('is refused when the token is unknown', async () => {
    const api = await server();
    const state = await api.call<{ error: string }>(
      'GET',
      '/api/table/session/not-a-real-token-at-all/state',
    );

    expect(state.status).toBe(401);
    expect(state.body.error).toBe('sessionInvalid');
  });

  it('stops working the moment it is revoked', async () => {
    const api = await server();
    const id = await withTournament(api);
    await confirmRound(api, id);
    const { token, tableId } = await sessionFor(api, id, 0);

    expect((await api.call('GET', `/api/table/session/${token}/state`)).status).toBe(200);

    await api.call('DELETE', `/api/tournaments/${id}/tables/${tableId}/session`);

    const after = await api.call<{ error: string }>('GET', `/api/table/session/${token}/state`);
    expect(after.status).toBe(401);
    expect(after.body.error).toBe('sessionInvalid');
  });

  it('is replaced, not added to, when a new one is handed out', async () => {
    const api = await server();
    const id = await withTournament(api);
    await confirmRound(api, id);

    const first = await sessionFor(api, id, 0);
    const second = await sessionFor(api, id, 0);

    expect(second.token).not.toBe(first.token);
    expect((await api.call('GET', `/api/table/session/${first.token}/state`)).status).toBe(401);
    expect((await api.call('GET', `/api/table/session/${second.token}/state`)).status).toBe(200);
  });

  it('recovers its state after a reload, without a new QR', async () => {
    const api = await server();
    const id = await withTournament(api);
    await confirmRound(api, id);
    const { token } = await sessionFor(api, id, 0);

    const first = await api.call<TableState>('GET', `/api/table/session/${token}/state`);
    const again = await api.call<TableState>('GET', `/api/table/session/${token}/state`);

    expect(again.status).toBe(200);
    expect(again.body.match!.id).toBe(first.body.match!.id);
  });
});
