import type { ConfigPath } from '@/domain/ids';
import type { BoolExpr } from './expression';

/**
 * Where a rule's value comes from, and how much trust it carries (spec §17.1).
 * This exists so the app never presents its own choice as an official rule.
 */
export type RuleStatus =
  /** Confirmed literally by the primary source for this rule set. */
  | 'verified'
  /** Not stated by the primary source; filled in from a named secondary source. */
  | 'secondary-source'
  /** A choice of this app, prescribed by no source. */
  | 'app-policy'
  /** No source describes this at all. */
  | 'not-specified';

/**
 * What a rule does (spec §14.2). A score card cannot observe how many cards
 * somebody drew, so `advisory` rules never reach the score engine.
 */
export type RuleEffect =
  /** Affects the calculated score. */
  | 'computed'
  /** Decides whether input is technically or legally valid. */
  | 'validation'
  /** Displayed only; the engine cannot compute it. */
  | 'advisory';

export type SettingType =
  | 'number'
  | 'boolean'
  | 'select'
  | 'text'
  /** A numeric array indexed by count, e.g. the red-three table. */
  | 'numberTable'
  /** The initial-meld threshold bands. */
  | 'thresholds';

export type SettingCategory =
  | 'setup'
  | 'game'
  | 'scoring'
  | 'canastas'
  | 'threes'
  | 'initialMeld'
  | 'goingOut'
  | 'penalties'
  | 'specialHands'
  | 'advanced';

/**
 * Metadata that generates the settings UI (spec §10, §29).
 *
 * There is deliberately no `default` field: the default *is*
 * `configuration[key]`. Holding both is a guaranteed divergence bug.
 */
export interface SettingDefinition {
  key: ConfigPath;
  label: string;
  help?: string;
  type: SettingType;
  category: SettingCategory;
  /** False means read-only for this rule set (spec §8). */
  editable: boolean;
  effect: RuleEffect;
  status: RuleStatus;
  /** Where this value comes from, when the status is not plain `verified`. */
  statusNote?: string;
  order: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: readonly { value: string; label: string }[];
  visibleWhen?: BoolExpr;
  /** Labels per index for `numberTable`, e.g. ["geen", "1 rode 3", ...]. */
  itemLabels?: readonly string[];
}
