import type { GameId, PlayerId, RuleSetId } from './ids';
import type { ConfigOverride } from '@/rules/schema/ruleSet';

/**
 * A tournament: a series of Canasta games played by the same people.
 *
 * The one rule this model is built around is that a tournament *organises*
 * games; it never scores them. Everything about how a hand is scored, what a
 * round means and when a game is over stays where it already lives — in the
 * rule set, the engine and `Game`. A tournament decides who sits at which
 * table, and reads the results back afterwards.
 *
 * Nothing derivable is stored. The pairing history, the standings and whether
 * a round is finished are all computed from the matches and the games they
 * point at, so there is no second copy of the truth to drift.
 */

export type TournamentId = string;
export type ParticipantId = string;
export type TournamentDayId = string;
export type TournamentRoundId = string;
export type TournamentMatchId = string;
export type TournamentTableId = string;

/**
 * Whether the schedule is known in advance.
 *
 * `fixed` plans its days and rounds up front. `open` decides after every round
 * whether to play another, close the day, or finish — so neither number can be
 * known when the tournament starts.
 */
export type TournamentMode = 'fixed' | 'open';

/** What a place in the standings is worth. */
export type TournamentScoringMode = 'canasta-score' | 'tournament-points';

/** What happens to whoever is left over when the tables are full. */
export type OddParticipantMode = 'extra-player-at-table' | 'bye';

export type TournamentStatus = 'upcoming' | 'active' | 'finished';

export interface TournamentSettings {
  mode: TournamentMode;
  scoringMode: TournamentScoringMode;
  /** Whether a drawn game is a result in its own right, worth a point each. */
  drawAllowed: boolean;
  oddParticipantMode: OddParticipantMode;
  manualPairingAllowed: boolean;
  /** `fixed` only: how many days are planned. */
  plannedDays?: number;
  /** `fixed` only: how many rounds each planned day holds. */
  plannedRoundsPerDay?: number;
}

/**
 * How the games at the tables are played.
 *
 * A reference to a rule set plus the house rules on top of it — exactly what
 * the new-game wizard collects. Every game is then created through the ordinary
 * game service, which freezes its own snapshot, so a game played on day one
 * stays reproducible whatever happens to the rule set afterwards.
 */
export interface TournamentGameSettings {
  ruleSetId: RuleSetId;
  ruleSetOrigin: 'builtin' | 'custom';
  /** For display, so a list does not have to resolve the rule set. */
  ruleSetName: string;
  /** How many participants sit at one table. */
  participantsPerMatch: number;
  /** How many sides play against each other there. */
  teamsPerMatch: number;
  overrides: ConfigOverride[];
}

export type ParticipantKind = 'player' | 'team';
export type ParticipantStatus = 'active' | 'withdrawn';

/**
 * Someone who plays: a single player, or a team that stays together all
 * tournament long.
 *
 * A team is one participant, not two. That is what keeps a permanent team
 * indivisible everywhere downstream — the pairing engine, the standings and
 * the history all see one entry.
 */
export interface TournamentParticipant {
  id: ParticipantId;
  kind: ParticipantKind;
  name: string;
  /** For a team: who is in it, in seating order. A player has one entry. */
  memberNames: string[];
  /** Kept when the tournament was built from an existing game's players. */
  playerIds?: PlayerId[];
  status: ParticipantStatus;
}

export type TournamentDayStatus = 'planned' | 'active' | 'finished';

export interface TournamentDay {
  id: TournamentDayId;
  sequence: number;
  status: TournamentDayStatus;
  /** Set when the day actually started; a planned day has none. */
  date?: string;
}

/**
 * A round's life: planned while its pairing is still a proposal, confirmed once
 * the tables are fixed, completed when every game at them is finished.
 */
export type TournamentRoundStatus = 'planned' | 'confirmed' | 'completed';

export interface TournamentRound {
  id: TournamentRoundId;
  dayId: TournamentDayId;
  /** Position in the tournament as a whole, 1..N. */
  sequence: number;
  status: TournamentRoundStatus;
  matches: TournamentMatch[];
  confirmedAt?: string;
  completedAt?: string;
}

/**
 * One table in a round.
 *
 * `kind: 'bye'` is a participant sitting this round out by the tournament's own
 * arrangement. It is deliberately not the same as a participant who simply did
 * not turn up: a bye has a table entry, an absence has none at all, and the
 * standings can tell them apart.
 */
export type TournamentMatchKind = 'game' | 'bye';

export interface TournamentMatch {
  id: TournamentMatchId;
  tableNumber: number;
  /**
   * The physical table this round is played at.
   *
   * Optional because a tournament created before physical tables existed has
   * none, and because a bye is played at no table at all. Where it is set it is
   * the stable identity: `tableNumber` is a label that can be renumbered, this
   * is what a device is paired to.
   */
  tableId?: TournamentTableId;
  kind: TournamentMatchKind;
  /**
   * Who sits there, in seat order. Side `i` of the game is made of the
   * participants at seats `i`, `i + teamsPerMatch`, … — the same round-robin
   * seating the new-game wizard uses, so partners sit opposite each other.
   */
  participantIds: ParticipantId[];
  /** Set when the game behind this table has been created. */
  gameId?: GameId;
  /**
   * Bumped on every change to this match, for optimistic concurrency.
   *
   * A device submitting a result states the revision it was looking at; a
   * server that has moved on rejects it rather than overwriting a newer
   * decision. Absent means "never changed since it was created".
   */
  revision?: number;
}

