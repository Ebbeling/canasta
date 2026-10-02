import { initialMeldRequirement } from '@/rules/initialMeld/thresholds';
import { evalNum } from './evaluate';
import type { EvalContext } from './context';

/**
 * What a team must lay down to open, in the round the context describes.
 *
 * Two mechanisms, one answer. Most rule sets read the minimum off a staircase
 * indexed by the team's own total: a team on 1.600 points needs 90. A rule set
 * may instead compute it, which is the only way to express a requirement that
 * depends on something the staircase cannot see — Paul's regels asks thirty
 * points per round, so round seven needs 210 whatever the standings say.
 *
 * The formula wins where a rule set carries one. It is evaluated in round
 * scope, so it cannot read a team's input and is the same number for everybody;
 * `validateRuleSet` proves that before a game is ever started.
 */
export function openingRequirement(ctx: EvalContext, scoreBefore: number): number | null {
  const { initialMeld } = ctx.config;
  if (!initialMeld.enabled) return null;
  if (initialMeld.requirement) return evalNum(initialMeld.requirement, ctx);
  return initialMeldRequirement(ctx.config, scoreBefore)?.required ?? null;
}
