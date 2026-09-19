import type { AppMeta, MetaRepository } from '@/application/ports';
import type { CanastaDatabase } from './db';

/**
 * Application-wide metadata: schema version, last active game, install state.
 *
 * Never used for anything to do with scoring.
 */
export function createMetaRepository(db: CanastaDatabase): MetaRepository {
  return {
    async get<K extends keyof AppMeta>(key: K) {
      const record = await db.meta.get(key);
      return record ? (record.value as AppMeta[K]) : undefined;
    },

    async set<K extends keyof AppMeta>(key: K, value: AppMeta[K]) {
      await db.meta.put({ key, value: structuredClone(value) });
    },

    async delete<K extends keyof AppMeta>(key: K) {
      await db.meta.delete(key);
    },

    async all() {
      const records = await db.meta.toArray();
      const result: Partial<AppMeta> = {};
      for (const record of records) {
        (result as Record<string, unknown>)[record.key] = record.value;
      }
      return result;
    },
  };
}
