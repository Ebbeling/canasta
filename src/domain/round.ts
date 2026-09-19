import type { GameId, RoundId, TeamId } from './ids';
import type { ValidationIssue } from './result';
import type { ScoreBreakdown } from './score';
import type { ScoreInputValue } from '@/rules/schema/field';

/**
 * A team's entry for one round.
 *
 * The named properties are the canonical field catalogue (spec §14.3): concepts
 * every Canasta variant shares. `extra` carries what is genuinely
 * variant-specific — Modern American's wild/aces/sevens canastas, its special
 * hands and incomplete melds. Both are declared by the rule set and rendered
 * from a registry, so no variant-specific field appears in React code.
 */
export interface TeamRoundInput {
  teamId: TeamId;
  cardPoints: number;
  cardsInHand: number;
  naturalCanastas: number;
  mixedCanastas: number;
  redThrees: number;
  opened: boolean;
  wentOut: boolean;
  concealedGoingOut: boolean;
  extra: Record<string, ScoreInputValue>;
}

export interface RoundInput {
  teams: TeamRoundInput[];
}

export function emptyTeamRoundInput(teamId: TeamId): TeamRoundInput {
  return {
    teamId,
    cardPoints: 0,
    cardsInHand: 0,
    naturalCanastas: 0,
    mixedCanastas: 0,
    redThrees: 0,
    opened: false,
    wentOut: false,
    concealedGoingOut: false,
    extra: {},
  };
}

export type RoundStatus = 'committed';

export interface Round {
  id: RoundId;
  gameId: GameId;
  /** Monotonic and never renumbered on delete; display order is the sort order. */
  sequence: number;
  status: RoundStatus;
  createdAt: string;
  updatedAt: string;
  /** The only source of truth. Everything else is derived. */
  input: RoundInput;
  note?: string;
  /** Cache of the last computation; see `RoundComputation`. */
  computed?: RoundComputation;
}

export interface TeamRoundScore {
  teamId: TeamId;
  breakdown: ScoreBreakdown;
  total: number;
}

export interface RoundComputation {
  scores: TeamRoundScore[];
  /** Round-scope issues, e.g. two teams marked as having gone out. */
  issues: ValidationIssue[];
  scoreBefore: Record<TeamId, number>;
  scoreAfter: Record<TeamId, number>;
  /** The initial-meld requirement that applied in this round, per team. */
  initialMeldRequirement: Record<TeamId, number | null>;
  computedAt: string;
  /**
   * Stamped on every calculation. A later engine version must never silently
   * change an old score; a mismatch surfaces a choice to the user (spec §14.4).
   */
  engineVersion: number;
}
