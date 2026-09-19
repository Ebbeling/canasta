import type { ScoreRuleId, TeamId } from './ids';
import type { ValidationIssue } from './result';
import type { ScoreLineKind } from '@/rules/schema/scoreRule';

/** One explained line of the breakdown (spec §22, §38). */
export interface ScoreLine {
  ruleId: ScoreRuleId;
  label: string;
  kind: ScoreLineKind;
  /** Already signed: penalties are negative. */
  value: number;
  /** Resolved sub-values for the tap-to-explain panel. */
  detail?: Record<string, number>;
  /** Rendered `explainTemplate`, if the rule has one. */
  explain?: string;
}

export interface ScoreBreakdown {
  teamId: TeamId;
  lines: ScoreLine[];
  total: number;
  subtotals: { cards: number; bonus: number; penalty: number };
  /** Issues raised while scoring, e.g. an out-of-range count that was clamped. */
  issues: ValidationIssue[];
}

export function emptyBreakdown(teamId: TeamId): ScoreBreakdown {
  return {
    teamId,
    lines: [],
    total: 0,
    subtotals: { cards: 0, bonus: 0, penalty: 0 },
    issues: [],
  };
}
