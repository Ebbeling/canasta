import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * The server's database.
 *
 * SQLite through `node:sqlite`, which ships with Node itself — no native build
 * step, nothing to compile on the organiser's laptop, and one file that can be
 * copied away as a backup.
 *
 * The schema stores documents, not a normalised model. That is the same choice
 * the browser side already made: a game, a round and a tournament are each read
 * and written whole, the domain owns their shape, and a second vocabulary here
 * would only be a place for the two to disagree. What *is* normalised is
 * everything the server needs to query on — status, ownership, timestamps —
 * which is why those sit in their own columns beside the document.
 */

/** Bumped when the tables below change shape. */
export const SCHEMA_VERSION = 1;

export type Database = DatabaseSync;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS games (
    id          TEXT PRIMARY KEY,
    status      TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    document    TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS games_status ON games(status);
  CREATE INDEX IF NOT EXISTS games_updated ON games(updated_at);

  CREATE TABLE IF NOT EXISTS rounds (
    id           TEXT PRIMARY KEY,
    game_id      TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    created_at   TEXT NOT NULL,
    document     TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS rounds_game ON rounds(game_id, round_number);

  CREATE TABLE IF NOT EXISTS tournaments (
    id          TEXT PRIMARY KEY,
    status      TEXT NOT NULL,
    revision    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    document    TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS tournaments_status ON tournaments(status);
  CREATE INDEX IF NOT EXISTS tournaments_updated ON tournaments(updated_at);

  CREATE TABLE IF NOT EXISTS presets (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    document   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS drafts (
    key        TEXT PRIMARY KEY,
    kind       TEXT NOT NULL,
    game_id    TEXT,
    updated_at TEXT NOT NULL,
    document   TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS drafts_kind ON drafts(kind);
  CREATE INDEX IF NOT EXISTS drafts_game ON drafts(game_id);

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  /*
   * A device's claim on one physical table.
   *
   * Server infrastructure, not tournament domain: a token has no meaning in a
   * tournament and must never reach an export. It lives here so revoking a
   * device cannot possibly change a result.
   */
  CREATE TABLE IF NOT EXISTS table_sessions (
    token         TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL,
    table_id      TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    last_seen_at  TEXT,
    revoked_at    TEXT
  );

  CREATE INDEX IF NOT EXISTS table_sessions_table
    ON table_sessions(tournament_id, table_id);

  /*
   * Answers already given, so a retried request is answered rather than
   * replayed. Keyed by the caller's key *and* its scope, so one table cannot
   * consume another's key.
   */
  CREATE TABLE IF NOT EXISTS idempotency (
    scope      TEXT NOT NULL,
    key        TEXT NOT NULL,
    created_at TEXT NOT NULL,
    response   TEXT NOT NULL,
    PRIMARY KEY (scope, key)
  );
`;

export interface OpenOptions {
  /** `:memory:` is used by the tests. */
  path: string;
}

export function openDatabase({ path }: OpenOptions): Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  const db = new DatabaseSync(path);

  // Write-ahead logging keeps a reader from blocking the writer, which is what
  // a room full of tables submitting at once looks like. Not available for an
  // in-memory database, where it is also pointless.
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);

  const current = db
    .prepare('SELECT value FROM meta WHERE key = ?')
    .get('schemaVersion') as { value?: string } | undefined;

  if (current?.value === undefined) {
    db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(
      'schemaVersion',
      JSON.stringify(SCHEMA_VERSION),
    );
  }

  return db;
}
