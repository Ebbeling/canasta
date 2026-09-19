import type { ValidationIssue } from '@/domain/result';
import { hasErrors } from '@/domain/result';
import type { ConfigOverride, RuleSet } from '@/rules/schema/ruleSet';
import { applyOverrides, freezeForGame, validateOverrides } from '@/rules/resolve/resolveRuleSet';
import { validateRuleSet } from '@/rules/validation/validateRuleSet';
import { getPath } from '@/rules/expression/paths';

/**
 * The one configuration pipeline.
 *
 *   overrides
 *     → validateOverrides()     do these paths exist?
 *     → applyOverrides()        resolve the effective rule set
 *     → validateRuleSet()       is the result still coherent?
 *     → freezeForGame()         snapshot, immutable
 *
 * Both the deviations entered during game setup and — later — the full preset
 * editor go through this function. Nothing may write rule-set properties
 * straight into a game, because that would skip validation and let an incoherent
 * configuration reach the card table.
 *
 * Pure: no storage, no clock.
 */

export interface EffectiveRuleSetResult {
  /** The frozen snapshot to store on the game. Absent when there are errors. */
  ruleSet?: Readonly<RuleSet>;
  /** The resolved, unfrozen rule set — for previewing before committing. */
  resolved?: RuleSet;
  issues: ValidationIssue[];
  ok: boolean;
}

export function buildEffectiveRuleSet(
  base: RuleSet,
  overrides: readonly ConfigOverride[] = [],
): EffectiveRuleSetResult {
  const issues: ValidationIssue[] = [];

  // 1. Do the overridden paths exist at all?
  issues.push(...validateOverrides(base, overrides));
  if (hasErrors(issues)) return { issues, ok: false };

  // 2. Resolve.
  const resolved = overrides.length > 0 ? applyOverrides(base, overrides) : base;

  // 3. Is the result still a coherent rule set? This runs the rule set's own
  //    constraints, so a house rule that breaks the game is caught here rather
  //    than mid-round.
  issues.push(...validateRuleSet(resolved));
  if (hasErrors(issues)) return { resolved, issues, ok: false };

  // 4. Freeze.
  return { ruleSet: freezeForGame(resolved), resolved, issues, ok: true };
}

/**
 * The overrides that actually deviate from the base.
 *
 * Setting a value back to its original is not a house rule, and should not show
 * up in the "· 2 huisregels" badge.
 */
export function meaningfulOverrides(
  base: RuleSet,
  overrides: readonly ConfigOverride[],
): ConfigOverride[] {
  return overrides.filter(
    (override) => !Object.is(getPath(base.configuration, override.path), override.value),
  );
}
