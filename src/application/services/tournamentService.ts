import { newId, type GameId } from '@/domain/ids';
import type { Game } from '@/domain/game';
import type { ValidationIssue } from '@/domain/result';
import { hasErrors } from '@/domain/result';
import {
  activeParticipants,
  currentDay,
  currentRound,
  playsIndividually,
  tieIsUndecided,
  type ParticipantId,
  type Tournament,
  type TournamentDay,
  type TournamentGameSettings,
  type TournamentId,
  type TournamentMatch,
  type TournamentParticipant,
  type TournamentRound,
  type TournamentRoundId,
  type TournamentSettings,
} from '@/domain/tournament';
import { emptyHistory, historyOf } from '@/tournament/history';
import { participantSides } from '@/tournament/standings';
import { partyOverrides, type PartyShape } from '@/application/viewmodels/setup';
import {
  proposePairing,
  validatePairing,
  type PairingProposal,
  type ProposedMatch,
} from '@/tournament/pairing';
import { buildStandings, type MatchOutcome, type TournamentStandings } from '@/tournament/standings';
import { recomputeGame } from '@/scoring/recompute';
import type {
  Clock,
  Repositories,
  TournamentListFilter,
  TournamentSummary,
} from '@/application/ports';
import type { GameService } from './gameService';

/**
 * Running a tournament.
 *
 * The service owns the lifecycle — days, rounds, tables — and nothing else. It
 * creates games through the ordinary game service and reads their results back
 * through the ordinary projection, so a tournament game is an ordinary game in
 * every respect: same rule set pipeline, same snapshot, same scoring, same
 * history screen.
 */

export interface CreateTournamentInput {
  name: string;
  settings: TournamentSettings;
  gameSettings: TournamentGameSettings;
  participants: { kind: 'player' | 'team'; name: string; memberNames: string[] }[];
}

export type CreateTournamentOutcome =
  | { ok: true; tournament: Tournament }
  | { ok: false; reason: 'validation'; issues: ValidationIssue[] }
  | { ok: false; reason: 'storage'; message: string };

export type TournamentOutcome =
  | { ok: true; tournament: Tournament }
  | { ok: false; reason: 'notFound' }
  | { ok: false; reason: 'validation'; issues: ValidationIssue[] };

export type StartMatchOutcome =
  | { ok: true; tournament: Tournament; game: Game }
  | { ok: false; reason: 'notFound' }
  | { ok: false; reason: 'validation'; issues: ValidationIssue[] };

/** A round's tables plus the games behind them, ready for a view model. */
export interface LoadedTournament {
  tournament: Tournament;
  /** Every game a table points at, by id. A missing entry means it is gone. */
  games: Map<GameId, Game>;
  standings: TournamentStandings;
}

export interface TournamentService {
  create(input: CreateTournamentInput): Promise<CreateTournamentOutcome>;
  get(id: TournamentId): Promise<Tournament | undefined>;
  load(id: TournamentId): Promise<LoadedTournament | undefined>;
  list(filter?: TournamentListFilter): Promise<TournamentSummary[]>;
  lastActive(): Promise<TournamentSummary | undefined>;
  remove(id: TournamentId): Promise<void>;
  rename(id: TournamentId, name: string): Promise<void>;

  /**
   * A first round for a tournament that has not been created yet, so the setup
   * wizard can show what the tables would look like.
   */
  previewPairing(
    input: CreateTournamentInput,
    nonce?: number,
  ): {
    participantIds: string[];
    outcome: ReturnType<typeof proposePairing>;
  };
  /** A proposal for the next round. Nothing is stored until it is confirmed. */
  propose(id: TournamentId, locked?: ProposedMatch[], nonce?: number): Promise<
    { ok: true; proposal: PairingProposal } | { ok: false; issues: ValidationIssue[] }
  >;
  /** Checks an arrangement the organiser has rearranged by hand. */
  validate(id: TournamentId, matches: ProposedMatch[]): Promise<ValidationIssue[]>;
  /** Fixes the tables of the next round and opens it. */
  confirmRound(id: TournamentId, matches: ProposedMatch[]): Promise<TournamentOutcome>;

