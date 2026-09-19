import Dexie, { type Table } from 'dexie';
import type { DraftRecord, GameRecord, MetaRecord, PresetRecord, RoundRecord } from './records';

/**
 * The Canasta IndexedDB database.
 *
 * ## Current version: 1
 *
 * | Store     | Primary key | Indexes                                          |
 * |-----------|-------------|--------------------------------------------------|
 * | `games`   | `id`        | `status`, `createdAt`, `updatedAt`                 |
 * | `rounds`  | `id`        | `gameId`, `[gameId+roundNumber]`, `createdAt`      |
 * | `presets` | `id`        | `name`, `updatedAt`, `derivedFrom.ruleSetId`       |
 * | `drafts`  | `key`       | `kind`, `gameId`, `updatedAt`                      |
 * | `meta`    | `key`       | —                                                  |
 *
 * `rounds` is a store of its own rather than an array on the game: it is the hot
 * write path during a game, and rewriting the whole game document — snapshot and
 * all — on every round would be wasteful.
 *
 * Players and teams *are* embedded in the game. They are strictly per-game,
 * never queried independently and never more than a handful of rows, so
 * normalising them would buy nothing and cost joins plus transaction headaches.
 *
 * ## Migration strategy
 *
 * - Every schema change bumps `db.version(n)` and **repeats the full `.stores()`
 *   definition**; omitting a store in a later version deletes it.
 * - Index-only changes need nothing more. Data-shape changes get an
 *   `.upgrade(tx => …)` in `migrations/vN.ts`, one function per version, each
 *   tested against a fixture built with `fake-indexeddb`.
 * - `recordVersion` on `GameRecord` and `RoundRecord` tracks record shape
 *   independently of the database version, so a lazy migration can recognise an
 *   old record without a full rewrite.
 * - A deleted store name is never reused.
 *
 * No speculative future versions are defined here.
 */
export const DB_NAME = 'canasta';
export const DB_VERSION = 1;

export class CanastaDatabase extends Dexie {
  games!: Table<GameRecord, string>;
  rounds!: Table<RoundRecord, string>;
  presets!: Table<PresetRecord, string>;
  drafts!: Table<DraftRecord, string>;
  meta!: Table<MetaRecord, string>;

  constructor(name: string = DB_NAME) {
    super(name);

    this.version(1).stores({
      games: 'id, status, createdAt, updatedAt',
      rounds: 'id, gameId, [gameId+roundNumber], createdAt',
      presets: 'id, name, updatedAt, derivedFrom.ruleSetId',
      drafts: 'key, kind, gameId, updatedAt',
      meta: 'key',
    });
  }
}

let shared: CanastaDatabase | undefined;

/** The application's single database instance. */
export function getDatabase(): CanastaDatabase {
  shared ??= new CanastaDatabase();
  return shared;
}

/** Creates an isolated database, for tests. */
export function createDatabase(name: string): CanastaDatabase {
  return new CanastaDatabase(name);
}
