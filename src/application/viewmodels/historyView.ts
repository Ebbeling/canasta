import type { RoundId, TeamId } from '@/domain/ids';
import type { EndState, Game } from '@/domain/game';
import type { Round, TeamRoundInput } from '@/domain/round';
import { recomputeGame } from '@/scoring/recompute';
import { SCORE_LINE_KIND_LABELS } from '@/application/labels/labels';
import { formatDelta, formatDateTime, formatPoints } from '@/application/labels/format';
import { toIssueVMs, type IssueVM } from './issues';
import type { ScoreLineVM } from './roundPreview';

/** The history screen and the correction cascade preview (spec §17, §23). */

export interface RoundTeamVM {
  teamId: TeamId;
  name: string;
  delta: number;
  deltaText: string;
  runningTotal: number;
  runningTotalText: string;
  lines: ScoreLineVM[];
}

export interface RoundRowVM {
  roundId: RoundId;
  /** Position in the game, 1..N — what the engine scored it as. */
  displayNumber: number;
  /** Storage order; never renumbered when a round is deleted. */
  sequence: number;
  playedAt: string;
  note?: string;
  teams: RoundTeamVM[];
  issues: IssueVM[];
}

export interface HistoryVM {
  teams: { teamId: TeamId; name: string }[];
  rows: RoundRowVM[];
}

export function buildHistory(game: Game, rounds: readonly Round[]): HistoryVM {
  const { rounds: computed } = recomputeGame({ game, rounds });
  const orderedTeams = game.teams.slice().sort((a, b) => a.order - b.order);

  return {
    teams: orderedTeams.map((team) => ({ teamId: team.id, name: team.name })),
    rows: computed.map((round, index) => ({
      roundId: round.id,
      displayNumber: index + 1,
      sequence: round.sequence,
      playedAt: formatDateTime(round.createdAt),
      note: round.note,
      teams: orderedTeams.map((team) => {
        const score = round.computed?.scores.find((item) => item.teamId === team.id);
        const delta = score?.total ?? 0;
        const running = round.computed?.scoreAfter[team.id] ?? 0;

        return {
          teamId: team.id,
          name: team.name,
          delta,
          deltaText: formatDelta(delta),
          runningTotal: running,
          runningTotalText: formatPoints(running),
          lines: (score?.breakdown.lines ?? []).map((line) => ({
            ruleId: line.ruleId,
            label: line.label,
            kind: line.kind,
            kindLabel: SCORE_LINE_KIND_LABELS[line.kind] ?? line.kind,
            value: line.value,
            valueText: formatDelta(line.value),
            explain: line.explain,
          })),
        };
      }),
      issues: toIssueVMs(round.computed?.issues ?? [], game.teams),
    })),
  };
}

export interface CorrectionPreviewVM {
  /** Display numbers of the rounds whose totals move. */
  affectedRoundNumbers: number[];
  deltas: {
    teamId: TeamId;
    name: string;
    before: number;
    after: number;
    delta: number;
    deltaText: string;
    beforeText: string;
    afterText: string;
  }[];
  beforeEndState: EndState;
  afterEndState: EndState;
  /** True when the correction changes who has won, or whether anyone has. */
  changesOutcome: boolean;
}

/**
 * What a correction would do, computed by replaying the game twice.
 *
 * Pure: it touches no storage and changes nothing.
 */
export function previewCorrection(args: {
  game: Game;
  rounds: readonly Round[];
  roundId: RoundId;
  inputs: readonly TeamRoundInput[];
}): CorrectionPreviewVM {
  const current = recomputeGame({ game: args.game, rounds: args.rounds });

  const patched = args.rounds.map((round) =>
    round.id === args.roundId ? { ...round, input: { teams: [...args.inputs] } } : round,
  );
  const next = recomputeGame({ game: args.game, rounds: patched });

  const affected: number[] = [];
  next.rounds.forEach((round, index) => {
    const before = current.rounds[index];
    if (!before) return;
    const changed = args.game.teams.some(
      (team) =>
        (before.computed?.scoreAfter[team.id] ?? 0) !== (round.computed?.scoreAfter[team.id] ?? 0),
    );
    if (changed) affected.push(index + 1);
  });

  const deltas = args.game.teams
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((team) => {
      const before = current.projection.totalsByTeam[team.id] ?? 0;
      const after = next.projection.totalsByTeam[team.id] ?? 0;
      return {
        teamId: team.id,
        name: team.name,
        before,
        after,
        delta: after - before,
        deltaText: formatDelta(after - before),
        beforeText: formatPoints(before),
        afterText: formatPoints(after),
      };
    });

  const beforeEndState = current.projection.endState;
  const afterEndState = next.projection.endState;

  const winners = (state: EndState): string =>
    state.kind === 'finished' ? state.result.winnerTeamIds.slice().sort().join(',') : '';

  return {
    affectedRoundNumbers: affected,
    deltas,
    beforeEndState,
    afterEndState,
    changesOutcome:
      beforeEndState.kind !== afterEndState.kind ||
      winners(beforeEndState) !== winners(afterEndState),
  };
}
