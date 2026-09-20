import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContainer, type Container } from '../app/container';
import { readConfig, type ServerConfig } from '../config';
import { createCanastaServer, type CanastaServer } from '../http/server';

/**
 * A real server, on a real socket, for a test.
 *
 * Deliberately not a mock of the HTTP layer: the things this feature has to get
 * right — a scope check, a rejected revision, a retried request — are things
 * that only exist once a request has actually been parsed and routed. Tests
 * therefore talk to it the way a phone does.
 *
 * Port 0 lets the operating system pick a free one, so tests never collide with
 * each other or with a server the developer left running.
 */

export interface TestServer {
  base: string;
  config: ServerConfig;
  container: Container;
  server: CanastaServer;
  /** Fetch with the base URL and JSON already taken care of. */
  call<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; body: T }>;
  /** Stops the server but keeps the database file, so it can be reopened. */
  stop(): Promise<void>;
  /** Stops and deletes everything. */
  dispose(): Promise<void>;
}

export interface StartOptions {
  /** Reuse an existing directory, to restart onto the same database. */
  directory?: string;
  webRoot?: string;
  /**
   * Pretend this machine is on a network.
   *
   * The tests bind the loopback device, where the honest answer is
   * `localhost`. A table join link is about the *other* devices in the room,
   * so proving it uses the LAN address means saying which one there is.
   */
  lan?: { address: string; name: string };
  publicUrl?: string;
}

export async function startTestServer(options: StartOptions = {}): Promise<TestServer> {
  const directory = options.directory ?? mkdtempSync(join(tmpdir(), 'canasta-server-'));

  const config: ServerConfig = {
    ...readConfig([], {}, directory),
    port: 0,
    host: '127.0.0.1',
    databasePath: join(directory, 'tournament.sqlite'),
    webRoot: options.webRoot ?? join(directory, 'no-web-build'),
  };

  // Port 0 means "whatever is free", so the real one only exists after
  // `listen()`. The container reads it through a function for that reason.
  let bound = 0;

  const container = createContainer({
    databasePath: config.databasePath,
    basePath: config.basePath,
    origin: {
      publicUrl: options.publicUrl,
      // A test that supplies a LAN address is asking about the network case,
      // so the bind host has to be the one the real server uses there.
      host: options.lan ? '0.0.0.0' : config.host,
      port: () => bound,
      lan: () => options.lan,
    },
  });

  const server = createCanastaServer(container, config);
  await server.listen();

  const port = server.address()?.port ?? 0;
  bound = port;
  const base = `http://127.0.0.1:${port}`;

  return {
    base,
    config,
    container,
    server,

    async call<T>(method: string, path: string, body?: unknown) {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      const text = await response.text();
      return {
        status: response.status,
        body: (text.length > 0 ? JSON.parse(text) : undefined) as T,
      };
    },

    async stop() {
      await server.close();
      container.close();
    },

    async dispose() {
      await server.close();
      container.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

/* ------------------------------------------------------------- fixtures */

export const PLAYERS = ['Anna', 'Bram', 'Carla', 'Daan', 'Eva', 'Frank', 'Gerda', 'Hans'];

export function tournamentInput(count = 8, overrides: Record<string, unknown> = {}) {
  return {
    name: 'Testtoernooi',
    settings: {
      mode: 'fixed',
      scoringMode: 'tournament-points',
      drawAllowed: true,
      oddParticipantMode: 'bye',
      manualPairingAllowed: true,
      plannedDays: 1,
      plannedRoundsPerDay: 2,
      ...overrides,
    },
    gameSettings: {
      ruleSetId: 'builtin.classic',
      ruleSetOrigin: 'builtin',
      ruleSetName: 'Classic Canasta',
      participantsPerMatch: 4,
      teamsPerMatch: 2,
      overrides: [],
    },
    participants: PLAYERS.slice(0, count).map((name) => ({
      kind: 'player',
      name,
      memberNames: [name],
    })),
  };
}

/** One team's entry for a round, with everything the engine expects present. */
export function teamInput(teamId: string, cardPoints: number) {
  return {
    teamId,
    cardPoints,
    cardsInHand: 0,
    naturalCanastas: 0,
    mixedCanastas: 0,
    redThrees: 0,
    opened: true,
    wentOut: false,
    concealedGoingOut: false,
    extra: {},
  };
}

/** A key long enough for the protocol, unique per call. */
let keys = 0;
export function idempotencyKey(label = 'test'): string {
  keys += 1;
  return `${label}-${keys}-${Date.now()}`.padEnd(12, '0');
}
