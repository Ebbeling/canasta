import { z } from 'zod';
import type { GameResult, GameStatus, Player, Team } from '@/domain/game';
import type { RoundInput, RoundStatus, TeamRoundInput } from '@/domain/round';
import type { ConfigOverride, RuleSet } from '@/rules/schema/ruleSet';

/**
 * The export envelope, version 1.
 *
 * The version belongs to the *export format*, not to the rule set and not to
 * the engine. All three travel separately, so a later format can change without
 * pretending the game was played under different rules.
 *
 * A future version 2 gets its own schema and an adapter in `parseExport`; this
 * file is deliberately written so nothing assumes version 1 is the only one.
 */
export const EXPORT_FORMAT = 'canasta-game-export';
export const EXPORT_VERSION = 1;

/** Versions this build can read. */
export const SUPPORTED_EXPORT_VERSIONS: readonly number[] = [1];

export interface ExportedRound {
  /** The id in the source database. Provenance only — never reused on import. */
  sourceId: string;
  sequence: number;
  status: RoundStatus;
  createdAt: string;
  updatedAt: string;
  /** The source of truth. Everything else can be derived from this. */
  input: RoundInput;
  note?: string;
  /**
   * The audit trail as it was stored. Carried along so an export is a complete
   * record, but never trusted: import recomputes from `input` and reports a
   * mismatch rather than adopting these numbers.
   */
  computed?: unknown;
}

export interface ExportedGame {
  sourceId: string;
  name?: string;
  status: GameStatus;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  players: Player[];
  teams: Team[];
  ruleSetRef: {
    id: string;
    version: number;
    name: string;
    origin: 'builtin' | 'custom';
    sourcePresetId?: string;
  };
  /**
   * The whole frozen rule set the game was played under (spec §13).
   *
   * This is what makes an export self-contained: import never looks up a preset
   * or a built-in by id, so a rule set that changed in the meantime cannot alter
   * an imported game.
   */
  effectiveRuleSet: RuleSet;
  gameOverrides: ConfigOverride[];
  engineVersion: number;
  result?: GameResult;
  summary?: { totalsByTeam: Record<string, number>; roundCount: number };
  rounds: ExportedRound[];
}

export interface CanastaExportV1 {
  format: typeof EXPORT_FORMAT;
  version: 1;
  exportedAt: string;
  application: {
    /** The engine that produced the stored scores. Preserved on import. */
    engineVersion: number;
    appVersion?: string;
  };
  game: ExportedGame;
}

// --- Schema -----------------------------------------------------------------
//
// Imported JSON is untrusted input. The schema below checks the shape this app
// actually depends on; the rule set itself is then handed to the existing
// `validateRuleSet`, rather than duplicating that knowledge here.

const isoString = z.string().min(1);

const playerSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  seat: z.number().int(),
});

const teamSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  memberIds: z.array(z.string().min(1)),
  order: z.number().int(),
});

const scoreInputValueSchema = z.union([z.number(), z.string(), z.boolean(), z.array(z.string())]);

const teamRoundInputSchema = z.object({
  teamId: z.string().min(1),
  cardPoints: z.number(),
  cardsInHand: z.number(),
  naturalCanastas: z.number(),
  mixedCanastas: z.number(),
  redThrees: z.number(),
  opened: z.boolean(),
  wentOut: z.boolean(),
  concealedGoingOut: z.boolean(),
  extra: z.record(z.string(), scoreInputValueSchema),
});

const roundSchema = z.object({
  sourceId: z.string().min(1),
  sequence: z.number().int(),
  status: z.literal('committed'),
  createdAt: isoString,
  updatedAt: isoString,
  input: z.object({ teams: z.array(teamRoundInputSchema).min(1) }),
  note: z.string().optional(),
  computed: z.unknown().optional(),
});

/**
 * Structural check on the rule set. The semantic check is `validateRuleSet`,
 * which already exists and is the real authority.
 */
const ruleSetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  version: z.number(),
  engineVersion: z.number(),
  origin: z.enum(['builtin', 'custom']),
  family: z.string(),
  locked: z.boolean(),
  configuration: z.object({}).passthrough(),
  capabilities: z.record(z.string(), z.boolean()),
  fields: z.array(z.object({}).passthrough()),
  scoringRules: z.array(z.object({}).passthrough()),
  settings: z.array(z.object({}).passthrough()),
  constraints: z.array(z.object({}).passthrough()),
  roundRules: z.array(z.object({}).passthrough()),
  source: z.object({}).passthrough(),
  provenance: z.object({}).passthrough(),
});

const gameSchema = z.object({
  sourceId: z.string().min(1),
  name: z.string().optional(),
  status: z.enum(['active', 'finished', 'abandoned']),
  createdAt: isoString,
  updatedAt: isoString,
  finishedAt: isoString.optional(),
  players: z.array(playerSchema).min(1),
  teams: z.array(teamSchema).min(1),
  ruleSetRef: z.object({
    id: z.string().min(1),
    version: z.number(),
    name: z.string(),
    origin: z.enum(['builtin', 'custom']),
    sourcePresetId: z.string().optional(),
  }),
  effectiveRuleSet: ruleSetSchema.passthrough(),
  gameOverrides: z.array(z.object({ path: z.string(), value: z.unknown() })),
  engineVersion: z.number(),
  result: z
    .object({
      winnerTeamIds: z.array(z.string()),
      finalScores: z.record(z.string(), z.number()),
      decidedAfterRound: z.number(),
      tie: z.boolean(),
    })
    .optional(),
  summary: z
    .object({
      totalsByTeam: z.record(z.string(), z.number()),
      roundCount: z.number(),
    })
    .partial({ roundCount: true })
    .optional(),
  rounds: z.array(roundSchema),
});

/** The envelope, checked before anything version-specific is attempted. */
export const envelopeSchema = z.object({
  format: z.string(),
  version: z.number(),
});

export const exportV1Schema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(1),
  exportedAt: isoString,
  application: z.object({
    engineVersion: z.number(),
    appVersion: z.string().optional(),
  }),
  game: gameSchema,
});

export type { TeamRoundInput };
