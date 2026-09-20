import { afterEach, describe, expect, it } from 'vitest';
import {
  isReachableFromOtherDevices,
  resolveOrigin,
  tableJoinUrl,
} from '../network';
import { idempotencyKey, startTestServer, tournamentInput, type TestServer } from './harness';
import type { PairingResponse, TableState, TournamentState } from '@/net/protocol';

/**
 * Which address a QR code points at.
 *
 * The bug this covers: the join link was built from the `Host` header of the
 * request that asked for it. The organiser asks, and the organiser is at
 * `localhost` — so every QR code pointed at the one device in the room that
 * never has to scan anything. The server knows its own addresses; the browser
 * does not; so the server decides.
 */

describe('the canonical origin', () => {
  const lan = { address: '192.168.1.42', name: 'Wi-Fi' };

  it('is the LAN address and the port the server bound', () => {
    expect(resolveOrigin({ host: '0.0.0.0', port: 4317, lan })).toBe('http://192.168.1.42:4317');
  });

  it('never points at this machine when a table has to reach it', () => {
    const origin = resolveOrigin({ host: '0.0.0.0', port: 4317, lan });

    expect(origin).not.toContain('localhost');
    expect(origin).not.toContain('127.0.0.1');
    expect(isReachableFromOtherDevices(origin)).toBe(true);
  });

  it('says localhost when the server is bound to loopback, because that is true', () => {
    // Nothing else can reach it, so a LAN address would be a promise the
    // server cannot keep.
    for (const host of ['127.0.0.1', 'localhost', '::1']) {
      expect(resolveOrigin({ host, port: 4317, lan })).toBe('http://localhost:4317');
    }
  });

  it('falls back to localhost when this machine is on no network', () => {
    const origin = resolveOrigin({ host: '0.0.0.0', port: 4317, lan: undefined });

    expect(origin).toBe('http://localhost:4317');
    expect(isReachableFromOtherDevices(origin)).toBe(false);
  });

  it('lets an operator say what is in front of the process', () => {
    // A reverse proxy or a hostname is something no amount of looking at
    // network adapters can discover, so it wins over everything.
    expect(
      resolveOrigin({
        publicUrl: 'https://tournament.example.com/',
        host: '0.0.0.0',
        port: 4317,
        lan,
      }),
    ).toBe('https://tournament.example.com');
  });
});

describe('a table join URL', () => {
  it('is the origin, the base path and the token', () => {
    expect(tableJoinUrl('http://192.168.1.42:4317', '/canasta/', 'abc123')).toBe(
      'http://192.168.1.42:4317/canasta/table/abc123',
    );
  });

  it('works for a server mounted at the root', () => {
    expect(tableJoinUrl('http://192.168.1.42:4317', '/', 'abc123')).toBe(
      'http://192.168.1.42:4317/table/abc123',
    );
  });

  it('does not double the slash when the origin has a trailing one', () => {
    expect(tableJoinUrl('https://tournament.example.com/', '/canasta/', 'abc123')).toBe(
      'https://tournament.example.com/canasta/table/abc123',
    );
  });

  it('carries no localhost when the origin is a LAN address', () => {
    const url = tableJoinUrl(
      resolveOrigin({ host: '0.0.0.0', port: 4317, lan: { address: '192.168.1.42', name: 'Wi-Fi' } }),
      '/canasta/',
      'abc123',
    );

    expect(url).toBe('http://192.168.1.42:4317/canasta/table/abc123');
    expect(url).not.toContain('localhost');
    expect(url).not.toContain('127.0.0.1');
  });
});

/* ------------------------------------------------ and over a real socket */

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

/** A tournament with a confirmed round, so there are tables to hand out. */
async function withTables(api: TestServer) {
  const created = await api.call<TournamentState>('POST', '/api/tournaments', tournamentInput(8));
  const id = created.body.tournament.id;

  const pairing = await api.call<PairingResponse>('POST', `/api/tournaments/${id}/pairing`, {});
  await api.call('POST', `/api/tournaments/${id}/commands`, {
    command: { kind: 'confirmRound', matches: pairing.body.matches },
  });

  return id;
}

