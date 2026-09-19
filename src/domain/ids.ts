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
 * `crypto.randomUUID` exists in every browser that can run a PWA over HTTPS and
 * in Node 19+, so no uuid dependency is needed.
 */
export function newId(): string {
  return crypto.randomUUID();
}
