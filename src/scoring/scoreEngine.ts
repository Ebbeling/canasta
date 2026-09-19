import type { TeamId } from '@/domain/ids';
import { formatMessage } from '@/domain/result';
import type { TeamRoundInput } from '@/domain/round';
import { emptyBreakdown, type ScoreBreakdown, type ScoreLine } from '@/domain/score';
import type { RuleSet } from '@/rules/schema/ruleSet';
import type { ScoreRuleDefinition } from '@/rules/schema/scoreRule';
import { createRuleModuleRegistry } from '@/rules/registry/moduleRegistry';
import type { RuleModuleRegistry } from '@/rules/registry/ruleModule';
import { DEFAULT_RULE_MODULES } from '@/rules/registry/modules';
import { evalBool, evalNum } from './evaluate';
import { withTeam, type EvalContext } from './context';

/** Bumped when the evaluator or engine changes in a way that can alter scores. */
export const ENGINE_VERSION = 1;

export interface BuildContextArgs {
  ruleSet: RuleSet;
  teamIds: readonly TeamId[];
  roundNumber: number;
  inputs: readonly TeamRoundInput[];
  scoreBefore: Readonly<Record<TeamId, number>>;
  modules?: RuleModuleRegistry;
}

export function buildContext(args: BuildContextArgs): EvalContext {
  const inputsByTeam = new Map<TeamId, TeamRoundInput>();
  for (const input of args.inputs) inputsByTeam.set(input.teamId, input);

  return {
    ruleSet: args.ruleSet,
    config: args.ruleSet.configuration,
    capabilities: args.ruleSet.capabilities,
    modules: args.modules ?? createRuleModuleRegistry(DEFAULT_RULE_MODULES),
    round: { number: args.roundNumber, teamIds: args.teamIds, inputsByTeam },
    standings: { scoreBefore: args.scoreBefore },
    issues: [],
  };
}

function renderExplain(
  rule: ScoreRuleDefinition,
  detail: Record<string, number> | undefined,
): string | undefined {
  if (!rule.explainTemplate) return undefined;
  return formatMessage(rule.explainTemplate, detail ?? {});
}

/**
 * Scores one team's round. Pure: it only reads the context and returns lines.
 *
 * Every rule contributes at most one line, and the line's value is already
 * signed, so the total is a plain sum (spec §22).
 */
export function scoreTeamRound(ctx: EvalContext, teamId: TeamId): ScoreBreakdown {
  const teamCtx = withTeam(ctx, teamId);
  const breakdown = emptyBreakdown(teamId);
  const collected: ScoreLine[] = [];

  const rules = [...teamCtx.ruleSet.scoringRules].sort((a, b) => a.order - b.order);

  // An exclusive mode narrows the rule list to the ones it names, so that
  // "a special hand replaces the whole score" lives in one place instead of in
  // every rule's own condition.
  const activeMode = teamCtx.ruleSet.exclusiveScoringModes?.find((mode) =>
    evalBool(mode.when, teamCtx),
  );
  const allowed = activeMode ? new Set(activeMode.only) : undefined;

  for (const rule of rules) {
    if (allowed && !allowed.has(rule.id)) continue;
    if (rule.appliesWhen && !evalBool(rule.appliesWhen, teamCtx)) continue;

    const value = evalNum(rule.compute, teamCtx);
    if (value === 0 && !rule.includeZero) continue;

    let detail: Record<string, number> | undefined;
    if (rule.detail) {
      detail = {};
      for (const [key, expr] of Object.entries(rule.detail)) {
        detail[key] = evalNum(expr, teamCtx);
      }
    }

    collected.push({
      ruleId: rule.id,
      label: rule.label,
      kind: rule.kind,
      value,
      detail,
      explain: renderExplain(rule, detail),
    });
  }

  for (const module of teamCtx.modules.list()) {
    if (!module.emitLines) continue;
    collected.push(...module.emitLines(teamCtx));
  }

  breakdown.lines = collected;
  breakdown.subtotals = {
    cards: sumKind(collected, 'cards'),
    bonus: sumKind(collected, 'bonus'),
    penalty: sumKind(collected, 'penalty'),
  };

  let total = collected.reduce((sum, line) => sum + line.value, 0);
  const floor = teamCtx.config.penalties.minimumRoundScore;
  if (floor !== null && floor !== undefined) total = Math.max(total, floor);
  breakdown.total = total;

  // Issues raised while evaluating this team's expressions.
  breakdown.issues = teamCtx.issues.filter((issue) => issue.teamId === teamId);

  return breakdown;
}

function sumKind(lines: readonly ScoreLine[], kind: ScoreLine['kind']): number {
  return lines.filter((line) => line.kind === kind).reduce((sum, line) => sum + line.value, 0);
}

/**
 * `calculateRoundScore` — points only, plus the audit trail.
 *
 * Deliberately does no validation and no end-of-game logic; those live in
 * `validateRound` and `evaluateRound` (spec §14.1).
 */
export function calculateRoundScore(args: BuildContextArgs): ScoreBreakdown[] {
  const ctx = buildContext(args);
  return args.teamIds.map((teamId) => scoreTeamRound(ctx, teamId));
}
