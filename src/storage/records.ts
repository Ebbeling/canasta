import { deepFreeze } from '@/domain/freeze';
import type { GameId, PresetId, RoundId, RuleSetId } from '@/domain/ids';
import type { Game, GameResult, GameStatus, Player, Team } from '@/domain/game';
import type { Round, RoundComputation, RoundInput, RoundStatus } from '@/domain/round';
import type { ConfigOverride, CustomRuleSetRecord, RuleSet } from '@/rules/schema/ruleSet';
import type { Draft, DraftKind, IsoTimestamp } from '@/application/ports';

/**
 * The shapes actually written to IndexedDB, plus the mapping to and from the
 * domain types.
 *
 * The records stay deliberately close to the domain model — a near-identity
 * mapping is cheaper and less bug-prone than a parallel vocabulary — but the
 * seam exists so a future schema change can be absorbed here instead of in the
 * domain. Two things differ on purpose:
 *
 *  - `recordVersion`, which belongs to persistence and has no domain meaning;
 *  - `roundNumber`, the persisted name for the domain's `sequence`.
 */

/** Bumped when a record's *shape* changes, independently of the Dexie version. */
export const GAME_RECORD_VERSION = 1;
export const ROUND_RECORD_VERSION = 1;

export interface GameRecord {
  id: GameId;
  name?: string;
  status: GameStatus;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  finishedAt?: IsoTimestamp;

  players: Player[];
  teams: Team[];

  /** Provenance of the rule set this game was started from. */
  ruleSetRef: {
    id: RuleSetId;
    version: number;
    name: string;
    origin: 'builtin' | 'custom';
    /** Which preset it came from — provenance only, never a live reference. */
    sourcePresetId?: PresetId;
  };

  /**
   * The full effective rule set snapshot (spec §13).
   *
   * Not `ruleSetId: "classic"` but the whole resolved rule set: configuration,
   * fields, settings, scoring rules, capabilities and source. A rule set edited
   * tomorrow therefore cannot change this game, and the round form can still be
   * rendered for a game whose custom preset has since been deleted.
   */
  effectiveRuleSet: RuleSet;

  /** Game-level house rules, already folded into the snapshot; kept for display. */
  gameOverrides: ConfigOverride[];

  /**
   * The engine version that produced this game's scores (spec §14.4). Stored so
   * a later engine can detect that it would compute something different, and
   * offer the choice instead of silently rewriting history.
   */
  engineVersion: number;

  summary?: Game['summary'];
  result?: GameResult;
  importedFrom?: { gameId: string; at: IsoTimestamp };

  recordVersion: number;
}

export interface RoundRecord {
  id: RoundId;
  gameId: GameId;
  /** The domain's `sequence`: monotonic, never renumbered when a round is deleted. */
  roundNumber: number;
  status: RoundStatus;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;

  /** The source of truth for a round; everything else is derived from it. */
  input: RoundInput;

  note?: string;

  /**
   * Cached result of the last computation, including its `engineVersion`.
   * Storage never produces this — the engine does — and never reads it as
   * anything but opaque data.
   */
  computed?: RoundComputation;

  recordVersion: number;
}

export interface DraftRecord {
  key: string;
  kind: DraftKind;
  gameId?: GameId;
  data: unknown;
  updatedAt: IsoTimestamp;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

/** Presets are stored exactly as the rules layer defines them. */
export type PresetRecord = CustomRuleSetRecord;

// --- Mapping ---------------------------------------------------------------
//
// `structuredClone` on the way in and out keeps IndexedDB's copy independent of
// whatever the caller holds, and hands back a plain object rather than a
// reference into the database.

export function toGameRecord(game: Game): GameRecord {
  return {
    ...structuredClone({
      id: game.id,
      name: game.name,
      status: game.status,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
      finishedAt: game.finishedAt,
      players: game.players,
      teams: game.teams,
      ruleSetRef: game.ruleSetRef,
      effectiveRuleSet: game.effectiveRuleSet as RuleSet,
      gameOverrides: game.gameOverrides,
      engineVersion: game.engineVersion,
      summary: game.summary,
      result: game.result,
      importedFrom: game.importedFrom,
    }),
    recordVersion: GAME_RECORD_VERSION,
  };
}

export function fromGameRecord(record: GameRecord): Game {
  const copy = structuredClone(record);
  return {
    id: copy.id,
    name: copy.name,
    status: copy.status,
    createdAt: copy.createdAt,
    updatedAt: copy.updatedAt,
    finishedAt: copy.finishedAt,
    players: copy.players,
    teams: copy.teams,
    ruleSetRef: copy.ruleSetRef,
    // Frozen on the way out so a reconstructed game carries the same
    // immutability guarantee as one that was just started.
    effectiveRuleSet: deepFreeze(copy.effectiveRuleSet),
    gameOverrides: copy.gameOverrides,
    engineVersion: copy.engineVersion,
    summary: copy.summary,
    result: copy.result,
    importedFrom: copy.importedFrom,
  };
}

export function toRoundRecord(round: Round): RoundRecord {
  const copy = structuredClone({
    id: round.id,
    gameId: round.gameId,
    roundNumber: round.sequence,
    status: round.status,
    createdAt: round.createdAt,
    updatedAt: round.updatedAt,
    input: round.input,
    note: round.note,
    computed: round.computed,
  });
  return { ...copy, recordVersion: ROUND_RECORD_VERSION };
}

export function fromRoundRecord(record: RoundRecord): Round {
  const copy = structuredClone(record);
  return {
    id: copy.id,
    gameId: copy.gameId,
    sequence: copy.roundNumber,
    status: copy.status,
    createdAt: copy.createdAt,
    updatedAt: copy.updatedAt,
    input: copy.input,
    note: copy.note,
    computed: copy.computed,
  };
}

export function toDraftRecord(draft: Draft): DraftRecord {
  return structuredClone({
    key: draft.key,
    kind: draft.kind,
    gameId: draft.gameId,
    data: draft.data,
    updatedAt: draft.updatedAt,
  });
}

export function fromDraftRecord<T>(record: DraftRecord): Draft<T> {
  const copy = structuredClone(record);
  return {
    key: copy.key,
    kind: copy.kind,
    gameId: copy.gameId,
    data: copy.data as T,
    updatedAt: copy.updatedAt,
  };
}
