import type { ConfigPath, Json } from '@/domain/ids';

/** Reads a dot path out of a plain object. Returns undefined when absent. */
export function getPath(root: unknown, path: ConfigPath): unknown {
  const segments = path.split('.');
  let current: unknown = root;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Returns a deep copy of `root` with `path` set to `value`.
 *
 * Arrays are replaced wholesale rather than merged element-wise — overriding
 * `threes.red.valueByCount` swaps the whole table. That semantic is pinned down
 * by a test because it is exactly where a subtle bug would live.
 */
export function setPath<T>(root: T, path: ConfigPath, value: Json): T {
  const segments = path.split('.');
  const clone = structuredClone(root) as Record<string, unknown>;
  let current: Record<string, unknown> = clone;

  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i]!;
    const next = current[segment];
    if (next === null || typeof next !== 'object') {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }

  current[segments[segments.length - 1]!] = value;
  return clone as T;
}

/** True when the path exists in `root`, even if its value is null. */
export function hasPath(root: unknown, path: ConfigPath): boolean {
  const segments = path.split('.');
  let current: unknown = root;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== 'object') return false;
    if (!(segment in (current as Record<string, unknown>))) return false;
    current = (current as Record<string, unknown>)[segment];
  }
  return true;
}

/** Re-exported for the rules layer; the implementation is a generic utility. */
export { deepFreeze } from '@/domain/freeze';