describe('the join URL the organiser is actually handed', () => {
  it('uses the LAN address, not the address the organiser browsed to', async () => {
    // The request arrives on 127.0.0.1 — exactly the situation that produced
    // the bug — while the machine has a LAN address.
    const api = await server({ lan: { address: '192.168.1.42', name: 'Wi-Fi' } });
    const id = await withTables(api);

    const tables = await api.call<{ tables: { table: { id: string } }[] }>(
      'GET',
      `/api/tournaments/${id}/tables`,
    );
    const tableId = tables.body.tables[0]!.table.id;

    const issued = await api.call<{ joinUrl: string }>(
      'POST',
      `/api/tournaments/${id}/tables/${tableId}/session`,
    );

    expect(issued.body.joinUrl).toMatch(/^http:\/\/192\.168\.1\.42:\d+\/canasta\/table\/.+/);
    expect(issued.body.joinUrl).not.toContain('localhost');
    expect(issued.body.joinUrl).not.toContain('127.0.0.1');
  });

  it('gives the same URL on the tables list as on the session it just issued', async () => {
    const api = await server({ lan: { address: '10.0.0.7', name: 'Wi-Fi' } });
    const id = await withTables(api);

    const before = await api.call<{ tables: { table: { id: string } }[] }>(
      'GET',
      `/api/tournaments/${id}/tables`,
    );
    const tableId = before.body.tables[0]!.table.id;

    const issued = await api.call<{ joinUrl: string }>(
      'POST',
      `/api/tournaments/${id}/tables/${tableId}/session`,
    );
    const listed = await api.call<{ tables: { table: { id: string }; joinUrl?: string }[] }>(
      'GET',
      `/api/tournaments/${id}/tables`,
    );

    const again = listed.body.tables.find((entry) => entry.table.id === tableId)?.joinUrl;

    // One function builds this, so the QR code and a copied link cannot drift.
    expect(again).toBe(issued.body.joinUrl);
    expect(again).toContain('10.0.0.7');
  });

  it('is a URL that really resolves to this table on this server', async () => {
    const api = await server({ lan: { address: '192.168.1.42', name: 'Wi-Fi' } });
    const id = await withTables(api);

    const tables = await api.call<{ tables: { table: { id: string; number: number } }[] }>(
      'GET',
      `/api/tournaments/${id}/tables`,
    );
    const table = tables.body.tables[0]!.table;

    const issued = await api.call<{ joinUrl: string }>(
      'POST',
      `/api/tournaments/${id}/tables/${table.id}/session`,
    );

    // Only the host differs from what a phone would dial; the path and the
    // token are what the QR code carries.
    const token = issued.body.joinUrl.split('/table/')[1]!;
    const state = await api.call<TableState>('GET', `/api/table/session/${token}/state`);

    expect(state.status).toBe(200);
    expect(state.body.session.table.number).toBe(table.number);
    expect(state.body.match?.sideLines).toHaveLength(2);
  });

  it('honours an explicit public URL, for a proxy or a hostname', async () => {
    const api = await server({ publicUrl: 'https://tournament.example.com' });
    const id = await withTables(api);

    const tables = await api.call<{ tables: { table: { id: string } }[] }>(
      'GET',
      `/api/tournaments/${id}/tables`,
    );
    const issued = await api.call<{ joinUrl: string }>(
      'POST',
      `/api/tournaments/${id}/tables/${tables.body.tables[0]!.table.id}/session`,
    );

    expect(issued.body.joinUrl).toMatch(
      /^https:\/\/tournament\.example\.com\/canasta\/table\/.+/,
    );
  });

  it('still works end to end through the URL the QR code carries', async () => {
    const api = await server({ lan: { address: '192.168.1.42', name: 'Wi-Fi' } });
    const id = await withTables(api);

    const tables = await api.call<{ tables: { table: { id: string } }[] }>(
      'GET',
      `/api/tournaments/${id}/tables`,
    );
    const issued = await api.call<{ joinUrl: string }>(
      'POST',
      `/api/tournaments/${id}/tables/${tables.body.tables[0]!.table.id}/session`,
    );

    const token = issued.body.joinUrl.split('/table/')[1]!;
    const opened = await api.call<TableState>('GET', `/api/table/session/${token}/state`);
    const started = await api.call<TableState>(
      'POST',
      `/api/table/session/${token}/match/start`,
      { matchId: opened.body.match!.id, idempotencyKey: idempotencyKey('start') },
    );

    expect(started.status).toBe(200);
    expect(started.body.match!.status).toBe('busy');
    expect(started.body.game?.game.teams).toHaveLength(2);
  });
});
