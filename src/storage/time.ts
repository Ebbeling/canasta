import type { Clock, IsoTimestamp } from '@/application/ports';

/** The contract lives in the application layer; re-exported for existing callers. */
export type { Clock };

/**
 * Timestamp strategy, chosen once and used everywhere.
 *
 * Every timestamp is stored as an **ISO-8601 string in UTC** — never as a
 * `Date`. Reasons:
 *
 *  - the domain types already use `string`, so no mapping is needed;
 *  - ISO-8601 sorts lexicographically in the same order it sorts
 *    chronologically, so a plain IndexedDB index on `updatedAt` gives correct
 *    ordering for free;
 *  - `Date` survives structured clone, but comes back as a distinct object that
 *    compares unequal in tests and JSON-serialises differently, which would
 *    complicate the export format of step 17.
 *
 * The only place a `Date` exists is inside `now()`.
 */
export function now(): IsoTimestamp {
  return new Date().toISOString();
}

export const systemClock: Clock = { now };

/**
 * A clock that hands out the given timestamps in order and then repeats the
 * last one. With no timestamps it always returns `fallback`.
 */
export function fixedClock(
  timestamps: readonly IsoTimestamp[] = [],
  fallback: IsoTimestamp = '2026-09-19T12:00:00.000Z',
): Clock {
  let index = 0;
  return {
    now() {
      if (timestamps.length === 0) return fallback;
      const value = timestamps[Math.min(index, timestamps.length - 1)]!;
      index += 1;
      return value;
    },
  };
}
