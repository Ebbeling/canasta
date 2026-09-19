import type { ConfigPath, Json, RuleSetId, ScoreRuleId } from '@/domain/ids';
import type { BoolExpr } from './expression';
import type { ConstraintDefinition, RoundRuleDefinition } from './constraint';
import type { FieldDefinition } from './field';
import type { RuleSetConfiguration } from './configuration';
import type { ScoreRuleDefinition } from './scoreRule';
import type { RuleStatus, SettingDefinition } from './setting';

/**
 * Which features a rule set can ever support (spec §28). Distinct from
 * configuration, which says whether a feature is currently switched on.
 * A false capability hides fields and skips rules regardless of configuration.
 */
export interface Capabilities {
  teams: boolean;
  initialMeld: boolean;
  redThrees: boolean;
  blackThrees: boolean;
  specialHands: boolean;
  wildCanastas: boolean;
  specialCanastas: boolean;
  concealedGoingOut: boolean;
  multipleCanastaTypes: boolean;
  handPenalty: boolean;
  incompleteCanastaPenalty: boolean;
  talon: boolean;
  /** Open for future variants (Samba sequences, Hand & Foot). */
  [key: string]: boolean;
}

export interface SourceMetadata {
  name: string;
  title?: string;
  url?: string;
  retrievedAt?: string;
}

/**
 * Per-path provenance (spec §17). Anything that is not plainly `verified`
 * against the primary source is recorded here and surfaced in the rules screen,
 * so an app choice is never shown as an official Canasta rule.
 */
export interface ProvenanceEntry {
  path: ConfigPath;
  status: Exclude<RuleStatus, 'verified'>;
  /** Which source filled this in, or why nothing did. */
  note: string;
  source?: SourceMetadata;
}

export interface Provenance {
  entries: ProvenanceEntry[];
  notes?: string;
}

/**
 * A scoring mode that, while its condition holds for a team, suppresses every
 * scoring rule except the ones it names.
 *
 * Modern American's special hands are the motivating case: a team that lays one
 * down scores *only* that hand, while the opponents score normally. Expressing
 * it once here keeps the suppression out of twelve individual `appliesWhen`
 * guards, where it would quietly do double duty with each rule's own condition.
 * Switching the variant to additive special hands then becomes a data change.
 */
export interface ExclusiveScoringMode {
  id: string;
  when: BoolExpr;
  only: ScoreRuleId[];
}

/** A fully resolved rule set: what the engine and the UI consume. */
export interface RuleSet {
  id: RuleSetId;
  name: string;
  description: string;
  /** Bumped whenever the rule set's data changes. */
  version: number;
  /** Contract version of the expression AST and evaluator. */
  engineVersion: number;
  origin: 'builtin' | 'custom';
  /**
   * Presentation-only label. The engine must never branch on this; see the
   * `no-restricted-syntax` rule in eslint.config.js.
   */
  family: string;
  /** True for built-ins: the repository layer refuses writes. */
  locked: boolean;
  source: SourceMetadata;
  /** Secondary sources consulted where the primary one was silent. */
  additionalSources?: SourceMetadata[];
  provenance: Provenance;

  configuration: RuleSetConfiguration;
  capabilities: Capabilities;
  fields: FieldDefinition[];
  scoringRules: ScoreRuleDefinition[];
  /** Evaluated per team, in order; the first match wins. */
  exclusiveScoringModes?: ExclusiveScoringMode[];
  settings: SettingDefinition[];
  constraints: ConstraintDefinition[];
  roundRules: RoundRuleDefinition[];

  createdAt?: string;
  updatedAt?: string;
}

/** One house-rule override: a configuration path set to a new value. */
export interface ConfigOverride {
  path: ConfigPath;
  value: Json;
}

/**
 * What is stored for a *custom* rule set (spec §11, §12).
 *
 * `derivedFrom.snapshot` is a frozen copy taken at clone time, so a custom rule
 * set never changes underneath the user when a built-in is updated in a later
 * release. The resolved form is never persisted, so no drift is possible.
 */
export interface CustomRuleSetRecord {
  id: RuleSetId;
  name: string;
  description: string;
  version: number;
  origin: 'custom';
  locked: false;
  derivedFrom: {
    ruleSetId: RuleSetId;
    version: number;
    snapshot: RuleSet;
  };
  /** `overrides.length` drives the "· 2 huisregels" badge. */
  overrides: ConfigOverride[];
  createdAt: string;
  updatedAt: string;
}
