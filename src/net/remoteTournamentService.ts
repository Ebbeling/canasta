import type { GameId } from '@/domain/ids';
import type { Game } from '@/domain/game';
import { revisionOf, type Tournament, type TournamentId } from '@/domain/tournament';
import type { ValidationIssue } from '@/domain/result';
import type { TournamentListFilter, TournamentSummary } from '@/application/ports';
import type {
  LoadedTournament,
  TournamentOutcome,
  TournamentService,
  StartMatchOutcome,
} from '@/application/services/tournamentService';
import type { ProposedMatch } from '@/tournament/pairing';
import {
  API_PREFIX,
  type Command,
  type PairingResponse,
  type TableView,
  type TournamentState,
} from './protocol';
import { ServerError, type ServerLink } from './serverLink';

/**
 * The tournament service, talking to a server instead of to Dexie.
 *
 * Implements the very same interface the local one does, which is the whole
 * trick: every tournament screen already written against `services.tournaments`
 * works against a server without a single component changing. A round entered
 * at table 3 lands in the organiser's dashboard because the dashboard is
 * reading the same view model it always did — from a different place.
 *
 * `previewPairing` is the one method that stays local. It is a pure computation
 * about a tournament that does not exist yet, so there is nothing to ask a
 * server about.
 */

export interface RemoteTournamentDeps {
  link: ServerLink;
  /** Used for `previewPairing` only, before any tournament exists. */
  local: TournamentService;
  /** Notified whenever a call proves the server moved on. */
  onRevision?: (revision: number) => void;
}

/**
 * What went wrong, as issues the existing screens already know how to show.
 *
 * A refusal from the server has to arrive in the UI as the same shape a local
 * refusal does, or every screen would need a second error path.
 */
function asIssues(error: unknown): ValidationIssue[] {
  if (error instanceof ServerError) {
    if (error.issues?.length) {
      return error.issues.map((issue) => ({
        code: issue.code,
        severity: issue.severity as ValidationIssue['severity'],
        message: issue.message,
      }));
    }
    return [{ code: `server.${error.code}`, severity: 'error', message: error.message }];
  }

  return [
    {
      code: 'server.offline',
      severity: 'error',
      message: 'Geen verbinding met de server. Probeer het opnieuw.',
    },
  ];
}

/** Turns a thrown `ServerError` back into the outcome shape the UI expects. */
function asOutcome(error: unknown): TournamentOutcome {
  if (error instanceof ServerError && error.code === 'notFound') {
    return { ok: false, reason: 'notFound' };
  }
  return { ok: false, reason: 'validation', issues: asIssues(error) };
}

function toLoaded(state: TournamentState): LoadedTournament {
  return {
    tournament: state.tournament,
    games: new Map<GameId, Game>(state.games.map((game) => [game.id, game])),
    standings: state.standings,
  };
}

