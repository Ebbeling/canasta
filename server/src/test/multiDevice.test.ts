import { afterEach, describe, expect, it } from 'vitest';
import type { PairingResponse, ServerEvent, TableState, TournamentState } from '@/net/protocol';
import {
  idempotencyKey,
  startTestServer,
  teamInput,
  tournamentInput,
  type TestServer,
} from './harness';

/**
 * A room with several devices in it.
 *
 * The organiser and three tables, all looking at the same tournament at the
 * same time. What is being proved is that there is exactly one authority: every
 * client sees what the server decided, a table can only touch its own table,
 * and a retry or a stale submission never invents state.
 */

let running: TestServer[] = [];

async function server() {
  const started = await startTestServer();
  running.push(started);
  return started;
}

afterEach(async () => {
  await Promise.all(running.map((entry) => entry.dispose().catch(() => undefined)));
  running = [];
});

/** An organiser with twelve players, three tables and a confirmed first round. */
async function room(api: TestServer) {
  const created = await api.call<TournamentState>('POST', '/api/tournaments', {
    ...tournamentInput(8),
    participants: [
      'Anna',
      'Bram',
      'Carla',
      'Daan',
      'Eva',
      'Frank',
      'Gerda',
      'Hans',
      'Ines',
      'Joop',
      'Klaas',
      'Lotte',
    ].map((name) => ({ kind: 'player', name, memberNames: [name] })),
  });
  const id = created.body.tournament.id;

  const pairing = await api.call<PairingResponse>('POST', `/api/tournaments/${id}/pairing`, {});
  const confirmed = await api.call<TournamentState>('POST', `/api/tournaments/${id}/commands`, {
    expectedRevision: created.body.revision,
    command: { kind: 'confirmRound', matches: pairing.body.matches },
  });

  const tables = await api.call<{ tables: { table: { id: string; number: number } }[] }>(
    'GET',
    `/api/tournaments/${id}/tables`,
  );

  const tokens: string[] = [];
  for (const entry of tables.body.tables) {
    const issued = await api.call<{ joinUrl: string }>(
      'POST',
      `/api/tournaments/${id}/tables/${entry.table.id}/session`,
    );
    tokens.push(issued.body.joinUrl.split('/table/')[1]!);
  }

  return { id, state: confirmed.body, tokens, tableIds: tables.body.tables.map((t) => t.table.id) };
}

describe('three tables and an organiser', () => {
  it('gives every table its own match and nobody else’s', async () => {
    const api = await server();
    const { tokens } = await room(api);

    expect(tokens).toHaveLength(3);

    const states = await Promise.all(
      tokens.map((token) => api.call<TableState>('GET', `/api/table/session/${token}/state`)),
    );

    const numbers = states.map((entry) => entry.body.session.table.number);
    expect(new Set(numbers).size).toBe(3);

    const matchIds = states.map((entry) => entry.body.match!.id);
    expect(new Set(matchIds).size).toBe(3);

    // Nobody is sitting at two tables at once.
    const everyone = states.flatMap((entry) => entry.body.match!.participantNames);
    expect(new Set(everyone).size).toBe(everyone.length);
  });

  it('shows the organiser what the tables did, from the server', async () => {
    const api = await server();
    const { id, tokens } = await room(api);

    const opened = await api.call<TableState>('GET', `/api/table/session/${tokens[0]}/state`);
    const matchId = opened.body.match!.id;

    await api.call('POST', `/api/table/session/${tokens[0]}/match/start`, {
      matchId,
      idempotencyKey: idempotencyKey('start'),
    });

    const organiser = await api.call<TournamentState>('GET', `/api/tournaments/${id}/state`);
    const match = organiser.body.tournament.rounds[0]!.matches.find(
      (entry) => entry.id === matchId,
    );

    expect(match?.gameId).toBeDefined();
    expect(organiser.body.games.some((game) => game.id === match!.gameId)).toBe(true);
  });

  it('pushes a change to everyone who is listening', async () => {
    const api = await server();
    const { id, tokens } = await room(api);

    const received: ServerEvent[] = [];
    const controller = new AbortController();

    const response = await fetch(`${api.base}/api/events?tournamentId=${id}`, {
      signal: controller.signal,
    });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    const pump = (async () => {
      let buffer = '';
      while (received.length < 2) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        for (const block of buffer.split('\n\n')) {
          const line = block.split('\n').find((entry) => entry.startsWith('data: '));
          if (line) received.push(JSON.parse(line.slice(6)) as ServerEvent);
        }
        buffer = '';
      }
    })();

    // Something a table does must reach the organiser's stream.
    const opened = await api.call<TableState>('GET', `/api/table/session/${tokens[0]}/state`);
    await api.call('POST', `/api/table/session/${tokens[0]}/match/start`, {
      matchId: opened.body.match!.id,
      idempotencyKey: idempotencyKey('start'),
    });

    await Promise.race([pump, new Promise((resolve) => setTimeout(resolve, 3000))]);
    controller.abort();

    expect(received[0]?.kind).toBe('hello');
    expect(received.some((event) => event.kind === 'tournament')).toBe(true);
  });
});

