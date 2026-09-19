import Dexie from 'dexie';
import {
  RecordAlreadyExistsError,
  RecordNotFoundError,
  type RoundRepository,
} from '@/application/ports';
import type { CanastaDatabase } from './db';
import { fromRoundRecord, toRoundRecord } from './records';

/**
 * Reads and writes rounds.
 *
 * `input` is stored as the source of truth; `computed` is carried along as
 * opaque data. This repository never calls the engine — recomputation is the
 * application layer's job (spec §14.1).
 */
export function createRoundRepository(db: CanastaDatabase): RoundRepository {
  return {
    async create(round) {
      const record = toRoundRecord(round);
      await db.transaction('rw', db.rounds, async () => {
        if (await db.rounds.get(record.id)) {
          throw new RecordAlreadyExistsError('rounds', record.id);
        }
        await db.rounds.add(record);
      });
      return fromRoundRecord(record);
    },

    async get(id) {
      const record = await db.rounds.get(id);
      return record ? fromRoundRecord(record) : undefined;
    },

    async update(round) {
      const record = toRoundRecord(round);
      await db.transaction('rw', db.rounds, async () => {
        if (!(await db.rounds.get(record.id))) {
          throw new RecordNotFoundError('rounds', record.id);
        }
        await db.rounds.put(record);
      });
      return fromRoundRecord(record);
    },

    async delete(id) {
      await db.rounds.delete(id);
    },

    async listByGame(gameId) {
      // The compound [gameId+roundNumber] index gives ordered reads for free.
      const records = await db.rounds
        .where('[gameId+roundNumber]')
        .between([gameId, Dexie.minKey], [gameId, Dexie.maxKey])
        .toArray();
      return records.map(fromRoundRecord);
    },

    async deleteByGame(gameId) {
      return db.rounds.where('gameId').equals(gameId).delete();
    },

    async lastRoundNumber(gameId) {
      const last = await db.rounds
        .where('[gameId+roundNumber]')
        .between([gameId, Dexie.minKey], [gameId, Dexie.maxKey])
        .last();
      return last?.roundNumber ?? 0;
    },
  };
}
