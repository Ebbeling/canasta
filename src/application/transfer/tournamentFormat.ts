import { z } from 'zod';
import type { Tournament } from '@/domain/tournament';
import { exportV1Schema, type CanastaExportV1 } from './format';

/**
 * The tournament envelope, version 1.
 *
 * A separate format rather than a second version of the game export: the two
 * carry different things and neither should have to pretend to be the other. A
 * tournament file holds the tournament itself plus a complete game export for
 * every table that has been played, so it is self-contained in exactly the way
 * a game export is — nothing is looked up by id on the way back in.
 *
 * Existing game exports are untouched and still import as they always did.
 */
export const TOURNAMENT_EXPORT_FORMAT = 'canasta-tournament-export';
export const TOURNAMENT_EXPORT_VERSION = 1;

export const SUPPORTED_TOURNAMENT_VERSIONS: readonly number[] = [1];

export interface CanastaTournamentExportV1 {
  format: typeof TOURNAMENT_EXPORT_FORMAT;
  version: 1;
  exportedAt: string;
  application: {
    appVersion?: string;
  };
  /** The tournament as stored, with the ids it had in the source database. */
  tournament: Tournament;
  /** One complete game export per table that has a game. */
  games: CanastaExportV1[];
}

const isoString = z.string().min(1);

const participantSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['player', 'team']),
  name: z.string(),
  memberNames: z.array(z.string()),
  playerIds: z.array(z.string()).optional(),
  status: z.enum(['active', 'withdrawn']),
});

const matchSchema = z.object({
  id: z.string().min(1),
  tableNumber: z.number().int(),
  kind: z.enum(['game', 'bye']),
  participantIds: z.array(z.string().min(1)),
  gameId: z.string().optional(),
});

const roundSchema = z.object({
  id: z.string().min(1),
  dayId: z.string().min(1),
  sequence: z.number().int(),
  status: z.enum(['planned', 'confirmed', 'completed']),
  matches: z.array(matchSchema),
  confirmedAt: isoString.optional(),
  completedAt: isoString.optional(),
});

const daySchema = z.object({
  id: z.string().min(1),
  sequence: z.number().int(),
  status: z.enum(['planned', 'active', 'finished']),
  date: isoString.optional(),
});

const tournamentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(['upcoming', 'active', 'finished']),
  settings: z.object({
    mode: z.enum(['fixed', 'open']),
    scoringMode: z.enum(['canasta-score', 'tournament-points']),
    drawAllowed: z.boolean(),
    oddParticipantMode: z.enum(['extra-player-at-table', 'bye']),
    manualPairingAllowed: z.boolean(),
    plannedDays: z.number().int().optional(),
    plannedRoundsPerDay: z.number().int().optional(),
  }),
  gameSettings: z.object({
    ruleSetId: z.string().min(1),
    ruleSetOrigin: z.enum(['builtin', 'custom']),
    ruleSetName: z.string(),
    participantsPerMatch: z.number().int(),
    teamsPerMatch: z.number().int(),
    overrides: z.array(z.object({ path: z.string(), value: z.unknown() })),
  }),
  participants: z.array(participantSchema),
  days: z.array(daySchema),
  rounds: z.array(roundSchema),
  createdAt: isoString,
  updatedAt: isoString,
  startedAt: isoString.optional(),
  finishedAt: isoString.optional(),
});

export const tournamentExportV1Schema = z.object({
  format: z.literal(TOURNAMENT_EXPORT_FORMAT),
  version: z.literal(1),
  exportedAt: isoString,
  application: z.object({ appVersion: z.string().optional() }),
  tournament: tournamentSchema,
  games: z.array(exportV1Schema),
});
