import type { GameId, PlayerId, PresetId, RuleSetId, TeamId } from './ids';
import type { ValidationIssue } from './result';
import type { ConfigOverride, RuleSet } from '@/rules/schema/ruleSet';

export interface Player {
  id: PlayerId;
  name: string;
  seat: number;
}

export interface Team {
  id: TeamId;
  name: string;
  memberIds: PlayerId[];
  order: number;
}

/**
 * The frozen rule set a game was started with (spec §13).
 *
 * The whole resolved rule set is stored, not just `configuration`: the round
 * form is generated from `fields`, the settings screens from `settings` and the
 * rules screen from both. Storing only configuration would make an old game
 * render a form that does not match its own stored input, and would crash a
 * game whose custom preset had since been deleted.
 */
export type EffectiveRuleSet = Readonly<RuleSet>;

export type GameStatus = 'active' | 'finished' | 'abandoned';

export interface GameResult {
  /** More than one only under the `shared-win` tie-break. */
  winnerTeamIds: TeamId[];
  finalScores: Record<TeamId, number>;
  decidedAfterRound: number;
  tie: boolean;
}

export interface Game {
  id: GameId;
  name?: string;
  status: GameStatus;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;

  players: Player[];
  teams: Team[];

  ruleSetRef: {
    id: RuleSetId;
    version: number;
    name: string;
    origin: 'builtin' | 'custom';
    /** Provenance only — never a live reference. */
    sourcePresetId?: PresetId;
  };
  effectiveRuleSet: EffectiveRuleSet;
  /** Game-level house rules, already folded in; kept for display (spec §11). */
  gameOverrides: ConfigOverride[];

  engineVersion: number;
  /** Cache for the history list; rebuildable from the rounds at any time. */
  summary?: {
    totalsByTeam: Record<TeamId, number>;
    roundCount: number;
    leaderTeamId?: TeamId;
  };
  result?: GameResult;
  importedFrom?: { gameId: string; at: string };
}

/**
 * Where a game stands relative to its target score.
 *
 * Exists because `result: undefined` is ambiguous on its own: it means both
 * "nobody is near the target" and "two teams are tied on it and the app policy
 * is to play another round". Without this the UI could only tell them apart by
 * re-deriving the end condition, which is exactly the rule interpretation the
 * UI must never do.
 */
export type EndState =
  | { kind: 'inProgress'; targetScore: number }
  | { kind: 'tieBreakRound'; leaderTeamIds: TeamId[]; targetScore: number }
  | { kind: 'finished'; result: GameResult };

/** The derived view of a game: standings, per-round totals, end state. */
export interface GameProjection {
  endState: EndState;
  standings: { teamId: TeamId; total: number; rank: number }[];
  totalsByTeam: Record<TeamId, number>;
  status: GameStatus;
  result?: GameResult;
  /** What the next round-entry screen needs to show. */
  next: {
    roundNumber: number;
    initialMeldRequirement: Record<TeamId, number | null>;
  };
  issues: ValidationIssue[];
}
