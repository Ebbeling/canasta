/**
 * Recursively freezes an object graph.
 *
 * A generic object utility, deliberately kept out of the rules layer so the
 * storage mapper can hand back an immutable rule-set snapshot without importing
 * anything that knows about Canasta.
 */
export function deepFreeze<T>(value: T): Readonly<T> {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}