  /**
   * Creates the game behind a table, or returns the one already there.
   *
   * `replay` deliberately ignores the game already there and makes a new one.
   */
  startMatch(id: TournamentId, matchId: string, replay?: boolean): Promise<StartMatchOutcome>;
  /**
   * Plays a table again, from the same seating.
   *
   * The table's old game is left exactly where it is, under Partijen; only the
   * match's pointer moves to the new one. This is how a level game in a
   * tournament without gelijkspel is settled: the game engine's own answer to a
   * tie it does not accept is to play more, and at tournament level that means
   * playing the table.
   */
  replayMatch(id: TournamentId, matchId: string): Promise<StartMatchOutcome>;
  /** Closes a round once every table has a finished game. */
  completeRound(id: TournamentId, roundId: TournamentRoundId): Promise<TournamentOutcome>;

  /** Opens a new playing day. */
  startDay(id: TournamentId): Promise<TournamentOutcome>;
  endDay(id: TournamentId): Promise<TournamentOutcome>;
  finish(id: TournamentId): Promise<TournamentOutcome>;

  withdraw(id: TournamentId, participantId: ParticipantId): Promise<TournamentOutcome>;
  reinstate(id: TournamentId, participantId: ParticipantId): Promise<TournamentOutcome>;
}

export interface TournamentServiceDeps {
  repositories: Repositories;
  clock: Clock;
  games: GameService;
}

/* ------------------------------------------------------------- validation */

/** What a tournament needs before it can be created. */
export function validateTournamentSetup(input: CreateTournamentInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { settings, gameSettings, participants } = input;

  if (input.name.trim().length === 0) {
    issues.push({
      code: 'tournament.name',
      severity: 'error',
      message: 'Het toernooi heeft nog geen naam.',
    });
  }

  if (participants.length < gameSettings.participantsPerMatch) {
    issues.push({
      code: 'tournament.tooFewParticipants',
      severity: 'error',
      message: `Er zijn minstens ${gameSettings.participantsPerMatch} deelnemers nodig om één tafel te vullen.`,
    });
  }

  const names = participants.map((entry) => entry.name.trim().toLowerCase()).filter(Boolean);
  if (names.length !== participants.length) {
    issues.push({
      code: 'tournament.participantName',
      severity: 'error',
      message: 'Elke deelnemer heeft een naam nodig.',
    });
  }
  if (new Set(names).size !== names.length) {
    issues.push({
      code: 'tournament.duplicateParticipant',
      severity: 'warning',
      message: 'Twee deelnemers hebben dezelfde naam. Dat mag, maar de stand wordt lastiger te lezen.',
    });
  }

  if (settings.mode === 'fixed') {
    if (!settings.plannedDays || settings.plannedDays < 1) {
      issues.push({
        code: 'tournament.plannedDays',
        severity: 'error',
        message: 'Een vast toernooi heeft minstens één speeldag.',
      });
    }
    if (!settings.plannedRoundsPerDay || settings.plannedRoundsPerDay < 1) {
      issues.push({
        code: 'tournament.plannedRounds',
        severity: 'error',
        message: 'Een vast toernooi heeft minstens één ronde per dag.',
      });
    }
  }

  // The game domain gives a rule set one team size, so a table of partnerships
  // cannot seat an extra player: three against two is not a shape a game can be
  // given. Saying so here beats discovering it when the round is generated.
  if (
    settings.oddParticipantMode === 'extra-player-at-table' &&
    !playsIndividually(gameSettings) &&
    participants.length % gameSettings.participantsPerMatch !== 0
  ) {
    issues.push({
      code: 'tournament.extraNotPossible',
      severity: 'warning',
      message:
        'Aan een tafel met vaste teams kan er niemand bijschuiven. De overgebleven deelnemers krijgen een vrije ronde.',
    });
  }

  return issues;
}

/* ------------------------------------------------------------------ helpers */

