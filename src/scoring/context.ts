import type { FieldId, TeamId } from '@/domain/ids';
import type { ValidationIssue } from '@/domain/result';
import type { TeamRoundInput } from '@/domain/round';
import type { RuleSet } from '@/rules/schema/ruleSet';
import type { RuleSetConfiguration } from '@/rules/schema/configuration';
import type { Capabilities } from '@/rules/schema/ruleSet';
import type { ScoreInputValue } from '@/rules/schema/field';
import { isCanonicalField } from '@/rules/schema/field';
import type { RuleModuleRegistry } from '@/rules/registry/ruleModule';
import { createRuleModuleRegistry } from '@/rules/registry/moduleRegistry';
import { DEFAULT_RULE_MODULES } from '@/rules/registry/modules';

/** Everything an expression can see. Built once per round, narrowed per team. */
export interface EvalContext {
  ruleSet: RuleSet;
  config: RuleSetConfiguration;
  capabilities: Capabilities;
  modules: RuleModuleRegistry;
  round: {
    number: number;
    teamIds: readonly TeamId[];
    inputsByTeam: ReadonlyMap<TeamId, TeamRoundInput>;
  };
  standings: {
    scoreBefore: Readonly<Record<TeamId, number>>;
  };
  /** Absent in round scope; team-scoped operations then throw `EvalScopeError`. */
  team?: { id: TeamId; input: TeamRoundInput };
  /** Collects non-fatal findings, e.g. a clamped out-of-range count. */
  issues: ValidationIssue[];
}

/**
 * Reads a field from a team's input: the canonical catalogue first, then the
 * variant-specific `extra` bag. Callers never need to know which is which.
 */
export function readField(input: TeamRoundInput, field: FieldId): ScoreInputValue | undefined {
  if (isCanonicalField(field)) {
    return input[field];
  }
  return input.extra[field];
}

/**
 * A context with no round and no team input.
 *
 * Used to evaluate expressions that may only read configuration and
 * capabilities: a field's or setting's `visibleWhen`, and a configuration
 * constraint. An expression that reaches for a team's input throws
 * `EvalScopeError` here, which is the intended failure rather than a silent 0.
 */
export function staticContext(ruleSet: RuleSet, modules?: RuleModuleRegistry): EvalContext {
  return {
    ruleSet,
    config: ruleSet.configuration,
    capabilities: ruleSet.capabilities,
    modules: modules ?? createRuleModuleRegistry(DEFAULT_RULE_MODULES),
    round: { number: 0, teamIds: [], inputsByTeam: new Map() },
    standings: { scoreBefore: {} },
    issues: [],
  };
}

export function withTeam(ctx: EvalContext, teamId: TeamId): EvalContext {
  const input = ctx.round.inputsByTeam.get(teamId);
  if (!input) {
    throw new Error(`Geen invoer gevonden voor team '${teamId}' in deze ronde.`);
  }
  return { ...ctx, team: { id: teamId, input } };
}
