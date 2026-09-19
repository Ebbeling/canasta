import type { Repositories } from '@/application/ports';
import { createDatabase, type CanastaDatabase } from './db';
import { createRepositories } from './index';
import { fixedClock, type Clock } from './time';

let counter = 0;

export interface TestStorage {
  db: CanastaDatabase;
  repositories: Repositories;
  close(): Promise<void>;
}

/**
 * A fresh, isolated database per test. Requires `fake-indexeddb/auto` to be
 * imported first, which the storage test files do at the top.
 */
export async function createTestStorage(clock: Clock = fixedClock([])): Promise<TestStorage> {
  counter += 1;
  const db = createDatabase(`canasta-test-${counter}-${Date.now()}`);
  await db.open();

  return {
    db,
    repositories: createRepositories(db, { clock }),
    async close() {
      db.close();
      await db.delete();
    },
  };
}
