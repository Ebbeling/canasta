import { useLiveQuery } from 'dexie-react-hooks';

/**
 * The four states every screen has to handle.
 *
 * `useLiveQuery` returns `undefined` both while the first query is in flight and
 * when the query legitimately resolves to nothing, so no querier here returns a
 * bare `undefined` — the wrapper below distinguishes the two.
 */
export type AsyncState<T> =
  { status: 'loading' } | { status: 'ready'; data: T } | { status: 'missing' };

type Found<T> = { found: true; value: T } | { found: false };

/**
 * The only `useLiveQuery` call site in the app.
 *
 * Dexie tracks whichever tables the querier touches, even several layers down
 * inside a repository, so this re-renders after any relevant write — including
 * writes made in another tab.
 */
export function useLiveResult<T>(
  query: (() => Promise<T | undefined>) | null,
  deps: unknown[],
): AsyncState<T> {
  const result = useLiveQuery<Found<T> | undefined>(async () => {
    if (!query) return { found: false };
    const value = await query();
    return value === undefined ? { found: false } : { found: true, value };
  }, deps);

  if (result === undefined) return { status: 'loading' };
  return result.found ? { status: 'ready', data: result.value } : { status: 'missing' };
}
