import type { Repositories, StoreName } from '@/application/ports';
import { DB_VERSION, getDatabase, type CanastaDatabase } from './db';
import { createDraftRepository } from './draftRepository';
import { createGameRepository } from './gameRepository';
import { createMetaRepository } from './metaRepository';
import { createPresetRepository } from './presetRepository';
import { createRoundRepository } from './roundRepository';
import { createTournamentRepository } from './tournamentRepository';
import { systemClock, type Clock } from './time';

export interface RepositoryOptions {
  clock?: Clock;
}

/**
 * The application's single entry point to persistence.
 *
 * Everything above this file goes through `repositories.*`; no stray Dexie
 * queries anywhere else in the app.
 */
export function createRepositories(
  db: CanastaDatabase,
  options: RepositoryOptions = {},
): Repositories {
  const clock = options.clock ?? systemClock;

  const tables = {
    games: db.games,
    rounds: db.rounds,
    presets: db.presets,
    drafts: db.drafts,
    meta: db.meta,
    tournaments: db.tournaments,
  } as const;

  return {
    games: createGameRepository(db),
    rounds: createRoundRepository(db),
    presets: createPresetRepository(db),
    drafts: createDraftRepository(db, clock),
    meta: createMetaRepository(db),
    tournaments: createTournamentRepository(db),

    transaction<T>(stores: readonly StoreName[], fn: () => Promise<T>): Promise<T> {
      const involved = stores.map((store) => tables[store]);
      return db.transaction('rw', involved, fn);
    },
  };
}

let shared: Repositories | undefined;

/** The repositories backed by the application's single database instance. */
export function getRepositories(): Repositories {
  shared ??= createRepositories(getDatabase());
  return shared;
}

/**
 * Records the schema version so a broken install can be diagnosed without any
 * telemetry (spec §32).
 */
export async function recordSchemaVersion(repositories: Repositories): Promise<void> {
  await repositories.meta.set('schemaVersion', DB_VERSION);
}

export { CanastaDatabase, createDatabase, getDatabase, DB_NAME, DB_VERSION } from './db';
export { now, systemClock, fixedClock, type Clock } from './time';
export type {
  DraftRecord,
  GameRecord,
  MetaRecord,
  PresetRecord,
  RoundRecord,
  TournamentRecord,
} from './records';
