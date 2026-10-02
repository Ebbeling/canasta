import type { GameId, TeamId } from '@/domain/ids';
import {
  objectiveFor,
  type Game,
  type GameObjective,
  type GameStatus,
  type Player,
  type Team,
} from '@/domain/game';
import type { Round } from '@/domain/round';
import { recomputeGame } from '@/scoring/recompute';
import { formatDelta, formatPoints, pluralise } from '@/application/labels/format';
import {
  describeObjective,
  objectiveProgress,
  roundLabel,
  type ObjectivePhase,
  type ObjectiveVM,
} from './objective';
import { toIssueVMs, type IssueVM } from './issues';

/**
 * The scoreboard, fully resolved (spec §9, §10).
 *
 * The objective, progress, what is left and the outcome are computed here so
 * React can render a bar width and switch on `outcome.kind` without ever
 * comparing a score to a threshold — or knowing that some games end on a score
 * and others on a round count.
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
  /**
   * What the leader is ahead by: the distance to the best total below the
   * lead. Nought for everyone else, and for a leader nobody is behind — a
   * game where every team is level has no lead to name. Computed here because
   * it is a fact about the standings, not something a screen should work out
   * from two numbers it happens to be rendering.
   */
  lead: number;
  leadText: string;
  /** 0..1, clamped — a bar width, nothing more. */
  progress: number;
  /** What that bar is a bar of, named for a screen reader. */
  progressLabel: string;
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
  | {
      kind: 'tieBreakRound';
      leaderTeamIds: TeamId[];
      leaderNames: string[];
      /** The whole sentence, because what makes it a tie differs per rule set. */
      headline: string;
      note: string;
    }
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
  /** What ends this game, already in words. */
  objective: ObjectiveVM;
  teams: TeamStandingVM[];
  roundCount: number;
  nextRoundNumber: number;
  /** "Ronde 3", or "Ronde 3 van 10" where the rule set plans them. */
  nextRoundLabel: string;
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

/**
 * Why a game that looks finished is not, in one sentence.
 *
 * Two teams level on a target score and two teams level after the last planned
 * round are the same situation told two different ways, so the sentence is
 * composed where the objective is known rather than in the card that shows it.
 */
function tieHeadline(names: readonly string[], objective: GameObjective): string {
  const who = names.join(' en ');
  return objective.kind === 'plannedRounds'
    ? `${who} staan na ${pluralise(objective.roundsPlayed, 'ronde', 'rondes')} precies gelijk.`
    : `${who} staan precies gelijk op ${formatPoints(objective.targetScore)} punten of meer.`;
}

export function buildScoreboard(game: Game, rounds: readonly Round[]): ScoreboardVM {
  const { rounds: computed, projection } = recomputeGame({ game, rounds });

  const phase: ObjectivePhase =
    projection.endState.kind === 'finished'
      ? 'finished'
      : projection.endState.kind === 'tieBreakRound'
        ? 'tieBreak'
        : 'running';

  // A finished game no longer carries its objective in the end state — the
  // result has replaced it — so it is rebuilt from the same rule-set reading
  // the projection used.
  const objective =
    projection.endState.kind === 'finished'
      ? objectiveFor(game.effectiveRuleSet.configuration.endGame, computed.length)
      : projection.endState.objective;

  const best = projection.standings[0]?.total ?? 0;
  const runnerUp = projection.standings.find((entry) => entry.total < best);
  const lead = runnerUp ? best - runnerUp.total : 0;
  const winnerIds = new Set(projection.result?.winnerTeamIds ?? []);
  const rankByTeam = new Map(projection.standings.map((entry) => [entry.teamId, entry.rank]));

  const teams: TeamStandingVM[] = game.teams
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((team) => {
      const total = projection.totalsByTeam[team.id] ?? 0;
      const gap = total - best;
      const towards = objectiveProgress(objective, total);

      const requirement = projection.next.initialMeldRequirement[team.id] ?? null;
      const infoLines = [
        towards.infoLine,
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
        lead: total === best ? lead : 0,
        leadText: total === best && lead > 0 ? formatDelta(lead) : '',
        progress: towards.progress,
        progressLabel: `${team.name}: ${towards.barLabel}`,
        remaining: towards.remaining,
        remainingText: towards.remainingText,
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
        headline: tieHeadline(
          namesFor(projection.endState.leaderTeamIds, game.teams),
          projection.endState.objective,
        ),
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
    objective: describeObjective(objective, phase),
    teams,
    roundCount: computed.length,
    nextRoundNumber: projection.next.roundNumber,
    nextRoundLabel: roundLabel(game.effectiveRuleSet, projection.next.roundNumber),
    outcome,
    canAddRound: projection.status === 'active',
    issues: toIssueVMs(projection.issues, game.teams),
  };
}
