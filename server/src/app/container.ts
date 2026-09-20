import { BUILTIN_RULE_SETS } from '@/rules/builtin';
import { createServices, type Services } from '@/application/services';
import type { Clock } from '@/application/ports';
import { createSqliteRepositories } from '../storage/repositories';
import { createSessionStore, type SessionStore } from '../storage/sessions';
import { createIdempotencyStore, type IdempotencyStore } from '../storage/idempotency';
import { openDatabase, type Database } from '../storage/sqlite';
import { primaryLanAddress, resolveOrigin, type LanAddress } from '../network';
import { createHub, type Hub } from './hub';
import { createTournamentApi, type TournamentApi } from './tournamentApi';

/**
 * The only place that joins SQLite to the application layer.
 *
 * The mirror image of `src/app/container.ts`, which joins Dexie to the very
 * same `createServices`. That both exist and neither changes the services is
 * the whole architectural claim of this feature: the tournament rules, the
 * pairing and the scoring are written once and run in either process.
 */

export const systemClock: Clock = { now: () => new Date().toISOString() };

export interface Container {
  db: Database;
  services: Services;
  sessions: SessionStore;
  idempotency: IdempotencyStore;
  hub: Hub;
  api: TournamentApi;
  /** The canonical origin every outward-facing link is built from. */
  origin(): string;
  close(): void;
}

export interface ContainerOptions {
  databasePath: string;
  basePath: string;
  clock?: Clock;
  /** How to reach this server from another device. See `resolveOrigin`. */
  origin?: {
    publicUrl?: string;
    host: string;
    /**
     * A function when the port is not known yet: asking for port 0 lets the
     * operating system choose, and the answer only exists once the socket is
     * bound. That is how the tests avoid fighting over a fixed port.
     */
    port: number | (() => number);
    /** Injected so a test can pretend to be on a network. */
    lan?: () => LanAddress | undefined;
  };
}

export function createContainer({
  databasePath,
  basePath,
  clock = systemClock,
  origin,
}: ContainerOptions): Container {
  const db = openDatabase({ path: databasePath });

  const services = createServices({
    repositories: createSqliteRepositories(db, { clock }),
    clock,
    builtins: BUILTIN_RULE_SETS,
  });

  const sessions = createSessionStore(db, clock);
  const idempotency = createIdempotencyStore(db, clock);
  const hub = createHub(clock);

  /*
   * Resolved per call, not once at start-up: a laptop that is carried to a
   * different network between two rounds should hand out QR codes for the
   * network it is on now.
   */
  const serverOrigin = () =>
    origin
      ? resolveOrigin({
          publicUrl: origin.publicUrl,
          host: origin.host,
          port: typeof origin.port === 'function' ? origin.port() : origin.port,
          lan: (origin.lan ?? primaryLanAddress)(),
        })
      : 'http://localhost';

  const api = createTournamentApi(
    { services, sessions, idempotency, hub },
    basePath,
    serverOrigin,
  );

  return {
    db,
    services,
    sessions,
    idempotency,
    hub,
    api,
    origin: serverOrigin,
    close() {
      hub.closeAll();
      db.close();
    },
  };
}
