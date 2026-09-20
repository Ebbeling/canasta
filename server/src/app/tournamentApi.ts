import type { ValidationIssue } from '@/domain/result';
import type { TeamRoundInput } from '@/domain/round';
import {
  currentRound,
  matchAtTable,
  matchRevision,
  revisionOf,
  tableById,
  tablesOf,
  tieIsUndecided,
  type Tournament,
  type TournamentId,
  type TournamentMatch,
  type TournamentTableId,
} from '@/domain/tournament';
import type { Services } from '@/application/services';
import type {
  ApiError,
  ApiErrorCode,
  CommandEnvelope,
  PairingResponse,
  TableState,
  TableView,
  TournamentState,
} from '@/net/protocol';
import type { ProposedMatch } from '@/tournament/pairing';
import { TOURNAMENT_PROTOCOL_VERSION } from '@/net/protocol';
import { tableJoinUrl } from '../network';
import type { Hub } from './hub';
import type { IdempotencyStore } from '../storage/idempotency';
import type { SessionStore, TableSession } from '../storage/sessions';

/**
 * Everything the HTTP layer is allowed to do, as plain async functions.
 *
 * This is the server's application layer. It owns the three things that only
 * make sense once there is more than one device — who may act (scope), whether
 * they were looking at the current version (revision), and whether a retry
 * should be executed or merely answered (idempotency) — and nothing else. Every
 * tournament decision underneath is taken by the very same `Services` the PWA
 * runs locally, which is why there is no second pairing engine and no second
 * set of scoring rules anywhere in this directory.
 */

export type Outcome<T> = { ok: true; value: T } | { ok: false; status: number; error: ApiError };

function fail(status: number, error: ApiErrorCode, message: string, extra: Partial<ApiError> = {}): Outcome<never> {
  return { ok: false, status, error: { error, message, ...extra } };
}

function invalid(issues: ValidationIssue[]): Outcome<never> {
  return fail(422, 'validation', issues[0]?.message ?? 'Ongeldig verzoek.', {
    issues: issues.map((issue) => ({
      code: issue.code,
      severity: issue.severity,
      message: issue.message,
    })),
  });
}

function stale(current: number): Outcome<never> {
  return fail(409, 'conflict', 'Iemand anders was je voor. Ververs en probeer opnieuw.', {
    currentRevision: current,
  });
}

export interface TournamentApiDeps {
  services: Services;
  sessions: SessionStore;
  idempotency: IdempotencyStore;
  hub: Hub;
}

export interface TournamentApi {
  state(id: TournamentId): Promise<Outcome<TournamentState>>;
  execute(id: TournamentId, envelope: CommandEnvelope): Promise<Outcome<TournamentState>>;
  /** What the next round could look like. Stores nothing. */
  propose(
    id: TournamentId,
    options: { nonce?: number; locked?: ProposedMatch[] },
  ): Promise<Outcome<PairingResponse>>;
  /** Checks an arrangement the organiser rearranged by hand. */
  validatePairing(id: TournamentId, matches: ProposedMatch[]): Promise<Outcome<PairingResponse>>;
  tables(id: TournamentId): Promise<Outcome<TableView[]>>;
  issueSession(id: TournamentId, tableId: TournamentTableId): Promise<Outcome<TableView>>;
  revokeSession(id: TournamentId, tableId: TournamentTableId): Promise<Outcome<TableView>>;

  /* --------------------------------------------------------- table scope */

  resolveSession(token: string): Outcome<TableSession>;
  tableState(token: string): Promise<Outcome<TableState>>;
  startTableMatch(token: string, matchId: string, key: string): Promise<Outcome<TableState>>;
  submitResult(
    token: string,
    args: { matchId: string; expectedRevision: number; idempotencyKey: string; inputs: TeamRoundInput[] },
  ): Promise<Outcome<TableState>>;
  completeMatch(
    token: string,
    args: { matchId: string; expectedRevision: number; idempotencyKey: string },
  ): Promise<Outcome<TableState>>;
}

