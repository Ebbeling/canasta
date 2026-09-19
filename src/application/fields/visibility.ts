import type { BoolExpr } from '@/rules/schema/expression';
import type { RuleSet } from '@/rules/schema/ruleSet';
import type { RuleModuleRegistry } from '@/rules/registry/ruleModule';
import { staticContext } from '@/scoring/context';
import { evalBool } from '@/scoring/evaluate';

/**
 * Evaluates a `visibleWhen` condition.
 *
 * Visibility is **static per rule set**: `validateRuleSet` checks field and
 * setting conditions in round scope, so an expression that reads a team's input
 * fails at build time. A condition can therefore only read configuration and
 * capabilities, which means this runs once per rule set rather than on every
 * keystroke.
 *
 * Fails open. A wrongly hidden field silently feeds its default into a scoring
 * rule; a wrongly shown field is merely noise.
 */
export function isVisible(
  ruleSet: RuleSet,
  condition: BoolExpr | undefined,
  modules?: RuleModuleRegistry,
): boolean {
  if (!condition) return true;
  try {
    return evalBool(condition, staticContext(ruleSet, modules));
  } catch {
    return true;
  }
}
