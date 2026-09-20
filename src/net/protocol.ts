import { z } from 'zod';
import type { Game } from '@/domain/game';
import type { Round } from '@/domain/round';
import type { Tournament, TournamentTable } from '@/domain/tournament';
import type { TournamentSummary } from '@/application/ports';
import type { TournamentStandings } from '@/tournament/standings';

/**
 * The contract between the PWA and a Canasta tournament server.
 *
 * Shared on purpose: the server imports this file too, so a request is
 * described once and validated with the same schema on both sides. Nothing here
 * knows how it travels — no fetch, no HTTP status codes, no node — which is
 * what lets the same contract serve a laptop on the WiFi today and a hosted
 * server later.
 */

/**
 * Bumped when the client/server contract changes.
 *
 * Deliberately not `engineVersion`: that one says which scoring produced a
 * result and lives with the games forever. This one only says whether these two
 * processes can talk to each other, and resets nothing when it changes.
 */
export const TOURNAMENT_PROTOCOL_VERSION = 1;

/** Where the API lives under whichever origin serves it. */
export const API_PREFIX = '/api';

/* ------------------------------------------------------------------ health */

export const healthSchema = z.object({
  status: z.literal('ok'),
  /** The server's own build version, for display only. */
  version: z.string(),
  protocolVersion: z.number().int().positive(),
  serverId: z.string(),
  startedAt: z.string(),
});

export type Health = z.infer<typeof healthSchema>;

/* ------------------------------------------------------------------- state */

/**
 * Everything the organiser's screens need about one tournament.
 *
 * The same three pieces `services.tournaments.load()` returns locally, with the
 * games as an array because a `Map` does not survive JSON. Sending the whole
 * thing rather than a diff is a deliberate simplicity: a tournament document is
 * a few tens of kilobytes at most, and a snapshot can never drift.
 */
export interface TournamentState {
  tournament: Tournament;
  games: Game[];
  standings: TournamentStandings;
  revision: number;
}

/* ------------------------------------------------------------------ tables */

export interface TableView {
  table: TournamentTable;
  /** Whether a device is holding a live connection for this table right now. */
  connected: boolean;
  lastSeenAt?: string;
  /** Present once a session has been handed out; the token itself is not. */
  hasSession: boolean;
  /** The full join URL, for the QR code. Only sent to the organiser. */
  joinUrl?: string;
}

/* ---------------------------------------------------------- table sessions */

/** What a table device is allowed to know about itself. */
export interface TableSessionView {
  tournamentId: string;
  tournamentName: string;
  table: TournamentTable;
  protocolVersion: number;
}

/**
 * What one table sees of the tournament.
 *
 * Scoped down to this table on purpose: no other table's match, no standings of
 * anybody who is not sitting here, no settings. The table gets its own match,
 * the people at it, and the game behind it.
 */
export interface TableState {
  session: TableSessionView;
  tournamentStatus: Tournament['status'];
  round?: {
    id: string;
    sequence: number;
    dayNumber: number;
    status: 'planned' | 'confirmed' | 'completed';
  };
  match?: {
    id: string;
    revision: number;
    tableNumber: number;
    /** Sides in game order: ["Anna & Bram", "Cees & Dana"]. */
    sideLines: string[];
    participantNames: string[];
    gameId?: string;
    status: 'waiting' | 'busy' | 'done' | 'undecided';
  };
  /** The game behind the match, when one has been started. */
  game?: { game: Game; rounds: Round[] };
}

/* ---------------------------------------------------------------- commands */

/**
 * Everything the organiser can ask the server to do.
 *
 * One envelope rather than twenty routes: these are verbs on one aggregate, the
 * handler does nothing but dispatch to the very same `TournamentService` the
 * PWA uses locally, and adding a verb means adding a case instead of a route,
 * a schema, a client method and a test for the plumbing of each.
 */
export const commandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rename'), name: z.string().min(1) }),
  z.object({ kind: z.literal('remove') }),
  z.object({
    kind: z.literal('confirmRound'),
    matches: z.array(
      z.object({
        tableNumber: z.number().int().positive(),
        kind: z.enum(['game', 'bye']),
        participantIds: z.array(z.string()),
      }),
    ),
  }),
  z.object({ kind: z.literal('startMatch'), matchId: z.string().min(1) }),
  z.object({ kind: z.literal('replayMatch'), matchId: z.string().min(1) }),
  z.object({ kind: z.literal('completeRound'), roundId: z.string().min(1) }),
  z.object({ kind: z.literal('startDay') }),
  z.object({ kind: z.literal('endDay') }),
  z.object({ kind: z.literal('finish') }),
  z.object({ kind: z.literal('withdraw'), participantId: z.string().min(1) }),
  z.object({ kind: z.literal('reinstate'), participantId: z.string().min(1) }),
  z.object({ kind: z.literal('addTable'), name: z.string().optional() }),
  z.object({ kind: z.literal('renameTable'), tableId: z.string().min(1), name: z.string() }),
  z.object({
    kind: z.literal('setTableActive'),
    tableId: z.string().min(1),
    active: z.boolean(),
  }),
]);