export function createTournamentApi(
  { services, sessions, idempotency, hub }: TournamentApiDeps,
  basePath: string,
  /**
   * Where a device has to go to reach this server.
   *
   * A function rather than a string, because a laptop can change networks
   * between two rounds. Deliberately not derived from the request either: the
   * organiser asking for the QR code is sitting at `localhost`, and the phone
   * that has to scan it is not.
   */
  origin: () => string,
): TournamentApi {
  async function loadState(id: TournamentId): Promise<TournamentState | undefined> {
    const loaded = await services.tournaments.load(id);
    if (!loaded) return undefined;

    return {
      tournament: loaded.tournament,
      games: [...loaded.games.values()],
      standings: loaded.standings,
      revision: revisionOf(loaded.tournament),
    };
  }

  async function stateOutcome(id: TournamentId): Promise<Outcome<TournamentState>> {
    const state = await loadState(id);
    return state ? { ok: true, value: state } : fail(404, 'notFound', 'Dit toernooi bestaat niet.');
  }

  function tableViews(tournament: Tournament): TableView[] {
    const connected = hub.connectedTables(tournament.id);
    const base = origin();

    return tablesOf(tournament).map((table) => {
      const session = sessions.forTable(tournament.id, table.id);
      return {
        table,
        connected: connected.has(table.id),
        lastSeenAt: session?.lastSeenAt,
        hasSession: session !== undefined,
        joinUrl: session ? tableJoinUrl(base, basePath, session.token) : undefined,
      };
    });
  }

  /**
   * Runs a command once.
   *
   * An idempotency key turns a retry into a replay of the first answer. The key
   * is scoped to the tournament so one client's key cannot answer another's
   * question.
   */
  async function once<T>(
    scope: string,
    key: string | undefined,
    run: () => Promise<Outcome<T>>,
  ): Promise<Outcome<T>> {
    if (!key) return run();

    const remembered = idempotency.recall<Outcome<T>>(scope, key);
    if (remembered) return remembered;

    const outcome = await run();
    // Only successes are remembered: a rejected command should be retryable
    // once whatever made it fail has been put right.
    if (outcome.ok) idempotency.remember(scope, key, outcome);
    return outcome;
  }

  function matchStatus(
    tournament: Tournament,
    match: TournamentMatch,
    games: Map<string, { status: string; result?: { tie: boolean } }>,
  ): 'waiting' | 'busy' | 'done' | 'undecided' {
    if (!match.gameId) return 'waiting';
    const game = games.get(match.gameId);
    if (!game) return 'waiting';
    if (game.status !== 'finished') return 'busy';
    return tieIsUndecided(tournament.settings, game.result?.tie ?? false) ? 'undecided' : 'done';
  }

  async function buildTableState(session: TableSession): Promise<Outcome<TableState>> {
    const loaded = await services.tournaments.load(session.tournamentId);
    if (!loaded) return fail(404, 'notFound', 'Dit toernooi bestaat niet meer.');

    const { tournament } = loaded;
    const table = tableById(tournament, session.tableId);
    if (!table) return fail(404, 'notFound', 'Deze tafel bestaat niet meer.');

    const view: TableState = {
      session: {
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        table,
        protocolVersion: TOURNAMENT_PROTOCOL_VERSION,
      },
      tournamentStatus: tournament.status,
    };

    const found = matchAtTable(tournament, session.tableId);
    const round = found?.round ?? currentRound(tournament);

    if (round) {
      const day = tournament.days.find((entry) => entry.id === round.dayId);
      view.round = {
        id: round.id,
        sequence: round.sequence,
        dayNumber: day?.sequence ?? 1,
        status: round.status,
      };
    }

    if (found) {
      const { match } = found;
      const names = (id: string) =>
        tournament.participants.find((participant) => participant.id === id)?.name ?? '—';

      const sides = tournament.gameSettings.teamsPerMatch;
      const sideLines: string[] = [];
      for (let side = 0; side < sides; side += 1) {
        const members = match.participantIds.filter((_id, seat) => seat % sides === side);
        if (members.length > 0) sideLines.push(members.map(names).join(' & '));
      }

      view.match = {
        id: match.id,
        revision: matchRevision(match),
        tableNumber: match.tableNumber,
        sideLines,
        participantNames: match.participantIds.map(names),
        gameId: match.gameId,
        status: matchStatus(tournament, match, loaded.games as never),
      };

      if (match.gameId) {
        // The table needs the game itself — its frozen rule set renders the
        // round form, and its rounds render the scoreboard. It is read-only
        // here; the device never writes a game, it submits a round.
        const played = await services.games.load(match.gameId);
        if (played) view.game = { game: played.game, rounds: played.rounds };
      }
    }

    return { ok: true, value: view };
  }

  /**
   * Finds the match a table token is allowed to touch.
   *
   * Everything a table sends about *what* it is acting on is checked against
   * what the server thinks that table is playing. A match id from the device is
   * never trusted as an instruction — only as a statement of what it believed,
   * which the server then agrees or disagrees with.
   */
  async function scopedMatch(
    session: TableSession,
    matchId: string,
  ): Promise<Outcome<{ tournament: Tournament; match: TournamentMatch }>> {
    const tournament = await services.tournaments.get(session.tournamentId);
    if (!tournament) return fail(404, 'notFound', 'Dit toernooi bestaat niet meer.');

    const found = matchAtTable(tournament, session.tableId);
    if (!found) return fail(409, 'outOfScope', 'Deze tafel speelt op dit moment niet.');
    if (found.match.id !== matchId) {
      return fail(409, 'outOfScope', 'Deze partij hoort niet bij deze tafel.');
    }

    return { ok: true, value: { tournament, match: found.match } };
  }

  return {
    state: stateOutcome,

    async propose(id, { nonce, locked }) {
      const outcome = await services.tournaments.propose(id, locked, nonce);
      if (!outcome.ok) return invalid(outcome.issues);

      return {
        ok: true,
        value: {
          matches: outcome.proposal.matches as PairingResponse['matches'],
          cost: outcome.proposal.cost,
          repeatedPartners: outcome.proposal.repeatedPartners,
          repeatedOpponents: outcome.proposal.repeatedOpponents,
          issues: outcome.proposal.issues.map((issue) => ({
            code: issue.code,
            severity: issue.severity,
            message: issue.message,
          })),
        },
      };
    },

    async validatePairing(id, matches) {
      const issues = await services.tournaments.validate(id, matches);
      return {
        ok: true,
        value: {
          matches: matches as PairingResponse['matches'],
          cost: 0,
          repeatedPartners: 0,
          repeatedOpponents: 0,
          issues: issues.map((issue) => ({
            code: issue.code,
            severity: issue.severity,
            message: issue.message,
          })),
        },
      };
    },

    async execute(id, envelope) {
      const tournament = await services.tournaments.get(id);
      if (!tournament) return fail(404, 'notFound', 'Dit toernooi bestaat niet.');

      const current = revisionOf(tournament);
      if (envelope.expectedRevision !== undefined && envelope.expectedRevision !== current) {
        return stale(current);
      }

      return once(`tournament:${id}`, envelope.idempotencyKey, async () => {
        const command = envelope.command;
        const t = services.tournaments;

        const outcome = await (async () => {
          switch (command.kind) {
            case 'rename':
              await t.rename(id, command.name);
              return { ok: true as const };
            case 'remove':
              await t.remove(id);
              return { ok: true as const };
            case 'confirmRound':
              return t.confirmRound(id, command.matches);
            case 'startMatch':
              return t.startMatch(id, command.matchId);
            case 'replayMatch':
              return t.replayMatch(id, command.matchId);
            case 'completeRound':
              return t.completeRound(id, command.roundId);
            case 'startDay':
              return t.startDay(id);
            case 'endDay':
              return t.endDay(id);
            case 'finish':
              return t.finish(id);
            case 'withdraw':
              return t.withdraw(id, command.participantId);
            case 'reinstate':
              return t.reinstate(id, command.participantId);
            case 'addTable':
              return t.addTable(id, command.name);
            case 'renameTable':
              return t.renameTable(id, command.tableId, command.name);
            case 'setTableActive':
              return t.setTableActive(id, command.tableId, command.active);
          }
        })();

        if (outcome && 'ok' in outcome && !outcome.ok) {
          if ('issues' in outcome && outcome.issues) return invalid(outcome.issues);
          if ('reason' in outcome && outcome.reason === 'notFound') {
            return fail(404, 'notFound', 'Niet gevonden.');
          }
          return fail(400, 'badRequest', 'De opdracht kon niet worden uitgevoerd.');
        }

        if (command.kind === 'remove') {
          hub.publish('tournament', id);
          return { ok: true as const, value: {} as TournamentState };
        }

        const state = await loadState(id);
        if (!state) return fail(404, 'notFound', 'Dit toernooi bestaat niet meer.');

        hub.publish('tournament', id, state.revision);
        return { ok: true as const, value: state };
      });
    },

    async tables(id) {
      const tournament = await services.tournaments.get(id);
      if (!tournament) return fail(404, 'notFound', 'Dit toernooi bestaat niet.');
      return { ok: true, value: tableViews(tournament) };
    },

    async issueSession(id, tableId) {
      const tournament = await services.tournaments.get(id);
      if (!tournament) return fail(404, 'notFound', 'Dit toernooi bestaat niet.');
      if (!tableById(tournament, tableId)) {
        return fail(404, 'notFound', 'Deze tafel bestaat niet.');
      }

      sessions.issue(id, tableId);
      hub.publish('tables', id);

      const view = tableViews(tournament).find((entry) => entry.table.id === tableId);
      return view ? { ok: true, value: view } : fail(404, 'notFound', 'Deze tafel bestaat niet.');
    },

    async revokeSession(id, tableId) {
      const tournament = await services.tournaments.get(id);
      if (!tournament) return fail(404, 'notFound', 'Dit toernooi bestaat niet.');

      sessions.revoke(id, tableId);
      hub.publish('tables', id);

      const view = tableViews(tournament).find((entry) => entry.table.id === tableId);
      return view ? { ok: true, value: view } : fail(404, 'notFound', 'Deze tafel bestaat niet.');
    },

    resolveSession(token) {
      const session = sessions.resolve(token);
      if (!session) {
        return fail(401, 'sessionInvalid', 'Deze koppeling is niet (meer) geldig.');
      }
      sessions.touch(session.token);
      return { ok: true, value: session };
    },

    async tableState(token) {
      const session = sessions.resolve(token);
      if (!session) return fail(401, 'sessionInvalid', 'Deze koppeling is niet (meer) geldig.');
      sessions.touch(token);
      return buildTableState(session);
    },

    async startTableMatch(token, matchId, key) {
      const session = sessions.resolve(token);
      if (!session) return fail(401, 'sessionInvalid', 'Deze koppeling is niet (meer) geldig.');
      sessions.touch(token);

      return once(`table:${token}`, key, async () => {
        const scoped = await scopedMatch(session, matchId);
        if (!scoped.ok) return scoped;

        const started = await services.tournaments.startMatch(session.tournamentId, matchId);
        if (!started.ok) {
          return started.reason === 'validation'
            ? invalid(started.issues)
            : fail(404, 'notFound', 'De partij kon niet worden gestart.');
        }

        hub.publish('tournament', session.tournamentId, revisionOf(started.tournament));
        return buildTableState(session);
      });
    },

    async submitResult(token, args) {
      const session = sessions.resolve(token);
      if (!session) return fail(401, 'sessionInvalid', 'Deze koppeling is niet (meer) geldig.');
      sessions.touch(token);

      return once(`table:${token}`, args.idempotencyKey, async () => {
        const scoped = await scopedMatch(session, args.matchId);
        if (!scoped.ok) return scoped;

        const { match } = scoped.value;
        if (matchRevision(match) !== args.expectedRevision) {
          return stale(matchRevision(match));
        }
        if (!match.gameId) {
          return fail(409, 'conflict', 'De partij aan deze tafel is nog niet gestart.');
        }

        // The score itself is none of this layer's business: the ordinary round
        // service validates the input against the game's own frozen rule set
        // and the ordinary engine computes what it is worth.
        const saved = await services.rounds.saveNew({
          gameId: match.gameId,
          inputs: args.inputs,
        });

        if (!saved.ok) {
          if (saved.reason === 'validation') return invalid(saved.issues);
          if (saved.reason === 'conflict') return fail(409, 'conflict', saved.message);
          return fail(404, 'notFound', 'De partij bestaat niet meer.');
        }

        const bumped = await bumpMatch(session.tournamentId, args.matchId);
        hub.publish('tournament', session.tournamentId, bumped);
        return buildTableState(session);
      });
    },

    async completeMatch(token, args) {
      const session = sessions.resolve(token);
      if (!session) return fail(401, 'sessionInvalid', 'Deze koppeling is niet (meer) geldig.');
      sessions.touch(token);

      return once(`table:${token}`, args.idempotencyKey, async () => {
        const scoped = await scopedMatch(session, args.matchId);
        if (!scoped.ok) return scoped;

        if (matchRevision(scoped.value.match) !== args.expectedRevision) {
          return stale(matchRevision(scoped.value.match));
        }

        // Completing is an acknowledgement, not a state change of its own: the
        // game decides when it is over. A table saying so simply confirms it and
        // lets the organiser's screen light up.
        const bumped = await bumpMatch(session.tournamentId, args.matchId);
        hub.publish('tournament', session.tournamentId, bumped);
        return buildTableState(session);
      });
    },
  };

  /** Moves one match on a revision, without touching anything else. */
  async function bumpMatch(tournamentId: TournamentId, matchId: string): Promise<number> {
    const touched = await services.tournaments.touchMatch(tournamentId, matchId);
    return touched.ok ? revisionOf(touched.tournament) : 0;
  }
}
