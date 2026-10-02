import type { Json } from '@/domain/ids';
import type { NumExpr } from './expression';

export type CardRank =
  | 'joker'
  | 'ace'
  | 'two'
  | 'king'
  | 'queen'
  | 'jack'
  | 'ten'
  | 'nine'
  | 'eight'
  | 'seven'
  | 'six'
  | 'five'
  | 'four'
  | 'threeRed'
  | 'threeBlack';

/**
 * One band of the initial-meld staircase. Bounds are inclusive; `null` means
 * unbounded. One notation only — earlier spec drafts mixed two (spec §16).
 */
export interface InitialMeldThreshold {
  minScore: number | null;
  maxScore: number | null;
  required: number;
}

/** A Modern American special hand (spec §3.2). */
export interface SpecialHandDefinition {
  id: string;
  label: string;
  bonus: number;
  /** Free text shown in the rules screen; the app cannot verify it. */
  requirement?: string;
}

/** A named penalty for an incomplete special meld (spec §3.1, Modern American). */
export interface IncompleteMeldPenalty {
  id: string;
  label: string;
  penalty: number;
}

export type TieBreakStrategy = 'play-extra-round' | 'shared-win';

/**
 * What finishes a game.
 *
 * `targetScore` plays on until somebody passes the target. `plannedRounds`
 * plays an agreed number of rounds and then adds the totals up — there is no
 * target at all, and reaching one would mean nothing. The two are separate
 * concepts from the opening requirement, which decides what a team needs to
 * lay down *within* a round.
 */
export type EndGameMode = 'targetScore' | 'plannedRounds';

export interface EndGameConfig {
  mode: EndGameMode;
  /** Only consulted when `mode` is `targetScore`. */
  targetScore: number;
  /** Only consulted when `mode` is `plannedRounds`: how many are played. */
  plannedRounds: number;
  /** The round in progress is always played out before evaluating. */
  evaluateAfterRound: boolean;
  winner: {
    strategy: 'highest-score';
    /**
     * No source describes an exact tie; this is an app policy (spec §17.2) and
     * must be presented as such.
     */
    tie: TieBreakStrategy;
  };
}

export interface RuleSetConfiguration {
  players: { min: number; max: number; default: number };
  teams: { mode: 'partnership' | 'individual'; count: number; teamSize: number };
  deck: { standardDecks: number; jokers: number; totalCards: number };
  dealing: { cardsPerPlayer: number; drawCount: number; discardCount: number };

  scoring: {
    cardValues: Partial<Record<CardRank, number>>;
    /** Keyed by canasta category: natural, mixed, wild, aces, sevens, ... */
    canastas: Record<string, number>;
    /** Keyed by the value of the going-out choice: none, normal, concealed. */
    goingOut: Record<string, number>;
  };

  threes: {
    red: {
      enabled: boolean;
      /** Indexed by count, so index 4 can be 800 rather than 4 × 100. */
      valueByCount: number[];
      /** Classic: red threes count negative for a team that never melded. */
      requiresMeld: boolean;
      maxPerTeam: number;
    };
    black: {
      enabled: boolean;
      meldValue: number;
      /** Classic: a black three blocks the next player but does not freeze. */
      freezesPile: boolean;
      valueByCount: number[];
    };
    /**
     * Modern American: threes swing with the number of canastas — negative with
     * none, neutral with one, positive with two or more.
     */
    swingWithCanastas: boolean;
  };

  initialMeld: {
    enabled: boolean;
    thresholds: InitialMeldThreshold[];
    /**
     * A computed opening minimum, which replaces the staircase where a rule
     * set carries one.
     *
     * The staircase answers "how much does a team on 1.600 points need", which
     * is the question Classic and Modern American ask. A variant can ask a
     * different one — Paul's regels wants thirty points per round, so round
     * seven needs 210 whatever the standings are — and no staircase over
     * cumulative score can express that. The expression is evaluated in round
     * scope, so it is the same number for every team.
     */
    requirement?: NumExpr;
    /** Modern American requires a clean triple in the opening meld. */
    requiresCleanTriple: boolean;
    countTopDiscardCard: boolean;
    /** Pagat's "Splash"; not described by the CLA, so off by default. */
    splashAllowed: boolean;
  };

  goOut: {
    minimumCanastas: number;
    concealedEnabled: boolean;
    /** Going out without a final discard. */
    discardRequired: boolean;
    permissionFromPartner: boolean;
  };

  penalties: {
    handCardsSubtracted: boolean;
    incompleteMelds: IncompleteMeldPenalty[];
    minimumRoundScore: number | null;
  };

  talon: {
    enabled: boolean;
    firstTeamCards: number;
    secondTeamCards: number;
    minimumStockCards: number;
  };

  specialHands: {
    enabled: boolean;
    /** Verified: a special hand replaces that team's whole round score. */
    mode: 'replace' | 'add';
    hands: SpecialHandDefinition[];
  };

  endGame: EndGameConfig;

  /** Variant-specific data with no shared concept yet (spec §35). */
  extensions?: Record<string, Json>;
}
