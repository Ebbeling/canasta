import type { GameId } from '@/domain/ids';
import type { GameListFilter, GameSummary } from '@/application/ports';
import type { LoadedGame } from '@/application/services';
import { buildScoreboard, type ScoreboardVM } from '@/application/viewmodels/scoreboard';
import { buildHistory, type HistoryVM } from '@/application/viewmodels/historyView';
import { describeRuleSet, type RuleSetDescription } from '@/application/viewmodels/rulesView';
import type { CustomRuleSetRecord } from '@/rules/schema/ruleSet';
import type { RuleSetChoice } from '@/application/services/ruleSetService';
import { useServices } from '@/app/servicesContext';
import { useLiveResult, type AsyncState } from './useLiveResult';

/**
 * Each hook builds its view model *inside* the querier, so Dexie's own
 * dependency tracking memoises it. React never sees a raw projection.
 */

export function useGame(gameId: GameId | undefined): AsyncState<LoadedGame> {
  const services = useServices();
  return useLiveResult(gameId ? () => services.games.load(gameId) : null, [gameId]);
}

export function useScoreboard(gameId: GameId | undefined): AsyncState<ScoreboardVM> {
  const services = useServices();
  return useLiveResult(
    gameId
      ? async () => {
          const loaded = await services.games.load(gameId);
          return loaded ? buildScoreboard(loaded.game, loaded.rounds) : undefined;
        }
      : null,
    [gameId],
  );
}

export function useGameHistory(gameId: GameId | undefined): AsyncState<HistoryVM> {
  const services = useServices();
  return useLiveResult(
    gameId
      ? async () => {
          const loaded = await services.games.load(gameId);
          return loaded ? buildHistory(loaded.game, loaded.rounds) : undefined;
        }
      : null,
    [gameId],
  );
}

/**
 * The rules of *this* game, from its frozen snapshot — never the current
 * built-in (spec §13, §18).
 */
export function useGameRules(gameId: GameId | undefined): AsyncState<RuleSetDescription> {
  const services = useServices();
  return useLiveResult(
    gameId
      ? async () => {
          const loaded = await services.games.load(gameId);
          if (!loaded) return undefined;
          return describeRuleSet(loaded.game.effectiveRuleSet, {
            overrides: loaded.game.gameOverrides,
          });
        }
      : null,
    [gameId],
  );
}

export function useGameList(filter?: GameListFilter): AsyncState<GameSummary[]> {
  const services = useServices();
  return useLiveResult(
    () => services.games.list(filter),
    [filter?.status, filter?.order, filter?.limit],
  );
}

export function useLastActiveGame(): AsyncState<GameSummary> {
  const services = useServices();
  return useLiveResult(() => services.games.lastActive(), []);
}

export function useRuleSetChoices(): AsyncState<RuleSetChoice[]> {
  const services = useServices();
  return useLiveResult(() => services.ruleSets.listAvailable(), []);
}

/** The stored custom rule sets, as records — what the editor writes back. */
export function usePresets(): AsyncState<CustomRuleSetRecord[]> {
  const services = useServices();
  return useLiveResult(() => services.ruleSets.listPresets(), []);
}

/**
 * One rule set resolved for editing: the stored record plus the description
 * the settings editor renders from.
 */
export function usePresetEditor(
  presetId: string | undefined,
): AsyncState<{ record: CustomRuleSetRecord; base: RuleSetDescription }> {
  const services = useServices();
  return useLiveResult(
    presetId
      ? async () => {
          const records = await services.ruleSets.listPresets();
          const record = records.find((entry) => entry.id === presetId);
          if (!record) return undefined;
          // Described from the *snapshot*, so the editor always offers the full
          // set of settings the clone was taken with, not a narrowed view of
          // whatever the current overrides happen to leave visible.
          return { record, base: describeRuleSet(record.derivedFrom.snapshot) };
        }
      : null,
    [presetId],
  );
}
