import type { TeamId } from '@/domain/ids';
import type { ValidationIssue } from '@/domain/result';
import { objectiveFor, type EndState, type Game, type GameProjection } from '@/domain/game';
import { emptyTeamRoundInput, type Round } from '@/domain/round';
import type { RuleModuleRegistry } from '@/rules/registry/ruleModule';
import { evaluateRound } from './evaluateRound';
import { openingRequirement } from './openingRequirement';
import { buildContext } from './scoreEngine';

export interface RecomputeArgs {
  game: Game;
  rounds: readonly Round[];
  modules?: RuleModuleRegistry;
}

export interface RecomputeResult {
  /** The same rounds with a fresh `computed`. */
  rounds: Round[];
  projection: GameProjection;
}

/**
 * `recomputeGame` — rebuilds every derived value from the round inputs.
 *
 * This is necessarily a sequential fold: the initial-meld requirement for round
 * *n* depends on the standings before round *n*, so editing round 2 cannot be
 * patched in place — rounds 3..N must be replayed (spec §23).
 *
 * Pure: it neither mutates its arguments nor reads the clock beyond stamping
 * each computation.
 */
export function recomputeGame(args: RecomputeArgs): RecomputeResult {
  const { game } = args;
  const teamIds = game.teams.map((team) => team.id);
  const ruleSet = game.effectiveRuleSet;

  const running: Record<TeamId, number> = {};
  for (const teamId of teamIds) running[teamId] = 0;

  const ordered = [...args.rounds].sort((a, b) => a.sequence - b.sequence);
  const issues: ValidationIssue[] = [];

  const rounds = ordered.map((round, index) => {
    const computation = evaluateRound({
      ruleSet,
      teamIds,
      roundNumber: index + 1,
      inputs: round.input.teams,
      scoreBefore: { ...running },
      modules: args.modules,
    });

    for (const teamId of teamIds) {
      running[teamId] = computation.scoreAfter[teamId] ?? 0;
    }
    issues.push(...computation.issues);

    return { ...round, computed: computation };
  });

  const totalsByTeam: Record<TeamId, number> = { ...running };
  const standings = teamIds
    .map((teamId) => ({ teamId, total: totalsByTeam[teamId] ?? 0, rank: 0 }))
    .sort((a, b) => b.total - a.total);
  standings.forEach((entry, index) => {
    entry.rank =
      index === 0
        ? 1
        : standings[index - 1]!.total === entry.total
          ? standings[index - 1]!.rank
          : index + 1;
  });

  const endState = decideEndState(game, totalsByTeam, rounds.length);
  const result = endState.kind === 'finished' ? endState.result : undefined;

  // The requirement for the round nobody has played yet. It is asked of the
  // same function the played rounds went through, in a context standing one
  // round further on, so a rule set that counts rounds answers consistently
  // instead of being special-cased here.
  const nextContext = buildContext({
    ruleSet,
    teamIds,
    roundNumber: rounds.length + 1,
    inputs: teamIds.map((teamId) => emptyTeamRoundInput(teamId)),
    scoreBefore: totalsByTeam,
    modules: args.modules,
  });

  const nextRequirement: Record<TeamId, number | null> = {};
  for (const teamId of teamIds) {
    nextRequirement[teamId] = openingRequirement(nextContext, totalsByTeam[teamId] ?? 0);
  }

  const projection: GameProjection = {
    endState,
    standings,
    totalsByTeam,
    status: result ? 'finished' : 'active',
    result,
    next: {
      roundNumber: rounds.length + 1,
      initialMeldRequirement: nextRequirement,
    },
    issues,
  };

  return { rounds, projection };
}

/**
 * End-of-game evaluation (spec §14, §17.2).
 *
 * The round in progress is always played out first, so this only runs on
 * committed rounds. Two end conditions are configured rather than coded: a
 * target somebody has to pass, or an agreed number of rounds after which the
 * totals are simply compared. Both then take the same last step — highest
 * total wins — so the winner is decided in one place for every rule set.
 *
 * On an exact tie the app plays another round. That is an explicit app policy,
 * not a rule any source describes, and it applies to both conditions: a game
 * over ten rounds that ends level plays an eleventh.
 */
function decideEndState(game: Game, totals: Record<TeamId, number>, roundCount: number): EndState {
  const endGame = game.effectiveRuleSet.configuration.endGame;
  const teamIds = game.teams.map((team) => team.id);

  const objective = objectiveFor(endGame, roundCount);

  const inProgress: EndState = { kind: 'inProgress', objective };
  if (roundCount === 0) return inProgress;

  const decided =
    endGame.mode === 'plannedRounds'
      ? roundCount >= endGame.plannedRounds
      : teamIds.some((teamId) => (totals[teamId] ?? 0) >= endGame.targetScore);
  if (!decided) return inProgress;

  const best = Math.max(...teamIds.map((teamId) => totals[teamId] ?? 0));
  const leaders = teamIds.filter((teamId) => (totals[teamId] ?? 0) === best);
  const tie = leaders.length > 1;

  if (tie && endGame.winner.tie === 'play-extra-round') {
    // Deliberately not finished: another round is played to break the tie. The
    // distinct state is what lets the UI say so without re-deriving it.
    return { kind: 'tieBreakRound', leaderTeamIds: leaders, objective };
  }

  return {
    kind: 'finished',
    result: {
      winnerTeamIds: leaders,
      finalScores: { ...totals },
      decidedAfterRound: roundCount,
      tie,
    },
  };
}
