import type { GameObjective } from '@/domain/game';
import type { RuleSet } from '@/rules/schema/ruleSet';
import { formatPoints, pluralise } from '@/application/labels/format';

/**
 * How a game's objective is put into words (spec §9, §10).
 *
 * A game either plays towards a target score or plays an agreed number of
 * rounds. Both are ways of answering "when is this over, and who won", so both
 * are described here rather than in the screens — a component may not read a
 * configuration, and must not be the place where "doel 5.000 punten" turns
 * into "ronde 3 van 10".
 */

/** Where the game is, which decides whether a round count is a count or a total. */
export type ObjectivePhase = 'running' | 'tieBreak' | 'finished';

export interface ObjectiveVM {
  kind: GameObjective['kind'];
  /** The term beside the figure: "Doel", "Ronde", "Rondes". */
  term: string;
  /** The figure itself: "5.000", "3 van 10". */
  valueText: string;
  /** The same fact as a phrase: "doel 5.000 punten", "10 rondes". */
  inline: string;
  /** How the winner is decided, in one sentence. */
  winnerLine: string;
}

export function describeObjective(objective: GameObjective, phase: ObjectivePhase): ObjectiveVM {
  if (objective.kind === 'plannedRounds') {
    const { plannedRounds, roundsPlayed } = objective;
    // While the game runs, the interesting round is the one being played; once
    // it is over, the interesting number is how many were played in total.
    const running = phase === 'running';
    const current = running ? Math.min(roundsPlayed + 1, plannedRounds) : roundsPlayed;

    return {
      kind: 'plannedRounds',
      term: running ? 'Ronde' : 'Rondes',
      valueText: `${formatPoints(current)} van ${formatPoints(plannedRounds)}`,
      inline: pluralise(plannedRounds, 'ronde', 'rondes'),
      winnerLine: 'De hoogste totaalscore over alle rondes wint.',
    };
  }

  return {
    kind: 'targetScore',
    term: 'Doel',
    valueText: formatPoints(objective.targetScore),
    inline: `doel ${formatPoints(objective.targetScore)} punten`,
    winnerLine: 'De eerste die de doelscore haalt en bovenaan staat wint.',
  };
}

export interface ObjectiveProgressVM {
  /** 0..1, clamped — a bar width, nothing more. */
  progress: number;
  remaining: number;
  remainingText: string;
  /** "Nog 1.200 tot 5.000" / "Ronde 3 van 10". */
  infoLine: string;
  /** What that bar is a bar of, for a screen reader. */
  barLabel: string;
}

/**
 * One team's progress towards the objective.
 *
 * A target score is a race each team runs separately; a round count is the
 * same for everybody, so every team's bar then shows the same thing. That is
 * not a bug to be designed around: the bar means "how far along is this game",
 * and under a round count that genuinely is one number.
 */
export function objectiveProgress(objective: GameObjective, total: number): ObjectiveProgressVM {
  if (objective.kind === 'plannedRounds') {
    const { plannedRounds, roundsPlayed } = objective;
    const remaining = Math.max(plannedRounds - roundsPlayed, 0);
    const current = Math.min(roundsPlayed + 1, plannedRounds);

    return {
      progress: plannedRounds > 0 ? Math.min(Math.max(roundsPlayed / plannedRounds, 0), 1) : 0,
      remaining,
      remainingText: formatPoints(remaining),
      infoLine:
        remaining > 0
          ? `Ronde ${formatPoints(current)} van ${formatPoints(plannedRounds)}`
          : `Alle ${formatPoints(plannedRounds)} rondes gespeeld`,
      barLabel: 'voortgang door de rondes',
    };
  }

  const { targetScore } = objective;
  const remaining = Math.max(targetScore - total, 0);

  return {
    progress: targetScore > 0 ? Math.min(Math.max(total / targetScore, 0), 1) : 0,
    remaining,
    remainingText: formatPoints(remaining),
    infoLine:
      remaining > 0
        ? `Nog ${formatPoints(remaining)} tot ${formatPoints(targetScore)}`
        : `Doelscore van ${formatPoints(targetScore)} bereikt`,
    barLabel: 'voortgang naar de doelscore',
  };
}

/**
 * How one round is named. "Ronde 3", or "Ronde 3 van 10" where the rule set
 * says in advance how many there will be.
 */
export function roundLabel(ruleSet: RuleSet, roundNumber: number): string {
  const { endGame } = ruleSet.configuration;
  return endGame.mode === 'plannedRounds'
    ? `Ronde ${formatPoints(roundNumber)} van ${formatPoints(endGame.plannedRounds)}`
    : `Ronde ${formatPoints(roundNumber)}`;
}