/**
 * A physical table in the room.
 *
 * Deliberately not the same thing as a match. A match is one round's assignment
 * and changes every round; the table is the furniture, and the device standing
 * on it keeps the same identity all tournament long. That is what lets a QR
 * code be printed once and stay valid.
 */
export interface TournamentTable {
  id: TournamentTableId;
  /** What the table is called in the room: 1, 2, 3 … */
  number: number;
  /** An optional human name, e.g. "bij het raam". */
  name?: string;
  /** A table taken out of use keeps its history but gets no new matches. */
  active: boolean;
}

export interface Tournament {
  id: TournamentId;
  name: string;
  status: TournamentStatus;
  settings: TournamentSettings;
  gameSettings: TournamentGameSettings;
  participants: TournamentParticipant[];
  days: TournamentDay[];
  rounds: TournamentRound[];
  /**
   * The physical tables of this tournament.
   *
   * Optional: a tournament played on one device never needs them, and every
   * tournament created before multi-device has none.
   */
  tables?: TournamentTable[];
  /**
   * Bumped on every administrative change, for optimistic concurrency.
   *
   * Covers the tournament and round lifecycle; a match carries its own so two
   * tables finishing at once do not reject one another.
   */
  revision?: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
}

/* ------------------------------------------------------------- navigation */

/** The round being played, or the one waiting to be started. */
export function currentRound(tournament: Tournament): TournamentRound | undefined {
  return (
    tournament.rounds.find((round) => round.status === 'confirmed') ??
    tournament.rounds.find((round) => round.status === 'planned') ??
    tournament.rounds.at(-1)
  );
}

export function currentDay(tournament: Tournament): TournamentDay | undefined {
  return (
    tournament.days.find((day) => day.status === 'active') ??
    tournament.days.find((day) => day.status === 'planned') ??
    tournament.days.at(-1)
  );
}

export function roundsOfDay(tournament: Tournament, dayId: TournamentDayId): TournamentRound[] {
  return tournament.rounds.filter((round) => round.dayId === dayId);
}

/**
 * Whether a level game still has to be decided before the tournament can use it.
 *
 * The game engine only lets a game *finish* level when its own rule set says a
 * level game is a shared win; every built-in instead plays another round until
 * somebody leads, so with those a tie never reaches a tournament at all. When
 * it does, the rule set has declared that both sides won — and a tournament
 * that recognises no draw has been given no rule for what that is worth.
 *
 * So the tournament does not score it. The match sits exactly where a table
 * whose game is still being played sits: no result yet. That is a state the
 * tournament already has, which is why resolving this needed no new scoring
 * rule — only the honesty to say the match is not finished.
 */
export function tieIsUndecided(settings: TournamentSettings, tie: boolean): boolean {
  return tie && !settings.drawAllowed;
}

/** Everyone still taking part. Withdrawn participants are never paired again. */
export function activeParticipants(tournament: Tournament): TournamentParticipant[] {
  return tournament.participants.filter((participant) => participant.status === 'active');
}

/** Every round whose tables are fixed — the ones the pairing history is built from. */
export function settledRounds(tournament: Tournament): TournamentRound[] {
  return tournament.rounds.filter((round) => round.status !== 'planned');
}

/**
 * Whether the game at a table is played by individuals rather than partnerships.
 *
 * It matters for more than wording: a table of individuals can hold one player
 * more than planned, where a table of partnerships cannot — a rule set has one
 * team size, and three against two is not a shape the game can be given.
 */
export function playsIndividually(settings: TournamentGameSettings): boolean {
  return settings.participantsPerMatch === settings.teamsPerMatch;
}

/* ------------------------------------------------------- physical tables */

/** The tables of a tournament, in room order. Never undefined for a caller. */
export function tablesOf(tournament: Tournament): TournamentTable[] {
  return [...(tournament.tables ?? [])].sort((a, b) => a.number - b.number);
}

/** The tables that may still be given a match. */
export function activeTables(tournament: Tournament): TournamentTable[] {
  return tablesOf(tournament).filter((table) => table.active);
}

export function tableById(
  tournament: Tournament,
  id: TournamentTableId,
): TournamentTable | undefined {
  return tournament.tables?.find((table) => table.id === id);
}

/**
 * The match a physical table is playing in the round that is running.
 *
 * Matched on `tableId` — never on position in an array and never on the table
 * number, which is a label the organiser may change.
 */
export function matchAtTable(
  tournament: Tournament,
  tableId: TournamentTableId,
): { round: TournamentRound; match: TournamentMatch } | undefined {
  const round = currentRound(tournament);
  if (!round) return undefined;

  const match = round.matches.find((entry) => entry.tableId === tableId);
  return match ? { round, match } : undefined;
}

/** How many physical tables a round of this size needs. */
export function tablesNeeded(matches: readonly { kind: TournamentMatchKind }[]): number {
  return matches.filter((match) => match.kind === 'game').length;
}

export function revisionOf(tournament: Tournament): number {
  return tournament.revision ?? 0;
}

export function matchRevision(match: TournamentMatch): number {
  return match.revision ?? 0;
}