describe('a table cannot reach past its own table', () => {
  it('refuses to start another table’s match', async () => {
    const api = await server();
    const { tokens } = await room(api);

    const mine = await api.call<TableState>('GET', `/api/table/session/${tokens[0]}/state`);
    const theirs = await api.call<TableState>('GET', `/api/table/session/${tokens[1]}/state`);

    const refused = await api.call<{ error: string }>(
      'POST',
      `/api/table/session/${tokens[0]}/match/start`,
      { matchId: theirs.body.match!.id, idempotencyKey: idempotencyKey('cross') },
    );

    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('outOfScope');
    expect(mine.body.match!.id).not.toBe(theirs.body.match!.id);
  });

  it('refuses to submit a result for another table’s match', async () => {
    const api = await server();
    const { tokens } = await room(api);

    const theirs = await api.call<TableState>('GET', `/api/table/session/${tokens[1]}/state`);
    await api.call('POST', `/api/table/session/${tokens[1]}/match/start`, {
      matchId: theirs.body.match!.id,
      idempotencyKey: idempotencyKey('start'),
    });

    const refused = await api.call<{ error: string }>(
      'POST',
      `/api/table/session/${tokens[0]}/match/result`,
      {
        matchId: theirs.body.match!.id,
        expectedRevision: 1,
        idempotencyKey: idempotencyKey('cross'),
        inputs: [teamInput('whatever', 100)],
      },
    );

    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('outOfScope');
  });

  it('has no endpoint that lets it run the tournament', async () => {
    const api = await server();
    const { id, tokens } = await room(api);
    const token = tokens[0]!;

    // Everything an organiser can do lives under /api/tournaments/:id, which a
    // table has no token for; the table's own routes have no such verb at all.
    const attempts = [
      api.call('POST', `/api/table/session/${token}/commands`, { command: { kind: 'finish' } }),
      api.call('POST', `/api/table/session/${token}/pairing`, {}),
      api.call('DELETE', `/api/table/session/${token}`),
      api.call('POST', `/api/table/session/${token}/tables`, {}),
    ];

    for (const attempt of attempts) {
      const { status } = await attempt;
      expect(status).toBe(404);
    }

    // And the tournament is untouched.
    const state = await api.call<TournamentState>('GET', `/api/tournaments/${id}/state`);
    expect(state.body.tournament.status).toBe('active');
  });

  it('is never told about the other tables', async () => {
    const api = await server();
    const { tokens } = await room(api);

    const state = await api.call<TableState>('GET', `/api/table/session/${tokens[0]}/state`);
    const serialised = JSON.stringify(state.body);

    // No other token, no other table's id, no settings, no standings.
    expect(serialised).not.toContain(tokens[1]);
    expect(serialised).not.toContain(tokens[2]);
    expect(state.body).not.toHaveProperty('standings');
    expect(JSON.parse(serialised).session.table.number).toBe(1);
  });
});

