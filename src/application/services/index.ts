import type { RuleSetId } from '@/domain/ids';
import type { RuleSet } from '@/rules/schema/ruleSet';
import type { AppMeta, Clock, Repositories, ThemePreference } from '@/application/ports';
import { createGameService, type GameService } from './gameService';
import { createRoundService, type RoundService } from './roundService';
import { createRuleSetService, type RuleSetService } from './ruleSetService';
import { createTournamentService, type TournamentService } from './tournamentService';
import { createTransferService, type TransferService } from './transferService';

export type { ThemePreference };

export interface SettingsService {
  readMeta(): Promise<Partial<AppMeta>>;
  theme(): Promise<ThemePreference>;
  setTheme(theme: ThemePreference): Promise<void>;
  /** Best-effort; browsers may simply refuse. */
  requestPersistentStorage(): Promise<boolean>;
  storagePersisted(): Promise<boolean>;
}

export interface Services {
  games: GameService;
  rounds: RoundService;
  ruleSets: RuleSetService;
  settings: SettingsService;
  transfer: TransferService;
  tournaments: TournamentService;
}

export interface ServiceDeps {
  repositories: Repositories;
  clock: Clock;
  builtins: ReadonlyMap<RuleSetId, RuleSet>;
}

/**
 * Builds the whole application layer from its dependencies.
 *
 * Takes `Repositories` as a parameter and imports nothing from storage, so this
 * file has no idea Dexie exists. The concrete wiring lives in `src/app/`.
 */
export function createServices(deps: ServiceDeps): Services {
  const { repositories, clock, builtins } = deps;
  const ruleSets = createRuleSetService({ repositories, builtins });
  const games = createGameService({ repositories, clock, resolver: ruleSets });

  return {
    ruleSets,
    games,
    rounds: createRoundService({ repositories, clock }),
    settings: createSettingsService(repositories),
    transfer: createTransferService({ repositories, clock }),
    tournaments: createTournamentService({ repositories, clock, games }),
  };
}

function createSettingsService(repositories: Repositories): SettingsService {
  return {
    readMeta() {
      return repositories.meta.all();
    },

    async theme() {
      const stored = await repositories.meta.get('theme');
      return stored === 'light' || stored === 'dark' ? stored : 'system';
    },

    async setTheme(theme) {
      await repositories.meta.set('theme', theme);
    },

    async requestPersistentStorage() {
      // Not available in every browser, and it may decline; treat both as false.
      const storage = globalThis.navigator?.storage;
      if (!storage?.persist) return false;

      try {
        const granted = await storage.persist();
        await repositories.meta.set('storagePersisted', granted);
        return granted;
      } catch {
        return false;
      }
    },

    async storagePersisted() {
      const storage = globalThis.navigator?.storage;
      if (storage?.persisted) {
        try {
          return await storage.persisted();
        } catch {
          /* fall through to the stored value */
        }
      }
      return (await repositories.meta.get('storagePersisted')) ?? false;
    },
  };
}

export type { GameService, RoundService, RuleSetService, TournamentService, TransferService };
export * from './gameService';
export * from './roundService';
export * from './ruleSetService';
export * from './tournamentService';
export * from './transferService';
