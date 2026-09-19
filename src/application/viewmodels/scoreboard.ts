import type { GameId, TeamId } from '@/domain/ids';
import type { Game, GameStatus, Player, Team } from '@/domain/game';
import type { Round } from '@/domain/round';
import { recomputeGame } from '@/scoring/recompute';
import { formatDelta, formatPoints } from '@/application/labels/format';
import { toIssueVMs, type IssueVM } from './issues';

/**
 * The scoreboard, fully resolved (spec §9, §10).
 *
 * Target score, progress, remaining points and the outcome are computed here so
 * React can render a bar width and switch on `outcome.kind` without ever
 * comparing a score to a threshold.
 */

export interface TeamStandingVM {
  teamId: TeamId;
  name: string;
  memberNames: string[];
  total: number;
  totalText: string;
  rank: number;
  /** Signed difference against the leader; 0 for the leader itself. */
  gap: number;
  gapText: string;
  /** 0..1, clamped — a bar width, nothing more. */
  progress: number;
  remaining: number;
  remainingText: string;
  isLeader: boolean;
  isWinner: boolean;
  /**
   * Fully composed sentences about this team's position — progress towards the
   * target, the opening requirement for the next round. Composed here so the
   * scoreboard renders strings and never names a Canasta concept itself.
   */
  infoLines: string[];
  /** Per-round deltas, oldest first. */
  deltas: number[];
}

export type ScoreboardOutcome =
  | { kind: 'inProgress' }
  | { kind: 'tieBreakRound'; leaderTeamIds: TeamId[]; leaderNames: string[]; note: string }
  | {
      kind: 'won';
      winnerTeamIds: TeamId[];
      winnerNames: string[];
      decidedAfterRound: number;
      tie: boolean;
    };

export interface ScoreboardVM {
  gameId: GameId;
  gameName?: string;
  status: GameStatus;
  ruleSetName: string;
  targetScore: number;
  targetScoreText: string;
  teams: TeamStandingVM[];
  roundCount: number;
  nextRoundNumber: number;
  outcome: ScoreboardOutcome;
  /** True while a normal round may be added. */
  canAddRound: boolean;
  issues: IssueVM[];
}

function memberNames(team: Team, players: readonly Player[]): string[] {
  const byId = new Map(players.map((player) => [player.id, player.name]));
  return team.memberIds.map((id) => byId.get(id) ?? id);
}

function namesFor(teamIds: readonly TeamId[], teams: readonly Team[]): string[] {
  const byId = new Map(teams.map((team) => [team.id, team.name]));
  return teamIds.map((id) => byId.get(id) ?? id);
}

export function buildScoreboard(game: Game, rounds: readonly Round[]): ScoreboardVM {
  const { rounds: computed, projection } = recomputeGame({ game, rounds });

  const targetScore =
    projection.endState.kind === 'finished'
      ? game.effectiveRuleSet.configuration.endGame.targetScore
      : projection.endState.targetScore;

  const best = projection.standings[0]?.total ?? 0;
  const winnerIds = new Set(projection.result?.winnerTeamIds ?? []);
  const rankByTeam = new Map(projection.standings.map((entry) => [entry.teamId, entry.rank]));

  const teams: TeamStandingVM[] = game.teams
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((team) => {
      const total = projection.totalsByTeam[team.id] ?? 0;
      const gap = total - best;
      const remaining = Math.max(targetScore - total, 0);

      const requirement = projection.next.initialMeldRequirement[team.id] ?? null;
      const infoLines = [
        remaining > 0
          ? `Nog ${formatPoints(remaining)} tot ${formatPoints(targetScore)}`
          : `Doelscore van ${formatPoints(targetScore)} bereikt`,
        ...(requirement === null
          ? []
          : [`Openingsmelding volgende ronde: ${formatPoints(requirement)} punten`]),
      ];

      return {
        teamId: team.id,
        name: team.name,
        memberNames: memberNames(team, game.players),
        total,
        totalText: formatPoints(total),
        rank: rankByTeam.get(team.id) ?? 1,
        gap,
        gapText: gap === 0 ? '' : formatDelta(gap),
        progress: targetScore > 0 ? Math.min(Math.max(total / targetScore, 0), 1) : 0,
        remaining,
        remainingText: formatPoints(remaining),
        isLeader: total === best,
        isWinner: winnerIds.has(team.id),
        infoLines,
        deltas: computed.map(
          (round) => round.computed?.scores.find((score) => score.teamId === team.id)?.total ?? 0,
        ),
      };
    });

  let outcome: ScoreboardOutcome;
  switch (projection.endState.kind) {
    case 'finished':
      outcome = {
        kind: 'won',
        winnerTeamIds: projection.endState.result.winnerTeamIds,
        winnerNames: namesFor(projection.endState.result.winnerTeamIds, game.teams),
        decidedAfterRound: projection.endState.result.decidedAfterRound,
        tie: projection.endState.result.tie,
      };
      break;
    case 'tieBreakRound':
      outcome = {
        kind: 'tieBreakRound',
        leaderTeamIds: projection.endState.leaderTeamIds,
        leaderNames: namesFor(projection.endState.leaderTeamIds, game.teams),
        // An app choice, stated as one — no source describes an exact tie.
        note: 'Bij exact gelijkspel speelt deze app een extra ronde. Geen van de geraadpleegde bronnen beschrijft deze situatie.',
      };
      break;
    default:
      outcome = { kind: 'inProgress' };
  }

  return {
    gameId: game.id,
    gameName: game.name,
    status: projection.status,
    ruleSetName: game.ruleSetRef.name,
    targetScore,
    targetScoreText: formatPoints(targetScore),
    teams,
    roundCount: computed.length,
    nextRoundNumber: projection.next.roundNumber,
    outcome,
    canAddRound: projection.status === 'active',
    issues: toIssueVMs(projection.issues, game.teams),
  };
}