export function createRemoteTournamentService({
  link,
  local,
  onRevision,
}: RemoteTournamentDeps): TournamentService {
  /** The revision of whatever we last saw, per tournament. */
  const revisions = new Map<TournamentId, number>();

  function remember(state: TournamentState): TournamentState {
    revisions.set(state.tournament.id, state.revision);
    onRevision?.(state.revision);
    return state;
  }

  async function send(id: TournamentId, command: Command): Promise<TournamentOutcome> {
    try {
      const state = await link.post<TournamentState>(
        `${API_PREFIX}/tournaments/${id}/commands`,
        // The revision is deliberately *not* sent for ordinary verbs: the
        // organiser's own screen is the only thing issuing them, and refusing
        // one because a table just handed in a result would be noise, not
        // safety. Where a stale decision would actually matter — the round and
        // tournament lifecycle — the server checks the match revisions itself.
        { command },
      );
      remember(state);
      return { ok: true, tournament: state.tournament };
    } catch (error) {
      return asOutcome(error);
    }
  }

  async function sendForMatch(id: TournamentId, command: Command): Promise<StartMatchOutcome> {
    const outcome = await send(id, command);
    if (!outcome.ok) {
      return outcome.reason === 'notFound'
        ? { ok: false, reason: 'notFound' }
        : { ok: false, reason: 'validation', issues: outcome.issues };
    }

    const matchId = 'matchId' in command ? command.matchId : undefined;
    const match = outcome.tournament.rounds
      .flatMap((round) => round.matches)
      .find((entry) => entry.id === matchId);

    if (!match?.gameId) {
      return {
        ok: false,
        reason: 'validation',
        issues: [
          { code: 'server.noGame', severity: 'error', message: 'De partij is niet gestart.' },
        ],
      };
    }

    const state = await link.get<TournamentState>(`${API_PREFIX}/tournaments/${id}/state`);
    const game = state.games.find((entry) => entry.id === match.gameId);

    return game
      ? { ok: true, tournament: state.tournament, game }
      : {
          ok: false,
          reason: 'validation',
          issues: [
            { code: 'server.noGame', severity: 'error', message: 'De partij is niet gevonden.' },
          ],
        };
  }

  return {
    previewPairing: (input, nonce) => local.previewPairing(input, nonce),

    async create(input) {
      try {
        const state = await link.post<TournamentState>(`${API_PREFIX}/tournaments`, {
          name: input.name,
          settings: input.settings,
          gameSettings: input.gameSettings,
          participants: input.participants,
        });
        remember(state);
        return { ok: true, tournament: state.tournament };
      } catch (error) {
        return { ok: false, reason: 'validation', issues: asIssues(error) };
      }
    },

    async get(id) {
      try {
        return await link.get<Tournament>(`${API_PREFIX}/tournaments/${id}`);
      } catch {
        return undefined;
      }
    },

    async load(id) {
      try {
        const state = await link.get<TournamentState>(`${API_PREFIX}/tournaments/${id}/state`);
        remember(state);
        return toLoaded(state);
      } catch {
        return undefined;
      }
    },

    async list(filter?: TournamentListFilter) {
      try {
        const { tournaments } = await link.get<{ tournaments: TournamentSummary[] }>(
          `${API_PREFIX}/tournaments`,
        );
        const ordered =
          filter?.status === undefined
            ? tournaments
            : tournaments.filter((entry) => entry.status === filter.status);
        return filter?.limit === undefined ? ordered : ordered.slice(0, filter.limit);
      } catch {
        return [];
      }
    },

    async lastActive() {
      const all = await this.list();
      return all.find((entry) => entry.status === 'active') ?? all[0];
    },

    async remove(id) {
      await send(id, { kind: 'remove' });
    },

    async rename(id, name) {
      await send(id, { kind: 'rename', name });
    },

    async propose(id, locked, nonce) {
      try {
        const response = await link.post<PairingResponse>(
          `${API_PREFIX}/tournaments/${id}/pairing`,
          { nonce, locked },
        );
        return {
          ok: true,
          proposal: {
            matches: response.matches as ProposedMatch[],
            cost: response.cost,
            repeatedPartners: response.repeatedPartners,
            repeatedOpponents: response.repeatedOpponents,
            issues: response.issues.map((issue) => ({
              code: issue.code,
              severity: issue.severity as ValidationIssue['severity'],
              message: issue.message,
            })),
          },
        };
      } catch (error) {
        return { ok: false, issues: asIssues(error) };
      }
    },

    async validate(id, matches) {
      try {
        const response = await link.post<PairingResponse>(
          `${API_PREFIX}/tournaments/${id}/pairing/validate`,
          { matches },
        );
        return response.issues.map((issue) => ({
          code: issue.code,
          severity: issue.severity as ValidationIssue['severity'],
          message: issue.message,
        }));
      } catch (error) {
        return asIssues(error);
      }
    },

    confirmRound: (id, matches) => send(id, { kind: 'confirmRound', matches }),
    completeRound: (id, roundId) => send(id, { kind: 'completeRound', roundId }),
    startDay: (id) => send(id, { kind: 'startDay' }),
    endDay: (id) => send(id, { kind: 'endDay' }),
    finish: (id) => send(id, { kind: 'finish' }),
    withdraw: (id, participantId) => send(id, { kind: 'withdraw', participantId }),
    reinstate: (id, participantId) => send(id, { kind: 'reinstate', participantId }),
    addTable: (id, name) => send(id, { kind: 'addTable', name }),
    renameTable: (id, tableId, name) => send(id, { kind: 'renameTable', tableId, name }),
    setTableActive: (id, tableId, active) =>
      send(id, { kind: 'setTableActive', tableId, active }),
    /**
     * Nothing to do from here.
     *
     * A match's revision moves when the server changes the match, and the
     * server is the only thing that does. A client asking for a bump would be
     * inventing state, so this reads the current tournament back instead.
     */
    async touchMatch(id) {
      const tournament = await this.get(id);
      return tournament ? { ok: true, tournament } : { ok: false, reason: 'notFound' };
    },

    startMatch: (id, matchId) => sendForMatch(id, { kind: 'startMatch', matchId }),
    replayMatch: (id, matchId) => sendForMatch(id, { kind: 'replayMatch', matchId }),

    async listTables(id) {
      try {
        const { tables } = await link.get<{ tables: TableView[] }>(
          `${API_PREFIX}/tournaments/${id}/tables`,
        );
        return tables.map((entry) => entry.table);
      } catch {
        return [];
      }
    },
  };
}

/** The revision a client last saw for a tournament, for the conflict message. */
export function revisionSeen(tournament: Tournament | undefined): number {
  return tournament ? revisionOf(tournament) : 0;
}
