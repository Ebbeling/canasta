import type { RuleSetId } from '@/domain/ids';
import type { RuleSet } from '@/rules/schema/ruleSet';
import { deepFreeze } from '@/rules/expression/paths';
import { classic } from './classic';
import { modernAmerican } from './modernAmerican';
import { twoHanded } from './twoHanded';

/**
 * Built-in rule sets live in code, not in the presets table. That makes "de
 * ingebouwde standaardregelsets mogen niet overschreven worden" (spec §12)
 * structurally true instead of a flag someone can flip.
 *
 * They are deep-frozen, so a clone that accidentally mutated its source would
 * throw in strict mode rather than corrupt every future game.
 */
export const BUILTIN_RULE_SETS: ReadonlyMap<RuleSetId, RuleSet> = new Map(
  [classic, modernAmerican, twoHanded].map((ruleSet) => [
    ruleSet.id,
    deepFreeze(ruleSet) as RuleSet,
  ]),
);

export function getBuiltinRuleSet(id: RuleSetId): RuleSet | undefined {
  return BUILTIN_RULE_SETS.get(id);
}

export { classic, modernAmerican, twoHanded };