export type Command = z.infer<typeof commandSchema>;

/**
 * The envelope every command travels in.
 *
 * `expectedRevision` is how a client says which version of the tournament it
 * was looking at; the server refuses anything staler than what it holds rather
 * than letting one organiser's screen undo another's decision.
 */
export const commandEnvelopeSchema = z.object({
  expectedRevision: z.number().int().min(0).optional(),
  idempotencyKey: z.string().min(8).max(200).optional(),
  command: commandSchema,
});

export type CommandEnvelope = z.infer<typeof commandEnvelopeSchema>;

/* ------------------------------------------------------------- the pairing */

/** One table of a proposal, before it is fixed. */
export const proposedMatchSchema = z.object({
  tableNumber: z.number().int().positive(),
  kind: z.enum(['game', 'bye']),
  participantIds: z.array(z.string()),
});

/**
 * Asking what the next round could look like.
 *
 * A query, not a command: proposing stores nothing and changes nothing, so it
 * has no revision and needs no idempotency key. Pressing "opnieuw indelen"
 * raises the nonce and gets a different arrangement of the same quality.
 */
export const pairingRequestSchema = z.object({
  nonce: z.number().int().min(0).optional(),
  locked: z.array(proposedMatchSchema).optional(),
});

export interface PairingResponse {
  matches: z.infer<typeof proposedMatchSchema>[];
  cost: number;
  repeatedPartners: number;
  repeatedOpponents: number;
  issues: { code: string; severity: string; message: string }[];
}

/** Checking an arrangement the organiser rearranged by hand. */
export const pairingValidateSchema = z.object({
  matches: z.array(proposedMatchSchema),
});

/* ------------------------------------------------------- table submissions */

/**
 * The round a table device entered.
 *
 * Deliberately only checked for the one thing transport can know — that it
 * names a team. What a round input may contain is decided by the game's own
 * frozen rule set, and the ordinary round service already validates against it.
 * Restating those fields here would be a second copy of the rules, in the one
 * layer that must never hold any.
 */
export const roundInputSchema = z
  .object({ teamId: z.string().min(1) })
  .passthrough();

export const submitResultSchema = z.object({
  /** The match the table believes it is playing; the server checks it. */
  matchId: z.string().min(1),
  expectedRevision: z.number().int().min(0),
  /** Makes a retry after a lost answer harmless. */
  idempotencyKey: z.string().min(8).max(200),
  inputs: z.array(roundInputSchema).min(1),
});

export type SubmitResult = z.infer<typeof submitResultSchema>;

export const completeMatchSchema = z.object({
  matchId: z.string().min(1),
  expectedRevision: z.number().int().min(0),
  idempotencyKey: z.string().min(8).max(200),
});

export type CompleteMatch = z.infer<typeof completeMatchSchema>;

export const startMatchSchema = z.object({
  matchId: z.string().min(1),
  idempotencyKey: z.string().min(8).max(200),
});

/* ------------------------------------------------------------------ errors */

/**
 * Why a request was refused, as a code the UI can act on.
 *
 * Codes rather than sentences: the server speaks one language, the interface
 * speaks the user's, and a client that meets an unknown code can still tell
 * "try again" from "this will never work".
 */
export type ApiErrorCode =
  | 'badRequest'
  | 'notFound'
  | 'validation'
  | 'conflict'
  | 'sessionInvalid'
  | 'sessionRevoked'
  | 'outOfScope'
  | 'protocolMismatch'
  | 'serverError';

export interface ApiError {
  error: ApiErrorCode;
  message: string;
  /** Present for `validation`: the issues the application layer produced. */
  issues?: { code: string; severity: string; message: string }[];
  /** Present for `conflict`: what the server actually holds. */
  currentRevision?: number;
}

/* ------------------------------------------------------------------ events */

/**
 * What the server pushes when something changes.
 *
 * The payload is deliberately thin — a name and a revision. A client that cares
 * re-reads the state it needs, which keeps one push from having to know every
 * screen that might be open.
 */
export type ServerEventKind =
  | 'tournament'
  | 'tables'
  | 'presence'
  | 'hello'
  | 'ping';

export interface ServerEvent {
  kind: ServerEventKind;
  tournamentId?: string;
  revision?: number;
  at: string;
}

/* ------------------------------------------------------------------- lists */

export interface TournamentListResponse {
  tournaments: TournamentSummary[];
}

export interface TablesResponse {
  tables: TableView[];
}

/* -------------------------------------------------------------------- misc */

/** `true` when a client on this protocol can talk to a server on that one. */
export function protocolIsCompatible(serverVersion: number): boolean {
  return serverVersion === TOURNAMENT_PROTOCOL_VERSION;
}

/**
 * Whether a link is one another device in the room could actually open.
 *
 * Shared with the server so both sides mean the same thing by it: the server
 * warns in the console at start-up, the organiser's screen warns next to the
 * QR code, and neither has its own idea of what counts as unreachable.
 */
export function isReachableFromOtherDevices(url: string): boolean {
  return !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url);
}
