import type { Game } from '@/domain/game';
import type { Round } from '@/domain/round';
import type { Tournament } from '@/domain/tournament';
import type { CustomRuleSetRecord } from '@/rules/schema/ruleSet';
import {
  RecordAlreadyExistsError,
  RecordNotFoundError,
  type AppMeta,
  type Draft,
  type GameSummary,
  type Repositories,
  type StoreName,
  type TournamentSummary,
} from '@/application/ports';
import type { Clock } from '@/application/ports';
import type { Database } from './sqlite';

/**
 * The persistence port, backed by SQLite.
 *
 * This is the whole reason the server needs no tournament logic of its own: the
 * application layer was already written against `Repositories` rather than
 * against Dexie, so handing it a different implementation runs the same
 * services — the same pairing, the same standings, the same game engine —
 * inside Node. Nothing in `src/application` or `src/tournament` knows this file
 * exists.
 *
 * `node:sqlite` is synchronous. Every method still returns a promise because
 * the port says so, and because a future server may well talk to something that
 * genuinely is asynchronous.
 */

function parse<T>(row: { document: string } | undefined): T | undefined {
  return row ? (JSON.parse(row.document) as T) : undefined;
}

export interface SqliteRepositoryOptions {
  clock: Clock;
}

export function createSqliteRepositories(
  db: Database,
  { clock }: SqliteRepositoryOptions,
): Repositories {
  /* --------------------------------------------------------------- games */

  function gameSummary(game: Game, roundCount: number): GameSummary {
    return {
      id: game.id,
      name: game.name,
      status: game.status,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
      finishedAt: game.finishedAt,
      ruleSetName: game.ruleSetRef.name,
      ruleSetId: game.ruleSetRef.id,
      playerNames: game.players.map((player) => player.name),
      teamNames: game.teams.map((team) => team.name),
      roundCount,
    };
  }

  function readGame(id: string): Game | undefined {
    return parse<Game>(
      db.prepare('SELECT document FROM games WHERE id = ?').get(id) as
        | { document: string }
        | undefined,
    );
  }

  function readTournament(id: string): Tournament | undefined {
    return parse<Tournament>(
      db.prepare('SELECT document FROM tournaments WHERE id = ?').get(id) as
        | { document: string }
        | undefined,
    );
  }

  /* ---------------------------------------------------------- transaction */

  // `node:sqlite` has no nested transactions, and the server runs one request
  // at a time through this layer, so a depth counter is enough to let an inner
  // repository call join the outer transaction instead of starting its own.
  let depth = 0;

  async function transaction<T>(_stores: readonly StoreName[], fn: () => Promise<T>): Promise<T> {
    if (depth > 0) return fn();

    depth += 1;
    db.exec('BEGIN IMMEDIATE');
    try {
      const value = await fn();
      db.exec('COMMIT');
      return value;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    } finally {
      depth -= 1;
    }
  }

  return {
    transaction,

    games: {
      async create(game) {
        if (db.prepare('SELECT 1 FROM games WHERE id = ?').get(game.id)) {
          throw new RecordAlreadyExistsError('games', game.id);
        }
        db.prepare(
          'INSERT INTO games (id, status, created_at, updated_at, document) VALUES (?, ?, ?, ?, ?)',
        ).run(game.id, game.status, game.createdAt, game.updatedAt, JSON.stringify(game));
        return structuredClone(game);
      },

      async get(id) {
        return readGame(id);
      },

      async update(game) {
        if (!db.prepare('SELECT 1 FROM games WHERE id = ?').get(game.id)) {
          throw new RecordNotFoundError('games', game.id);
        }
        db.prepare('UPDATE games SET status = ?, updated_at = ?, document = ? WHERE id = ?').run(
          game.status,
          game.updatedAt,
          JSON.stringify(game),
          game.id,
        );
        return structuredClone(game);
      },

      async delete(id) {
        await transaction(['games', 'rounds'], async () => {
          db.prepare('DELETE FROM rounds WHERE game_id = ?').run(id);
          db.prepare('DELETE FROM games WHERE id = ?').run(id);
        });
      },

      async list(filter = {}) {
        const rows = (
          filter.status
            ? db
                .prepare('SELECT id, document FROM games WHERE status = ?')
                .all(filter.status)
            : db.prepare('SELECT id, document FROM games').all()
        ) as { id: string; document: string }[];

        const counts = new Map(
          (
            db.prepare('SELECT game_id, COUNT(*) AS total FROM rounds GROUP BY game_id').all() as {
              game_id: string;
              total: number;
            }[]
          ).map((row) => [row.game_id, row.total]),
        );

        const summaries = rows
          .map((row) => JSON.parse(row.document) as Game)
          .map((game) => gameSummary(game, counts.get(game.id) ?? 0))
          .sort((a, b) =>
            filter.order === 'oldest'
              ? a.updatedAt.localeCompare(b.updatedAt)
              : b.updatedAt.localeCompare(a.updatedAt),
          );

        return filter.limit === undefined ? summaries : summaries.slice(0, filter.limit);
      },

      async exists(id) {
        return db.prepare('SELECT 1 FROM games WHERE id = ?').get(id) !== undefined;
      },
    },

    rounds: {
      async create(round) {
        if (db.prepare('SELECT 1 FROM rounds WHERE id = ?').get(round.id)) {
          throw new RecordAlreadyExistsError('rounds', round.id);
        }
        db.prepare(
          'INSERT INTO rounds (id, game_id, round_number, created_at, document) VALUES (?, ?, ?, ?, ?)',
        ).run(round.id, round.gameId, round.sequence, round.createdAt, JSON.stringify(round));
        return structuredClone(round);
      },

      async get(id) {
        return parse<Round>(
          db.prepare('SELECT document FROM rounds WHERE id = ?').get(id) as
            | { document: string }
            | undefined,
        );
      },

      async update(round) {
        if (!db.prepare('SELECT 1 FROM rounds WHERE id = ?').get(round.id)) {
          throw new RecordNotFoundError('rounds', round.id);
        }
        db.prepare('UPDATE rounds SET round_number = ?, document = ? WHERE id = ?').run(
          round.sequence,
          JSON.stringify(round),
          round.id,
        );
        return structuredClone(round);
      },

      async delete(id) {
        db.prepare('DELETE FROM rounds WHERE id = ?').run(id);
      },

      async listByGame(gameId) {
        const rows = db
          .prepare('SELECT document FROM rounds WHERE game_id = ? ORDER BY round_number ASC')
          .all(gameId) as { document: string }[];
        return rows.map((row) => JSON.parse(row.document) as Round);
      },

      async deleteByGame(gameId) {
        const before = db
          .prepare('SELECT COUNT(*) AS total FROM rounds WHERE game_id = ?')
          .get(gameId) as { total: number };
        db.prepare('DELETE FROM rounds WHERE game_id = ?').run(gameId);
        return before.total;
      },

      async lastRoundNumber(gameId) {
        const row = db
          .prepare('SELECT MAX(round_number) AS highest FROM rounds WHERE game_id = ?')
          .get(gameId) as { highest: number | null };
        return row.highest ?? 0;
      },
    },

    presets: {
      async create(preset) {
        if (db.prepare('SELECT 1 FROM presets WHERE id = ?').get(preset.id)) {
          throw new RecordAlreadyExistsError('presets', preset.id);
        }
        db.prepare('INSERT INTO presets (id, name, updated_at, document) VALUES (?, ?, ?, ?)').run(
          preset.id,
          preset.name,
          preset.updatedAt,
          JSON.stringify(preset),
        );
        return structuredClone(preset);
      },

      async get(id) {
        return parse<CustomRuleSetRecord>(
          db.prepare('SELECT document FROM presets WHERE id = ?').get(id) as
            | { document: string }
            | undefined,
        );
      },

      async update(preset) {
        if (!db.prepare('SELECT 1 FROM presets WHERE id = ?').get(preset.id)) {
          throw new RecordNotFoundError('presets', preset.id);
        }
        db.prepare('UPDATE presets SET name = ?, updated_at = ?, document = ? WHERE id = ?').run(
          preset.name,
          preset.updatedAt,
          JSON.stringify(preset),
          preset.id,
        );
        return structuredClone(preset);
      },

      async delete(id) {
        db.prepare('DELETE FROM presets WHERE id = ?').run(id);
      },

      async list() {
        const rows = db
          .prepare('SELECT document FROM presets ORDER BY updated_at DESC')
          .all() as { document: string }[];
        return rows.map((row) => JSON.parse(row.document) as CustomRuleSetRecord);
      },
    },

    drafts: {
      async put(draft) {
        const stored: Draft = { ...draft, updatedAt: clock.now() } as Draft;
        db.prepare(
          'INSERT OR REPLACE INTO drafts (key, kind, game_id, updated_at, document) VALUES (?, ?, ?, ?, ?)',
        ).run(
          stored.key,
          stored.kind,
          stored.gameId ?? null,
          stored.updatedAt,
          JSON.stringify(stored),
        );
        return stored as never;
      },

      async get(key) {
        return parse(
          db.prepare('SELECT document FROM drafts WHERE key = ?').get(key) as
            | { document: string }
            | undefined,
        ) as never;
      },

      async delete(key) {
        db.prepare('DELETE FROM drafts WHERE key = ?').run(key);
      },

      async list(kind) {
        const rows = (
          kind
            ? db.prepare('SELECT document FROM drafts WHERE kind = ?').all(kind)
            : db.prepare('SELECT document FROM drafts').all()
        ) as { document: string }[];
        return rows.map((row) => JSON.parse(row.document) as Draft);
      },

      async listByGame(gameId) {
        const rows = db
          .prepare('SELECT document FROM drafts WHERE game_id = ?')
          .all(gameId) as { document: string }[];
        return rows.map((row) => JSON.parse(row.document) as Draft);
      },
    },

    meta: {
      async get(key) {
        const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
          | { value: string }
          | undefined;
        return row ? (JSON.parse(row.value) as never) : undefined;
      },

      async set(key, value) {
        db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(
          key,
          JSON.stringify(value),
        );
      },

      async delete(key) {
        db.prepare('DELETE FROM meta WHERE key = ?').run(key);
      },

      async all() {
        const rows = db.prepare('SELECT key, value FROM meta').all() as {
          key: string;
          value: string;
        }[];
        const meta: Record<string, unknown> = {};
        for (const row of rows) meta[row.key] = JSON.parse(row.value);
        return meta as Partial<AppMeta>;
      },
    },

    tournaments: {
      async create(tournament) {
        if (db.prepare('SELECT 1 FROM tournaments WHERE id = ?').get(tournament.id)) {
          throw new RecordAlreadyExistsError('tournaments', tournament.id);
        }
        db.prepare(
          'INSERT INTO tournaments (id, status, revision, created_at, updated_at, document) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(
          tournament.id,
          tournament.status,
          tournament.revision ?? 0,
          tournament.createdAt,
          tournament.updatedAt,
          JSON.stringify(tournament),
        );
        return structuredClone(tournament);
      },

      async get(id) {
        return readTournament(id);
      },

      async update(tournament) {
        if (!db.prepare('SELECT 1 FROM tournaments WHERE id = ?').get(tournament.id)) {
          throw new RecordNotFoundError('tournaments', tournament.id);
        }
        db.prepare(
          'UPDATE tournaments SET status = ?, revision = ?, updated_at = ?, document = ? WHERE id = ?',
        ).run(
          tournament.status,
          tournament.revision ?? 0,
          tournament.updatedAt,
          JSON.stringify(tournament),
          tournament.id,
        );
        return structuredClone(tournament);
      },

      async delete(id) {
        await transaction(['tournaments'], async () => {
          db.prepare('DELETE FROM table_sessions WHERE tournament_id = ?').run(id);
          db.prepare('DELETE FROM tournaments WHERE id = ?').run(id);
        });
      },

      async list(filter = {}) {
        const rows = (
          filter.status
            ? db.prepare('SELECT document FROM tournaments WHERE status = ?').all(filter.status)
            : db.prepare('SELECT document FROM tournaments').all()
        ) as { document: string }[];

        const summaries: TournamentSummary[] = rows
          .map((row) => JSON.parse(row.document) as Tournament)
          .map((tournament) => ({
            id: tournament.id,
            name: tournament.name,
            status: tournament.status,
            createdAt: tournament.createdAt,
            updatedAt: tournament.updatedAt,
            startedAt: tournament.startedAt,
            finishedAt: tournament.finishedAt,
            participantCount: tournament.participants.length,
            roundCount: tournament.rounds.length,
            dayCount: tournament.days.length,
            ruleSetName: tournament.gameSettings.ruleSetName,
          }))
          .sort((a, b) =>
            filter.order === 'oldest'
              ? a.updatedAt.localeCompare(b.updatedAt)
              : b.updatedAt.localeCompare(a.updatedAt),
          );

        return filter.limit === undefined ? summaries : summaries.slice(0, filter.limit);
      },
    },
  };
}
