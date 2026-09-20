/** Identifiers used throughout the domain. Plain strings; uniqueness comes from `newId()`. */
export type RuleSetId = string;
export type GameId = string;
export type PlayerId = string;
export type TeamId = string;
export type RoundId = string;
export type PresetId = string;

/** Id of an input field the UI asks for. */
export type FieldId = string;
/** Id of a scoring rule, i.e. one line in the breakdown. */
export type ScoreRuleId = string;
/** Id of a rule module in the registry. */
export type RuleModuleId = string;
/** Dot path into a RuleSetConfiguration, e.g. "scoring.canastas.natural". */
export type ConfigPath = string;

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/**
 * A v4 UUID, in every context this app actually runs in.
 *
 * `crypto.randomUUID` is only available in a *secure* context. `localhost` and
 * `https` are secure; `http://192.168.1.42:8787` is not — and that is precisely
 * where a table device lives once it has scanned a QR code. So the fast path is
 * tried and the standard algorithm is used when it is missing.
 *
 * `crypto.getRandomValues` has no such restriction, which is what makes the
 * fallback a real random id rather than a weaker stand-in. Still no dependency.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // Version 4, variant 1, as RFC 4122 requires.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
