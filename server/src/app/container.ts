import { BUILTIN_RULE_SETS } from '@/rules/builtin';
import { createServices, type Services } from '@/application/services';
import type { Clock } from '@/application/ports';
import { createSqliteRepositories } from '../storage/repositories';
import { createSessionStore, type SessionStore } from '../storage/sessions';
import { createIdempotencyStore, type IdempotencyStore } from '../storage/idempotency';
import { openDatabase, type Database } from '../storage/sqlite';
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
  close(): void;
}

export interface ContainerOptions {
  databasePath: string;
  basePath: string;
  clock?: Clock;
}

export function createContainer({
  databasePath,
  basePath,
  clock = systemClock,
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

  const api = createTournamentApi({ services, sessions, idempotency, hub }, basePath);

  return {
    db,
    services,
    sessions,
    idempotency,
    hub,
    api,
    close() {
      hub.closeAll();
      db.close();
    },
  };
}
