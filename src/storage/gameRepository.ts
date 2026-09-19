import type { GameId } from '@/domain/ids';
import type { Game } from '@/domain/game';
import {
  RecordAlreadyExistsError,
  RecordNotFoundError,
  type GameListFilter,
  type GameRepository,
  type GameSummary,
} from '@/application/ports';
import type { CanastaDatabase } from './db';
import { fromGameRecord, toGameRecord, type GameRecord } from './records';

/**
 * Reads and writes games. Contains no scoring, no rule interpretation and no
 * variant-specific behaviour — it stores what the domain hands it.
 */
export function createGameRepository(db: CanastaDatabase): GameRepository {
  /**
   * Purely structural: names and counts for the history list. No configuration
   * value is read and nothing is derived from the rule set.
   */
  function toSummary(record: GameRecord, roundCount: number): GameSummary {
    return {
      id: record.id,
      name: record.name,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      finishedAt: record.finishedAt,
      ruleSetName: record.ruleSetRef.name,
      ruleSetId: record.ruleSetRef.id,
      playerNames: record.players.map((player) => player.name),
      teamNames: record.teams.map((team) => team.name),
      roundCount,
    };
  }

  return {
    async create(game) {
      const record = toGameRecord(game);
      await db.transaction('rw', db.games, async () => {
        if (await db.games.get(record.id)) {
          throw new RecordAlreadyExistsError('games', record.id);
        }
        await db.games.add(record);
      });
      return fromGameRecord(record);
    },

    async get(id) {
      const record = await db.games.get(id);
      return record ? fromGameRecord(record) : undefined;
    },

    async update(game) {
      const record = toGameRecord(game);
      await db.transaction('rw', db.games, async () => {
        if (!(await db.games.get(record.id))) {
          throw new RecordNotFoundError('games', record.id);
        }
        await db.games.put(record);
      });
      return fromGameRecord(record);
    },

    async delete(id: GameId) {
      // A game and its rounds go together, or neither goes.
      await db.transaction('rw', db.games, db.rounds, db.drafts, async () => {
        await db.rounds.where('gameId').equals(id).delete();
        await db.drafts.where('gameId').equals(id).delete();
        await db.games.delete(id);
      });
    },

    async list(filter: GameListFilter = {}) {
      const records = filter.status
        ? await db.games.where('status').equals(filter.status).toArray()
        : await db.games.toArray();

      const ascending = filter.order === 'oldest';
      records.sort((a, b) =>
        ascending ? a.updatedAt.localeCompare(b.updatedAt) : b.updatedAt.localeCompare(a.updatedAt),
      );

      const limited = filter.limit === undefined ? records : records.slice(0, filter.limit);

      const counts = await Promise.all(
        limited.map((record) => db.rounds.where('gameId').equals(record.id).count()),
      );

      return limited.map((record, index) => toSummary(record, counts[index] ?? 0));
    },

    async exists(id) {
      return (await db.games.where('id').equals(id).count()) > 0;
    },
  } satisfies GameRepository & { create(game: Game): Promise<Game> };
}
