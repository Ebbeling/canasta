import type { Json, RuleModuleId } from '@/domain/ids';
import type { ValidationIssue } from '@/domain/result';
import type { ScoreLine } from '@/domain/score';
import type { RuleSet } from '@/rules/schema/ruleSet';
import type { RuleSetConfiguration } from '@/rules/schema/configuration';
import type { EvalContext } from '@/scoring/context';

/**
 * The escape hatch for rules that genuinely do not fit the expression AST.
 *
 * Why this is not variant if/else:
 *  - the registry is keyed by module id, never by variant or family; nothing in
 *    the engine may read `ruleSet.family` (enforced by eslint);
 *  - modules are selected *by the data* — a JSON string inside a rule set — so a
 *    custom rule set cloned from Classic can reference a Modern American module,
 *    which a switch on variant could never allow;
 *  - adding a variant is additive: a new JSON file plus, at most, a new module
 *    and one `register()` call. No existing file gains a branch.
 */
export interface RuleModule {
  readonly id: RuleModuleId;
  /** Stamped into breakdowns so a behaviour change is traceable. */
  readonly version: number;
  readonly description: string;

  /** Backs `{ op: 'module' }` inside a compute expression. */
  computeNumber?(ctx: EvalContext, params?: Json): number;
  /** Backs `{ op: 'moduleBool' }` inside a condition. */
  computeBoolean?(ctx: EvalContext, params?: Json): boolean;
  /** Extra audit lines no single rule can produce. */
  emitLines?(ctx: EvalContext, params?: Json): ScoreLine[];
  /** Backs `RoundRuleDefinition` with `kind: 'module'`. */
  validateRound?(ctx: EvalContext, params?: Json): ValidationIssue[];
  /** Backs `ConstraintDefinition` with `kind: 'module'`. */
  validateConfiguration?(
    ruleSet: RuleSet,
    configuration: RuleSetConfiguration,
    params?: Json,
  ): ValidationIssue[];
}

export interface RuleModuleRegistry {
  register(module: RuleModule): void;
  get(id: RuleModuleId): RuleModule;
  has(id: RuleModuleId): boolean;
  list(): readonly RuleModule[];
}