function nextSequence(items: readonly { sequence: number }[]): number {
  return items.reduce((highest, item) => Math.max(highest, item.sequence), 0) + 1;
}

/**
 * How many sides play at one table.
 *
 * Normally what the tournament was set up with. A table of individuals that has
 * taken an extra player has one side more, because everyone there plays for
 * themselves — which is also the only way a table can hold an extra at all.
 */
export function sidesAtTable(tournament: Tournament, match: TournamentMatch): number {
  const { teamsPerMatch } = tournament.gameSettings;
  return playsIndividually(tournament.gameSettings)
    ? match.participantIds.length
    : teamsPerMatch;
}

/** The party the game at one table is played with. */
export function shapeOfTable(tournament: Tournament, match: TournamentMatch): PartyShape {
  const sides = sidesAtTable(tournament, match);
  const seats = playsIndividually(tournament.gameSettings)
    ? match.participantIds.length
    : match.participantIds.reduce((count, participantId) => {
        const participant = tournament.participants.find((entry) => entry.id === participantId);
        return count + (participant?.kind === 'team' ? participant.memberNames.length || 1 : 1);
      }, 0);

  return {
    playerCount: seats,
    teamCount: sides,
    mode: seats === sides ? 'individual' : 'partnership',
  };
}

/**
 * Whether every table of a round has produced a result the tournament can use.
 *
 * A finished game is not always one of those: a game that ended level in a
 * tournament that recognises no draw has decided nothing here, and the round
 * stays open until the organiser plays that table again.
 */
export function roundIsResolved(
  round: TournamentRound,
  games: Map<GameId, Game>,
  settings: TournamentSettings,
): boolean {
  return round.matches.every((match) => {
    if (match.kind === 'bye') return true;
    if (!match.gameId) return false;

    const game = games.get(match.gameId);
    if (game?.status !== 'finished') return false;
    return !tieIsUndecided(settings, game.result?.tie ?? false);
  });
}

/** The tables of a round that ended level and still need to be played again. */
export function undecidedMatches(
  round: TournamentRound,
  games: Map<GameId, Game>,
  settings: TournamentSettings,
): TournamentMatch[] {
  return round.matches.filter((match) => {
    if (match.kind === 'bye' || !match.gameId) return false;
    const game = games.get(match.gameId);
    if (game?.status !== 'finished') return false;
    return tieIsUndecided(settings, game.result?.tie ?? false);
  });
}

/**
 * How many rounds a fixed tournament still has planned.
 *
 * `undefined` for an open tournament, which has no plan to run out of.
 */
export function roundsRemaining(tournament: Tournament): number | undefined {
  const { mode, plannedDays, plannedRoundsPerDay } = tournament.settings;
  if (mode !== 'fixed' || !plannedDays || !plannedRoundsPerDay) return undefined;
  return Math.max(plannedDays * plannedRoundsPerDay - tournament.rounds.length, 0);
}

