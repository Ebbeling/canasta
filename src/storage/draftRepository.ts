import type { Draft, DraftRepository } from '@/application/ports';
import type { CanastaDatabase } from './db';
import { fromDraftRecord, toDraftRecord } from './records';
import { systemClock, type Clock } from './time';

/**
 * Throwaway in-progress input: an unfinished round, a half-completed new-game
 * wizard, a preset being edited.
 *
 * Drafts are always written with `put`, never `add`: there is exactly one draft
 * per key and the newest write wins. Nothing here computes a score — a draft is
 * opaque data until the application layer commits it.
 */
export function createDraftRepository(
  db: CanastaDatabase,
  clock: Clock = systemClock,
): DraftRepository {
  return {
    async put<T>(draft: Omit<Draft<T>, 'updatedAt'>) {
      const complete: Draft<T> = { ...draft, updatedAt: clock.now() };
      await db.drafts.put(toDraftRecord(complete as Draft));
      return complete;
    },

    async get<T>(key: string) {
      const record = await db.drafts.get(key);
      return record ? fromDraftRecord<T>(record) : undefined;
    },

    async delete(key) {
      await db.drafts.delete(key);
    },

    async list(kind) {
      const records = kind
        ? await db.drafts.where('kind').equals(kind).toArray()
        : await db.drafts.toArray();
      records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return records.map((record) => fromDraftRecord(record));
    },

    async listByGame(gameId) {
      const records = await db.drafts.where('gameId').equals(gameId).toArray();
      records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return records.map((record) => fromDraftRecord(record));
    },
  };
}
