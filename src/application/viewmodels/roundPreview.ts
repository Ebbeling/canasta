import type { ScoreRuleId, TeamId } from '@/domain/ids';
import type { Team } from '@/domain/game';
import type { TeamRoundInput } from '@/domain/round';
import type { ScoreLineKind } from '@/rules/schema/scoreRule';
import type { RuleSet } from '@/rules/schema/ruleSet';
import { evaluateRound } from '@/scoring/evaluateRound';
import { SCORE_LINE_KIND_LABELS } from '@/application/labels/labels';
import { formatDelta, formatPoints } from '@/application/labels/format';
import { advisoryIssues, splitByChannel, toIssueVMs, type IssueVM } from './issues';

/**
 * The live score preview shown while a round is being entered (spec §14, §38).
 *
 * A thin presentation wrapper over `evaluateRound`. The UI shows these lines; it
 * never reconstructs them.
 */

export interface ScoreLineVM {
  ruleId: ScoreRuleId;
  label: string;
  kind: ScoreLineKind;
  kindLabel: string;
  value: number;
  valueText: string;
  /** Already prose, rendered by the engine from the rule's own template. */
  explain?: string;
}

export interface TeamPreviewVM {
  teamId: TeamId;
  name: string;
  lines: ScoreLineVM[];
  total: number;
  totalText: string;
  scoreBefore: number;
  scoreAfter: number;
  scoreAfterText: string;
  subtotals: { cards: number; bonus: number; penalty: number };
}

export interface RoundPreviewVM {
  teams: TeamPreviewVM[];
  /** How many of them have anything entered yet. */
  filledCount: number;
  /**
   * That count as a sentence. The word for a participant follows the rule
   * set — a game of partnerships has teams, a game where everyone plays for
   * themselves has players — and which of the two it is belongs here rather
   * than in a component, which may not read a configuration at all.
   */
  filledLabel: string;
  errors: IssueVM[];
  warnings: IssueVM[];
  advisories: IssueVM[];
  /** False only when there is an error. A warning never blocks. */
  canSave: boolean;
  /** True when the user must confirm past a warning before saving. */
  requiresConfirmation: boolean;
}

export interface PreviewRoundArgs {
  ruleSet: RuleSet;
  teams: readonly Team[];
  roundNumber: number;
  inputs: readonly TeamRoundInput[];
  scoreBefore: Readonly<Record<TeamId, number>>;
}

export function previewRound(args: PreviewRoundArgs): RoundPreviewVM {
  const teamIds = args.teams.map((team) => team.id);

  const computation = evaluateRound({
    ruleSet: args.ruleSet,
    teamIds,
    roundNumber: args.roundNumber,
    inputs: args.inputs,
    scoreBefore: args.scoreBefore,
  });

  const nameById = new Map(args.teams.map((team) => [team.id, team.name]));
  const participant =
    args.ruleSet.configuration.teams.mode === 'partnership' ? 'teams' : 'spelers';

  const teams: TeamPreviewVM[] = computation.scores.map((score) => {
    const before = computation.scoreBefore[score.teamId] ?? 0;
    const after = computation.scoreAfter[score.teamId] ?? before;

    return {
      teamId: score.teamId,
      name: nameById.get(score.teamId) ?? score.teamId,
      lines: score.breakdown.lines.map((line) => ({
        ruleId: line.ruleId,
        label: line.label,
        kind: line.kind,
        kindLabel: SCORE_LINE_KIND_LABELS[line.kind] ?? line.kind,
        value: line.value,
        valueText: formatDelta(line.value),
        explain: line.explain,
      })),
      total: score.total,
      totalText: formatDelta(score.total),
      scoreBefore: before,
      scoreAfter: after,
      scoreAfterText: formatPoints(after),
      subtotals: score.breakdown.subtotals,
    };
  });

  // Round-scope issues plus anything the evaluator flagged per team.
  const perTeam = computation.scores.flatMap((score) => score.breakdown.issues);
  const { errors, warnings } = splitByChannel(
    toIssueVMs([...computation.issues, ...perTeam], args.teams),
  );

  const filledCount = teams.filter((team) => team.lines.length > 0).length;

  return {
    teams,
    filledCount,
    filledLabel: `${filledCount} van ${teams.length} ${participant} ingevuld`,
    errors,
    warnings,
    advisories: advisoryIssues(args.ruleSet),
    canSave: errors.length === 0,
    requiresConfirmation: warnings.length > 0,
  };
}