describe('conflicts and retries', () => {
  it('refuses a command that was written against an older revision', async () => {
    const api = await server();
    const { id, state } = await room(api);

    const first = await api.call<TournamentState>('POST', `/api/tournaments/${id}/commands`, {
      expectedRevision: state.revision,
      command: { kind: 'rename', name: 'Eerste' },
    });
    expect(first.status).toBe(200);

    const second = await api.call<{ error: string; currentRevision: number }>(
      'POST',
      `/api/tournaments/${id}/commands`,
      { expectedRevision: state.revision, command: { kind: 'rename', name: 'Tweede' } },
    );

    expect(second.status).toBe(409);
    expect(second.body.error).toBe('conflict');
    expect(second.body.currentRevision).toBe(first.body.revision);

    const now = await api.call<TournamentState>('GET', `/api/tournaments/${id}/state`);
    expect(now.body.tournament.name).toBe('Eerste');
  });

  it('answers a retried result instead of scoring the hand twice', async () => {
    const api = await server();
    const { tokens } = await room(api);
    const token = tokens[0]!;

    const opened = await api.call<TableState>('GET', `/api/table/session/${token}/state`);
    const matchId = opened.body.match!.id;

    const started = await api.call<TableState>(
      'POST',
      `/api/table/session/${token}/match/start`,
      { matchId, idempotencyKey: idempotencyKey('start') },
    );

    const teams = started.body.game!.game.teams;
    const key = idempotencyKey('result');
    const payload = {
      matchId,
      expectedRevision: started.body.match!.revision,
      idempotencyKey: key,
      inputs: [teamInput(teams[0]!.id, 800), teamInput(teams[1]!.id, 200)],
    };

    const once = await api.call<TableState>(
      'POST',
      `/api/table/session/${token}/match/result`,
      payload,
    );
    const twice = await api.call<TableState>(
      'POST',
      `/api/table/session/${token}/match/result`,
      payload,
    );

    expect(once.status).toBe(200);
    expect(twice.status).toBe(200);
    expect(twice.body.match!.revision).toBe(once.body.match!.revision);
    // One hand played is one round stored, however often the phone asked.
    expect(once.body.game!.rounds).toHaveLength(1);
    expect(twice.body.game!.rounds).toHaveLength(1);
  });

  it('refuses a result written against an older match revision', async () => {
    const api = await server();
    const { tokens } = await room(api);
    const token = tokens[0]!;

    const opened = await api.call<TableState>('GET', `/api/table/session/${token}/state`);
    const matchId = opened.body.match!.id;
    const started = await api.call<TableState>(
      'POST',
      `/api/table/session/${token}/match/start`,
      { matchId, idempotencyKey: idempotencyKey('start') },
    );

    const teams = started.body.game!.game.teams;
    await api.call('POST', `/api/table/session/${token}/match/result`, {
      matchId,
      expectedRevision: started.body.match!.revision,
      idempotencyKey: idempotencyKey('first'),
      inputs: [teamInput(teams[0]!.id, 800), teamInput(teams[1]!.id, 200)],
    });

    // A second device — or the same one after a reload it did not notice —
    // submitting against what it last saw.
    const late = await api.call<{ error: string; currentRevision: number }>(
      'POST',
      `/api/table/session/${token}/match/result`,
      {
        matchId,
        expectedRevision: started.body.match!.revision,
        idempotencyKey: idempotencyKey('late'),
        inputs: [teamInput(teams[0]!.id, 10), teamInput(teams[1]!.id, 10)],
      },
    );

    expect(late.status).toBe(409);
    expect(late.body.error).toBe('conflict');

    const after = await api.call<TableState>('GET', `/api/table/session/${token}/state`);
    expect(after.body.game!.rounds).toHaveLength(1);
  });

  it('lets two tables hand in at the same moment without rejecting each other', async () => {
    const api = await server();
    const { tokens } = await room(api);

    const prepared = await Promise.all(
      tokens.slice(0, 2).map(async (token) => {
        const opened = await api.call<TableState>('GET', `/api/table/session/${token}/state`);
        const matchId = opened.body.match!.id;
        const started = await api.call<TableState>(
          'POST',
          `/api/table/session/${token}/match/start`,
          { matchId, idempotencyKey: idempotencyKey('start') },
        );
        return { token, matchId, started };
      }),
    );

    const results = await Promise.all(
      prepared.map(({ token, matchId, started }) => {
        const teams = started.body.game!.game.teams;
        return api.call<TableState>('POST', `/api/table/session/${token}/match/result`, {
          matchId,
          expectedRevision: started.body.match!.revision,
          idempotencyKey: idempotencyKey('parallel'),
          inputs: [teamInput(teams[0]!.id, 700), teamInput(teams[1]!.id, 300)],
        });
      }),
    );

    // The revision that matters is the match's own, so neither is stale.
    expect(results.map((entry) => entry.status)).toEqual([200, 200]);
    expect(results.every((entry) => entry.body.game!.rounds.length === 1)).toBe(true);
  });
});
