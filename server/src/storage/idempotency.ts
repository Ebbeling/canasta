import type { Clock } from '@/application/ports';
import type { Database } from './sqlite';

/**
 * Answers already given.
 *
 * A phone on a flaky WiFi retries. Without this, the second attempt at "save
 * this round" would save it twice, and the game would be scored on a hand that
 * was played once. So the first answer is kept and replayed: a retry is
 * *answered*, not re-executed.
 *
 * The key is scoped as well as random. A table's key lives under that table's
 * scope, so one device can never consume another's — deliberately, because the
 * key travels in a request body a table controls.
 */

export interface IdempotencyStore {
  /** The stored answer for this key, if the command already ran. */
  recall<T>(scope: string, key: string): T | undefined;
  remember(scope: string, key: string, response: unknown): void;
  /** Drops entries older than `maxAgeMs`; a tournament lasts a day. */
  sweep(maxAgeMs: number): number;
}

export function createIdempotencyStore(db: Database, clock: Clock): IdempotencyStore {
  return {
    recall<T>(scope: string, key: string): T | undefined {
      const row = db
        .prepare('SELECT response FROM idempotency WHERE scope = ? AND key = ?')
        .get(scope, key) as { response: string } | undefined;
      return row ? (JSON.parse(row.response) as T) : undefined;
    },

    remember(scope, key, response) {
      db.prepare(
        'INSERT OR REPLACE INTO idempotency (scope, key, created_at, response) VALUES (?, ?, ?, ?)',
      ).run(scope, key, clock.now(), JSON.stringify(response ?? null));
    },

    sweep(maxAgeMs) {
      const cutoff = new Date(Date.parse(clock.now()) - maxAgeMs).toISOString();
      const before = db.prepare('SELECT COUNT(*) AS total FROM idempotency').get() as {
        total: number;
      };
      db.prepare('DELETE FROM idempotency WHERE created_at < ?').run(cutoff);
      const after = db.prepare('SELECT COUNT(*) AS total FROM idempotency').get() as {
        total: number;
      };
      return before.total - after.total;
    },
  };
}
