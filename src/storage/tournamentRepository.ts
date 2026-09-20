import type { Tournament } from '@/domain/tournament';
import {
  RecordAlreadyExistsError,
  RecordNotFoundError,
  type TournamentRepository,
  type TournamentSummary,
} from '@/application/ports';
import type { CanastaDatabase } from './db';
import { fromTournamentRecord, toTournamentRecord, type TournamentRecord } from './records';

/**
 * Reads and writes tournaments.
 *
 * Structural only: it counts participants and rounds for the list and stores
 * what it is handed. It never looks inside a table, never pairs anybody and
 * never scores anything.
 */
export function createTournamentRepository(db: CanastaDatabase): TournamentRepository {
  function toSummary(record: TournamentRecord): TournamentSummary {
    return {
      id: record.id,
      name: record.name,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
      participantCount: record.participants.length,
      roundCount: record.rounds.length,
      dayCount: record.days.length,
      ruleSetName: record.gameSettings.ruleSetName,
    };
  }

  return {
    async create(tournament: Tournament) {
      const record = toTournamentRecord(tournament);
      await db.transaction('rw', db.tournaments, async () => {
        if (await db.tournaments.get(record.id)) {
          throw new RecordAlreadyExistsError('tournaments', record.id);
        }
        await db.tournaments.add(record);
      });
      return fromTournamentRecord(record);
    },

    async get(id) {
      const record = await db.tournaments.get(id);
      return record ? fromTournamentRecord(record) : undefined;
    },

    async update(tournament: Tournament) {
      const record = toTournamentRecord(tournament);
      await db.transaction('rw', db.tournaments, async () => {
        if (!(await db.tournaments.get(record.id))) {
          throw new RecordNotFoundError('tournaments', record.id);
        }
        await db.tournaments.put(record);
      });
      return fromTournamentRecord(record);
    },

    async delete(id) {
      await db.tournaments.delete(id);
    },

    async list(filter = {}) {
      let records = filter.status
        ? await db.tournaments.where('status').equals(filter.status).toArray()
        : await db.tournaments.toArray();

      records = records.sort((a, b) =>
        filter.order === 'oldest'
          ? a.updatedAt.localeCompare(b.updatedAt)
          : b.updatedAt.localeCompare(a.updatedAt),
      );

      if (filter.limit !== undefined) records = records.slice(0, filter.limit);
      return records.map(toSummary);
    },
  };
}
