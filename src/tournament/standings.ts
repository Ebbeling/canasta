import type { GameId } from '@/domain/ids';
import type {
  ParticipantId,
  Tournament,
  TournamentMatchId,
  TournamentScoringMode,
} from '@/domain/tournament';
import { sidesOf } from './history';

/**
 * The standings, projected from the games that have been played.
 *
 * Nothing here is stored. A standing is a reading of the matches and their
 * games, so correcting a round in the game history moves the tournament table
 * with it — the same relationship a game's scoreboard has with its rounds.
 *
 * This layer never scores a hand. It is handed what each game came out at and
 * turns that into positions.
 */

/** Win, draw and loss in tournament points. Fixed by the specification. */
export const POINTS_FOR_WIN = 2;
export const POINTS_FOR_DRAW = 1;
export const POINTS_FOR_LOSS = 0;

/** What one finished game came out at, in the tournament's own terms. */
export interface MatchOutcome {
  matchId: TournamentMatchId;
  gameId: GameId;
  /** Final score per participant at that table. */
  scoreByParticipant: Record<ParticipantId, number>;
  /** More than one under a shared win. */
  winnerParticipantIds: ParticipantId[];
  /** True when the game itself ended level. */
  tie: boolean;
}

export type ParticipationKind = 'played' | 'bye' | 'missed';

export interface ParticipantStanding {
  participantId: ParticipantId;
  rank: number;
  /** The figure the standings are ordered by, in the chosen mode. */
  points: number;
  /** Total Canasta score across every finished game. */
  canastaScore: number;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  byes: number;
  /** Settled rounds the participant took no part in at all. */
  missed: number;
}

export interface TournamentStandings {
  mode: TournamentScoringMode;
  entries: ParticipantStanding[];
  /** Settled rounds the standings were built from. */
  rounds: number;
  /** True when at least one table of a settled round has no result yet. */
  provisional: boolean;
  /**
   * Games that ended in a shared win while the tournament recognises no draw.
   *
   * Left unresolved on purpose, and reported rather than decided. A tournament
   * may not overrule a game: the game already says both sides won, so both are
   * counted as winners here. What a tournament without draws *ought* to do with
   * that has never been specified, and inventing an answer would be a rule
   * nobody agreed to.
   */
  unresolvedTies: TournamentMatchId[];
}

function blank(participantId: ParticipantId): ParticipantStanding {
  return {
    participantId,
    rank: 1,
    points: 0,
    canastaScore: 0,
    matchesPlayed: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    byes: 0,
    missed: 0,
  };
}

/**
 * Builds the table.
 *
 * `outcomes` holds only the games that have finished; a table still being
 * played simply contributes nothing yet, and the standings say so.
 */
export function buildStandings(
  tournament: Tournament,
  outcomes: readonly MatchOutcome[],
): TournamentStandings {
  const mode = tournament.settings.scoringMode;
  const drawAllowed = tournament.settings.drawAllowed;
  const byMatch = new Map(outcomes.map((outcome) => [outcome.matchId, outcome]));

  const table = new Map<ParticipantId, ParticipantStanding>(
    tournament.participants.map((participant) => [participant.id, blank(participant.id)]),
  );

  const settled = tournament.rounds.filter((round) => round.status !== 'planned');
  const unresolvedTies: TournamentMatchId[] = [];
  let provisional = false;

  for (const round of settled) {
    const seated = new Set<ParticipantId>();

    for (const match of round.matches) {
      for (const id of match.participantIds) seated.add(id);

      if (match.kind === 'bye') {
        const entry = table.get(match.participantIds[0] ?? '');
        if (entry) entry.byes += 1;
        continue;
      }

      const outcome = byMatch.get(match.id);
      if (!outcome) {
        provisional = true;
        continue;
      }

      const winners = new Set(outcome.winnerParticipantIds);
      // A shared win is only a draw when the tournament recognises one.
      const isDraw = outcome.tie && winners.size > 1;
      if (isDraw && !drawAllowed) unresolvedTies.push(match.id);

      for (const id of match.participantIds) {
        const entry = table.get(id);
        if (!entry) continue;

        entry.matchesPlayed += 1;
        entry.canastaScore += outcome.scoreByParticipant[id] ?? 0;

        if (isDraw && drawAllowed) {
          entry.draws += 1;
          entry.points += mode === 'tournament-points' ? POINTS_FOR_DRAW : 0;
        } else if (winners.has(id)) {
          entry.wins += 1;
          entry.points += mode === 'tournament-points' ? POINTS_FOR_WIN : 0;
        } else {
          entry.losses += 1;
          entry.points += mode === 'tournament-points' ? POINTS_FOR_LOSS : 0;
        }
      }
    }

    // Taking no part in a settled round is not a bye and earns nothing. It is
    // counted so the standings can say why somebody has fewer games.
    for (const participant of tournament.participants) {
      if (!seated.has(participant.id)) {
        const entry = table.get(participant.id);
        if (entry) entry.missed += 1;
      }
    }
  }

  if (mode === 'canasta-score') {
    for (const entry of table.values()) entry.points = entry.canastaScore;
  }

  const entries = [...table.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    // A second reading of the same result, never a new rule: with equal points
    // the Canasta score is what the games themselves produced.
    if (b.canastaScore !== a.canastaScore) return b.canastaScore - a.canastaScore;
    return 0;
  });

  // Equal figures share a position; the next one skips, as a table should.
  let rank = 0;
  let previous: ParticipantStanding | undefined;
  entries.forEach((entry, index) => {
    if (!previous || entry.points !== previous.points || entry.canastaScore !== previous.canastaScore) {
      rank = index + 1;
    }
    entry.rank = rank;
    previous = entry;
  });

  return { mode, entries, rounds: settled.length, provisional, unresolvedTies };
}

/**
 * How a participant took part in one round.
 *
 * Used by the participants screen, which has to tell a bye from an absence.
 */
export function participationIn(
  tournament: Tournament,
  participantId: ParticipantId,
): Map<string, ParticipationKind> {
  const byRound = new Map<string, ParticipationKind>();

  for (const round of tournament.rounds) {
    if (round.status === 'planned') continue;
    const match = round.matches.find((entry) => entry.participantIds.includes(participantId));
    byRound.set(round.id, !match ? 'missed' : match.kind === 'bye' ? 'bye' : 'played');
  }

  return byRound;
}

/**
 * Which participant sits on which side of a table.
 *
 * The game behind a match is built with its sides in this order, so side `i` of
 * the game answers to the participants this returns at index `i`.
 */
export function participantSides(
  participantIds: readonly ParticipantId[],
  teamsPerMatch: number,
): ParticipantId[][] {
  return sidesOf(participantIds, teamsPerMatch);
}
