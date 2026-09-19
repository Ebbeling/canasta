import type { GameId, PresetId, RoundId, RuleSetId } from '@/domain/ids';
import type { Game, GameStatus } from '@/domain/game';
import type { Round } from '@/domain/round';
import type { CustomRuleSetRecord } from '@/rules/schema/ruleSet';

/**
 * The persistence contract the application layer depends on.
 *
 * These are interfaces on purpose: nothing above this file knows that Dexie and
 * IndexedDB sit underneath, which is what keeps "later sync without touching the
 * domain" (spec §32) honest and lets use cases be tested with in-memory fakes.
 */

/** ISO-8601 in UTC, e.g. "2026-09-19T13:45:00.000Z". See `src/storage/time.ts`. */
export type IsoTimestamp = string;

/**
 * A clock, so services can stamp timestamps without reaching for a global and
 * tests can pin them. The implementation lives in `src/storage/time.ts`; the
 * contract lives here because the application layer is what depends on it.
 */
export interface Clock {
  now(): IsoTimestamp;
}

/** A game without its rounds — enough to render the history list (spec §24). */
export interface GameSummary {
  id: GameId;
  name?: string;
  status: GameStatus;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  finishedAt?: IsoTimestamp;
  ruleSetName: string;
  ruleSetId: RuleSetId;
  playerNames: string[];
  teamNames: string[];
  roundCount: number;
}

export interface GameListFilter {
  status?: GameStatus;
  /** Newest first by default. */
  order?: 'newest' | 'oldest';
  limit?: number;
}

export interface GameRepository {
  /** Fails when the id already exists; an import must mint a new one (§8). */
  create(game: Game): Promise<Game>;
  get(id: GameId): Promise<Game | undefined>;
  /** Replaces the stored game wholesale; fails when it does not exist. */
  update(game: Game): Promise<Game>;
  /** Deletes the game and every round belonging to it, in one transaction. */
  delete(id: GameId): Promise<void>;
  list(filter?: GameListFilter): Promise<GameSummary[]>;
  exists(id: GameId): Promise<boolean>;
}

export interface RoundRepository {
  create(round: Round): Promise<Round>;
  get(id: RoundId): Promise<Round | undefined>;
  update(round: Round): Promise<Round>;
  delete(id: RoundId): Promise<void>;
  /** Ordered by round number, ascending. */
  listByGame(gameId: GameId): Promise<Round[]>;
  deleteByGame(gameId: GameId): Promise<number>;
  /** The highest round number stored for a game, or 0 when there are none. */
  lastRoundNumber(gameId: GameId): Promise<number>;
}

export interface PresetRepository {
  create(preset: CustomRuleSetRecord): Promise<CustomRuleSetRecord>;
  get(id: PresetId): Promise<CustomRuleSetRecord | undefined>;
  update(preset: CustomRuleSetRecord): Promise<CustomRuleSetRecord>;
  delete(id: PresetId): Promise<void>;
  list(): Promise<CustomRuleSetRecord[]>;
}

export type DraftKind = 'wizard' | 'roundEntry' | 'presetEditor';

export interface Draft<T = unknown> {
  key: string;
  kind: DraftKind;
  gameId?: GameId;
  data: T;
  updatedAt: IsoTimestamp;
}

export interface DraftRepository {
  /** Creates or replaces the draft at `key`. Drafts are throwaway by nature. */
  put<T>(draft: Omit<Draft<T>, 'updatedAt'>): Promise<Draft<T>>;
  get<T>(key: string): Promise<Draft<T> | undefined>;
  delete(key: string): Promise<void>;
  list(kind?: DraftKind): Promise<Draft[]>;
  listByGame(gameId: GameId): Promise<Draft[]>;
}

export type ThemePreference = 'system' | 'light' | 'dark';

/** Application-wide metadata. Never used for scoring. */
export interface AppMeta {
  schemaVersion: number;
  appVersion: string;
  lastActiveGameId: GameId;
  lastUsedRuleSetId: RuleSetId;
  storagePersisted: boolean;
  theme: ThemePreference;
}

export interface MetaRepository {
  get<K extends keyof AppMeta>(key: K): Promise<AppMeta[K] | undefined>;
  set<K extends keyof AppMeta>(key: K, value: AppMeta[K]): Promise<void>;
  delete<K extends keyof AppMeta>(key: K): Promise<void>;
  all(): Promise<Partial<AppMeta>>;
}

/** Stores a transaction may touch. */
export type StoreName = 'games' | 'rounds' | 'presets' | 'drafts' | 'meta';

/**
 * The single entry point the application layer uses for persistence, so no
 * stray queries appear elsewhere in the app (spec §17 of the storage brief).
 */
export interface Repositories {
  games: GameRepository;
  rounds: RoundRepository;
  presets: PresetRepository;
  drafts: DraftRepository;
  meta: MetaRepository;
  /**
   * Runs `fn` atomically across the named stores. Used wherever a round and its
   * game metadata must land together, so a crash cannot leave half a game.
   */
  transaction<T>(stores: readonly StoreName[], fn: () => Promise<T>): Promise<T>;
}

/** Thrown when a create would overwrite an existing record. */
export class RecordAlreadyExistsError extends Error {
  constructor(store: StoreName, id: string) {
    super(`Er bestaat al een record met id '${id}' in '${store}'.`);
    this.name = 'RecordAlreadyExistsError';
  }
}

/** Thrown when an update targets a record that is not there. */
export class RecordNotFoundError extends Error {
  constructor(store: StoreName, id: string) {
    super(`Geen record met id '${id}' gevonden in '${store}'.`);
    this.name = 'RecordNotFoundError';
  }
}