export function createTournamentService(deps: TournamentServiceDeps): TournamentService {
  const { repositories, clock, games } = deps;

  async function loadGames(tournament: Tournament): Promise<Map<GameId, Game>> {
    const ids = tournament.rounds
      .flatMap((round) => round.matches)
      .map((match) => match.gameId)
      .filter((id): id is GameId => Boolean(id));

    const loaded = new Map<GameId, Game>();
    for (const id of [...new Set(ids)]) {
      const game = await repositories.games.get(id);
      if (game) loaded.set(id, game);
    }
    return loaded;
  }

  /**
   * What each finished table came out at, in the tournament's own terms.
   *
   * The result comes from the same projection the scoreboard uses. A tournament
   * never decides who won a game.
   */
  async function outcomesOf(
    tournament: Tournament,
    loaded: Map<GameId, Game>,
  ): Promise<MatchOutcome[]> {
    const outcomes: MatchOutcome[] = [];

    for (const round of tournament.rounds) {
      for (const match of round.matches) {
        if (match.kind === 'bye' || !match.gameId) continue;
        const game = loaded.get(match.gameId);
        if (!game || game.status !== 'finished') continue;

        const rounds = await repositories.rounds.listByGame(game.id);
        const { projection } = recomputeGame({ game, rounds });
        if (projection.endState.kind !== 'finished') continue;

        const scoreByParticipant: Record<ParticipantId, number> = {};
        const winners = new Set(projection.endState.result.winnerTeamIds);
        const winnerParticipantIds: ParticipantId[] = [];

        // Side `i` of the game answers to the participants seated on side `i`
        // of the table, which is how the game was built. A side may hold more
        // than one of them — temporary partners — and the whole side shares
        // what the side scored.
        const sides = participantSides(match.participantIds, sidesAtTable(tournament, match));
        game.teams
          .slice()
          .sort((a, b) => a.order - b.order)
          .forEach((team, index) => {
            const total = projection.totalsByTeam[team.id] ?? 0;
            for (const participantId of sides[index] ?? []) {
              scoreByParticipant[participantId] = total;
              if (winners.has(team.id)) winnerParticipantIds.push(participantId);
            }
          });

        outcomes.push({
          matchId: match.id,
          gameId: game.id,
          scoreByParticipant,
          winnerParticipantIds,
          tie: projection.endState.result.tie,
        });
      }
    }

    return outcomes;
  }

  async function save(tournament: Tournament): Promise<Tournament> {
    return repositories.tournaments.update({ ...tournament, updatedAt: clock.now() });
  }

  async function eligibleFor(tournament: Tournament): Promise<ParticipantId[]> {
    return activeParticipants(tournament).map((participant) => participant.id);
  }

  const service: TournamentService = {
    async create(input) {
      const issues = validateTournamentSetup(input);
      if (hasErrors(issues)) return { ok: false, reason: 'validation', issues };

      const timestamp = clock.now();
      const participants: TournamentParticipant[] = input.participants.map((entry) => ({
        id: newId(),
        kind: entry.kind,
        name: entry.name.trim(),
        memberNames: entry.memberNames.map((name) => name.trim()).filter(Boolean),
        status: 'active',
      }));

      const tournament: Tournament = {
        id: newId(),
        name: input.name.trim(),
        status: 'upcoming',
        settings: input.settings,
        gameSettings: input.gameSettings,
        participants,
        days: [],
        rounds: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      try {
        await repositories.transaction(['tournaments', 'meta'], async () => {
          await repositories.tournaments.create(tournament);
          await repositories.meta.set('lastActiveTournamentId', tournament.id);
        });
      } catch (error) {
        return { ok: false, reason: 'storage', message: (error as Error).message };
      }

      return { ok: true, tournament };
    },

    get(id) {
      return repositories.tournaments.get(id);
    },

    async load(id) {
      const tournament = await repositories.tournaments.get(id);
      if (!tournament) return undefined;

      const loaded = await loadGames(tournament);
      const standings = buildStandings(tournament, await outcomesOf(tournament, loaded));
      return { tournament, games: loaded, standings };
    },

    list(filter) {
      return repositories.tournaments.list(filter);
    },

    async lastActive() {
      const id = await repositories.meta.get('lastActiveTournamentId');
      const active = await repositories.tournaments.list({ status: 'active' });
      return active.find((summary) => summary.id === id) ?? active[0];
    },

    async remove(id) {
      await repositories.tournaments.delete(id);
    },

    async rename(id, name) {
      const tournament = await repositories.tournaments.get(id);
      if (!tournament) return;
      await save({ ...tournament, name: name.trim() || tournament.name });
    },

    previewPairing(input, nonce) {
      const participantIds = input.participants.map((_participant, index) => `concept-${index}`);
      return {
        participantIds,
        outcome: proposePairing({
          participantIds,
          participantsPerMatch: input.gameSettings.participantsPerMatch,
          teamsPerMatch: input.gameSettings.teamsPerMatch,
          oddParticipantMode: input.settings.oddParticipantMode,
          allowExtraAtTable: playsIndividually(input.gameSettings),
          history: emptyHistory(),
          nonce,
        }),
      };
    },

    async propose(id, locked, nonce) {
      const tournament = await repositories.tournaments.get(id);
      if (!tournament) {
        return {
          ok: false,
          issues: [
            { code: 'tournament.notFound', severity: 'error', message: 'Dit toernooi bestaat niet meer.' },
          ],
        };
      }

      return proposePairing({
        participantIds: await eligibleFor(tournament),
        participantsPerMatch: tournament.gameSettings.participantsPerMatch,
        teamsPerMatch: tournament.gameSettings.teamsPerMatch,
        oddParticipantMode: tournament.settings.oddParticipantMode,
        allowExtraAtTable: playsIndividually(tournament.gameSettings),
        history: historyOf(tournament),
        nonce,
        locked: locked?.map((match) => ({
          tableNumber: match.tableNumber,
          participantIds: match.participantIds,
        })),
      });
    },

    async validate(id, matches) {
      const tournament = await repositories.tournaments.get(id);
      if (!tournament) {
        return [
          { code: 'tournament.notFound', severity: 'error', message: 'Dit toernooi bestaat niet meer.' },
        ];
      }

      return validatePairing(matches, {
        participantIds: await eligibleFor(tournament),
        participantsPerMatch: tournament.gameSettings.participantsPerMatch,
        allowExtraAtTable: playsIndividually(tournament.gameSettings),
      });
    },

    async confirmRound(id, matches) {
      const tournament = await repositories.tournaments.get(id);
      if (!tournament) return { ok: false, reason: 'notFound' };

      const issues = validatePairing(matches, {
        participantIds: await eligibleFor(tournament),
        participantsPerMatch: tournament.gameSettings.participantsPerMatch,
        allowExtraAtTable: playsIndividually(tournament.gameSettings),
      });
      if (hasErrors(issues)) return { ok: false, reason: 'validation', issues };

      const open = tournament.rounds.find((round) => round.status === 'confirmed');
      if (open) {
        return {
          ok: false,
          reason: 'validation',
          issues: [
            {
              code: 'tournament.roundOpen',
              severity: 'error',
              message: `Ronde ${open.sequence} loopt nog. Sluit die eerst af.`,
            },
          ],
        };
      }

      const timestamp = clock.now();
      let days = tournament.days;
      let day = currentDay(tournament);

      if (!day || day.status === 'finished') {
        day = {
          id: newId(),
          sequence: nextSequence(tournament.days),
          status: 'active',
          date: timestamp,
        };
        days = [...tournament.days, day];
      } else if (day.status === 'planned') {
        day = { ...day, status: 'active', date: timestamp };
        days = tournament.days.map((entry) => (entry.id === day!.id ? day! : entry));
      }

      const round: TournamentRound = {
        id: newId(),
        dayId: day.id,
        sequence: nextSequence(tournament.rounds),
        status: 'confirmed',
        confirmedAt: timestamp,
        matches: matches.map((match) => ({
          id: newId(),
          tableNumber: match.tableNumber,
          kind: match.kind,
          participantIds: [...match.participantIds],
        })),
      };

      const saved = await save({
        ...tournament,
        status: 'active',
        startedAt: tournament.startedAt ?? timestamp,
        days,
        rounds: [...tournament.rounds, round],
      });

      return { ok: true, tournament: saved };
    },

    async startMatch(id, matchId, replay = false) {
      const tournament = await repositories.tournaments.get(id);
      if (!tournament) return { ok: false, reason: 'notFound' };

      const round = tournament.rounds.find((entry) =>
        entry.matches.some((match) => match.id === matchId),
      );
      const match = round?.matches.find((entry) => entry.id === matchId);
      if (!round || !match) return { ok: false, reason: 'notFound' };

      if (match.kind === 'bye') {
        return {
          ok: false,
          reason: 'validation',
          issues: [
            {
              code: 'tournament.byeHasNoGame',
              severity: 'error',
              message: 'Een vrije ronde heeft geen partij.',
            },
          ],
        };
      }

      // Replaying deliberately ignores the game that is already there: it stays
      // under Partijen, untouched, and the table points at the new one.
      if (match.gameId && !replay) {
        const existing = await repositories.games.get(match.gameId);
        if (existing) return { ok: true, tournament, game: existing };
      }

      const byId = new Map(tournament.participants.map((entry) => [entry.id, entry]));
      const seated = match.participantIds
        .map((participantId) => byId.get(participantId))
        .filter((entry): entry is TournamentParticipant => Boolean(entry));

      // A table of teams seats one participant per side, each bringing its own
      // members; a table of individuals seats one player per side.
      const playerNames = seated.flatMap((participant) =>
        participant.kind === 'team' && participant.memberNames.length > 0
          ? participant.memberNames
          : [participant.name],
      );

      const sides = sidesAtTable(tournament, match);
      const teamNames: string[] = [];
      const teamSeats: number[][] = Array.from({ length: sides }, () => []);

      if (seated.length === sides) {
        // One participant per side: the side is that participant, and its
        // members fill the seats in order.
        let seat = 0;
        seated.forEach((participant, index) => {
          teamNames[index] = participant.name;
          const size = participant.kind === 'team' ? participant.memberNames.length || 1 : 1;
          for (let i = 0; i < size; i += 1) teamSeats[index]!.push(seat++);
        });
      } else {
        // Several participants per side, seated round the table so partners sit
        // opposite each other — the same arrangement the wizard uses.
        seated.forEach((_participant, seat) => {
          teamSeats[seat % sides]!.push(seat);
        });
        for (let side = 0; side < sides; side += 1) {
          teamNames[side] = teamSeats[side]!
            .map((seat) => seated[seat]?.name)
            .filter(Boolean)
            .join(' & ');
        }
      }

      // The party comes from the table as it is actually seated, not from the
      // shape the tournament was set up with: a table of individuals may hold
      // one more than planned. The tournament's other house rules travel along
      // unchanged.
      const shape = shapeOfTable(tournament, match);
      const partyPaths = new Set(partyOverrides(shape).map((entry) => entry.path));
      const overrides = [
        ...partyOverrides(shape),
        ...tournament.gameSettings.overrides.filter((entry) => !partyPaths.has(entry.path)),
      ];

      const outcome = await games.create({
        ruleSetId: tournament.gameSettings.ruleSetId,
        ruleSetOrigin: tournament.gameSettings.ruleSetOrigin,
        playerNames,
        teamNames,
        teamSeats,
        overrides,
        gameName: `${tournament.name} · ronde ${round.sequence} · tafel ${match.tableNumber}${replay ? ' · opnieuw' : ''}`,
      });

      if (!outcome.ok) {
        return {
          ok: false,
          reason: 'validation',
          issues:
            outcome.reason === 'validation'
              ? outcome.issues
              : [
                  {
                    code: 'tournament.gameNotCreated',
                    severity: 'error',
                    message: 'De partij voor deze tafel kon niet worden aangemaakt.',
                  },
                ],
        };
      }

      const saved = await save({
        ...tournament,
        rounds: tournament.rounds.map((entry) =>
          entry.id !== round.id
            ? entry
            : {
                ...entry,
                matches: entry.matches.map((one) =>
                  one.id === match.id ? { ...one, gameId: outcome.game.id } : one,
                ),
              },
        ),
      });

      return { ok: true, tournament: saved, game: outcome.game };
    },

    async completeRound(id, roundId) {
      const tournament = await repositories.tournaments.get(id);
      if (!tournament) return { ok: false, reason: 'notFound' };

      const round = tournament.rounds.find((entry) => entry.id === roundId);
      if (!round) return { ok: false, reason: 'notFound' };

      const loaded = await loadGames(tournament);

      // A level game in a tournament without gelijkspel decided nothing, so the
      // round cannot be closed on it. Said separately from "not every table is
      // finished", because those tables *are* finished — they just have no
      // tournament result.
      const undecided = undecidedMatches(round, loaded, tournament.settings);
      if (undecided.length > 0) {
        return {
          ok: false,
          reason: 'validation',
          issues: undecided.map((match) => ({
            code: 'tournament.tieUndecided',
            severity: 'error' as const,
            message: `Tafel ${match.tableNumber} eindigde gelijk, en dit toernooi kent geen gelijkspel. Speel die tafel opnieuw.`,
          })),
        };
      }

      if (!roundIsResolved(round, loaded, tournament.settings)) {
        return {
          ok: false,
          reason: 'validation',
          issues: [
            {
              code: 'tournament.roundUnfinished',
              severity: 'error',
              message: 'Niet elke tafel is klaar. Rond eerst alle partijen van deze ronde af.',
            },
          ],
        };
      }

      const saved = await save({
        ...tournament,
        rounds: tournament.rounds.map((entry) =>
          entry.id === roundId
            ? { ...entry, status: 'completed' as const, completedAt: clock.now() }
            : entry,
        ),
      });

      return { ok: true, tournament: saved };
    },

    async startDay(id) {
      const tournament = await repositories.tournaments.get(id);
      if (!tournament) return { ok: false, reason: 'notFound' };

      const open = tournament.days.find((day) => day.status === 'active');
      if (open) return { ok: true, tournament };

      const day: TournamentDay = {
        id: newId(),
        sequence: nextSequence(tournament.days),
        status: 'active',
        date: clock.now(),
      };

      const saved = await save({
        ...tournament,
        status: tournament.status === 'finished' ? tournament.status : 'active',
        days: [...tournament.days, day],
      });
      return { ok: true, tournament: saved };
    },

    async endDay(id) {
      const tournament = await repositories.tournaments.get(id);
      if (!tournament) return { ok: false, reason: 'notFound' };

      const open = tournament.rounds.find((round) => round.status === 'confirmed');
      if (open) {
        return {
          ok: false,
          reason: 'validation',
          issues: [
            {
              code: 'tournament.roundOpen',
              severity: 'error',
              message: `Ronde ${open.sequence} loopt nog. Sluit die eerst af.`,
            },
          ],
        };
      }

      const saved = await save({
        ...tournament,
        days: tournament.days.map((day) =>
          day.status === 'active' ? { ...day, status: 'finished' as const } : day,
        ),
      });
      return { ok: true, tournament: saved };
    },

    async finish(id) {
      const tournament = await repositories.tournaments.get(id);
      if (!tournament) return { ok: false, reason: 'notFound' };

      const timestamp = clock.now();
      const saved = await save({
        ...tournament,
        status: 'finished',
        finishedAt: timestamp,
        days: tournament.days.map((day) =>
          day.status === 'finished' ? day : { ...day, status: 'finished' as const },
        ),
      });
      return { ok: true, tournament: saved };
    },

    async withdraw(id, participantId) {
      const tournament = await repositories.tournaments.get(id);
      if (!tournament) return { ok: false, reason: 'notFound' };

      const open = currentRound(tournament);
      if (open?.status === 'confirmed' && open.matches.some((match) => match.participantIds.includes(participantId))) {
        return {
          ok: false,
          reason: 'validation',
          issues: [
            {
              code: 'tournament.withdrawDuringRound',
              severity: 'error',
              message:
                'Deze deelnemer zit aan een tafel in de lopende ronde. Sluit de ronde eerst af.',
            },
          ],
        };
      }

      const saved = await save({
        ...tournament,
        participants: tournament.participants.map((participant) =>
          participant.id === participantId
            ? { ...participant, status: 'withdrawn' as const }
            : participant,
        ),
      });
      return { ok: true, tournament: saved };
    },

    async reinstate(id, participantId) {
      const tournament = await repositories.tournaments.get(id);
      if (!tournament) return { ok: false, reason: 'notFound' };

      const saved = await save({
        ...tournament,
        participants: tournament.participants.map((participant) =>
          participant.id === participantId
            ? { ...participant, status: 'active' as const }
            : participant,
        ),
      });
      return { ok: true, tournament: saved };
    },

    replayMatch(id, matchId) {
      return service.startMatch(id, matchId, true);
    },
  };

  return service;
}
