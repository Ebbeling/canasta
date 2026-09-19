import type { TeamId } from '@/domain/ids';
import type { RoundComputation, TeamRoundScore } from '@/domain/round';
import { initialMeldRequirement } from '@/rules/initialMeld/thresholds';
import { buildContext, scoreTeamRound, ENGINE_VERSION, type BuildContextArgs } from './scoreEngine';
import { validateRoundWithContext } from './validateRound';

/**
 * `evaluateRound` — combines scoring, validation and the standings delta for one
 * round (spec §14.1). It is the only function the application layer calls per
 * round; `calculateRoundScore` and `validateRound` stay separately testable.
 */
export function evaluateRound(args: BuildContextArgs): RoundComputation {
  const ctx = buildContext(args);

  const scores: TeamRoundScore[] = args.teamIds.map((teamId) => {
    const breakdown = scoreTeamRound(ctx, teamId);
    return { teamId, breakdown, total: breakdown.total };
  });

  const issues = validateRoundWithContext(ctx);

  const scoreAfter: Record<TeamId, number> = {};
  const requirement: Record<TeamId, number | null> = {};

  for (const teamId of args.teamIds) {
    const before = args.scoreBefore[teamId] ?? 0;
    const delta = scores.find((score) => score.teamId === teamId)?.total ?? 0;
    scoreAfter[teamId] = before + delta;
    requirement[teamId] = initialMeldRequirement(ctx.config, before)?.required ?? null;
  }

  return {
    scores,
    // Round-scope issues from validation, plus anything the evaluator flagged
    // that is not attached to a single team.
    issues: [...issues, ...ctx.issues.filter((issue) => issue.teamId === undefined)],
    scoreBefore: { ...args.scoreBefore },
    scoreAfter,
    initialMeldRequirement: requirement,
    computedAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
  };
}
