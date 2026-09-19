import { newId, type GameId, type PresetId, type RuleSetId } from '@/domain/ids';
import type { Game, Player, Team } from '@/domain/game';
import type { Round } from '@/domain/round';
import type { ValidationIssue } from '@/domain/result';
import { hasErrors } from '@/domain/result';
import type { RuleSet } from '@/rules/schema/ruleSet';
import type { recomputeGame } from '@/scoring/recompute';
import { ENGINE_VERSION } from '@/scoring/scoreEngine';
import {
  type Clock,
  type GameListFilter,
  type GameSummary,
  type Repositories,
} from '@/application/ports';
import {
  buildEffectiveRuleSet,
  meaningfulOverrides,
} from '@/application/ruleSets/effectiveRuleSet';
import { validateGameSetup, type GameSetupDraft } from '@/application/viewmodels/setup';
import type { RuleSetResolver } from './ruleSetService';

/** A game with everything needed to render it. */
export interface LoadedGame {
  game: Game;
  rounds: Round[];
}

export interface CreateGameInput extends GameSetupDraft {
  ruleSetId: RuleSetId;
  ruleSetOrigin: 'builtin' | 'custom';
}

export type CreateGameOutcome =
  | { ok: true; game: Game }
  | { ok: false; reason: 'validation'; issues: ValidationIssue[] }
  | { ok: false; reason: 'unknownRuleSet' }
  | { ok: false; reason: 'storage'; message: string };

export interface GameService {
  create(input: CreateGameInput): Promise<CreateGameOutcome>;
  load(id: GameId): Promise<LoadedGame | undefined>;
  list(filter?: GameListFilter): Promise<GameSummary[]>;
  lastActive(): Promise<GameSummary | undefined>;
  rename(id: GameId, name: string): Promise<void>;
  abandon(id: GameId): Promise<void>;
  remove(id: GameId): Promise<void>;
  removeAll(): Promise<number>;
}

export interface GameServiceDeps {
  repositories: Repositories;
  clock: Clock;
  resolver: RuleSetResolver;
}

function buildPlayersAndTeams(draft: GameSetupDraft): { players: Player[]; teams: Team[] } {
  const players: Player[] = draft.playerNames.map((name, seat) => ({
    id: newId(),
    name: name.trim(),
    seat,
  }));

  const teams: Team[] = draft.teamSeats.map((seats, index) => ({
    id: newId(),
    name: draft.teamNames[index]?.trim() || `Team ${index + 1}`,
    memberIds: seats.map((seat) => players[seat]?.id).filter((id): id is string => Boolean(id)),
    order: index,
  }));

  return { players, teams };
}

export function createGameService(deps: GameServiceDeps): GameService {
  const { repositories, clock, resolver } = deps;

  return {
    async create(input) {
      const base: RuleSet | undefined = await resolver.resolve(
        input.ruleSetId,
        input.ruleSetOrigin,
      );
      if (!base) return { ok: false, reason: 'unknownRuleSet' };

      // The one configuration pipeline: nothing writes rule-set properties into
      // a game directly. The preset editor uses this same call.
      const overrides = meaningfulOverrides(base, input.overrides);
      const effective = buildEffectiveRuleSet(base, overrides);
      if (!effective.ok || !effective.ruleSet) {
        return { ok: false, reason: 'validation', issues: effective.issues };
      }

      // The people are checked against the rule set the game will actually run
      // with, not the one it started from. A custom party arrives as overrides
      // on `players` and `teams`, so validating against the base would reject
      // every game that is not the base's own shape.
      const setupIssues = validateGameSetup(effective.ruleSet, input);
      if (hasErrors(setupIssues)) {
        return { ok: false, reason: 'validation', issues: setupIssues };
      }

      const { players, teams } = buildPlayersAndTeams(input);
      const timestamp = clock.now();

      const game: Game = {
        id: newId(),
        name: input.gameName?.trim() || undefined,
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
        players,
        teams,
        ruleSetRef: {
          id: base.id,
          version: base.version,
          name: base.name,
          origin: input.ruleSetOrigin,
          sourcePresetId: input.ruleSetOrigin === 'custom' ? (base.id as PresetId) : undefined,
        },
        effectiveRuleSet: effective.ruleSet,
        gameOverrides: overrides,
        engineVersion: ENGINE_VERSION,
        summary: { totalsByTeam: {}, roundCount: 0 },
      };

      try {
        await repositories.transaction(['games', 'meta'], async () => {
          await repositories.games.create(game);
          await repositories.meta.set('lastActiveGameId', game.id);
          await repositories.meta.set('lastUsedRuleSetId', base.id);
        });
      } catch (error) {
        return { ok: false, reason: 'storage', message: (error as Error).message };
      }

      return { ok: true, game };
    },

    async load(id) {
      const game = await repositories.games.get(id);
      if (!game) return undefined;
      const rounds = await repositories.rounds.listByGame(id);
      return { game, rounds };
    },

    list(filter) {
      return repositories.games.list(filter);
    },

    async lastActive() {
      const id = await repositories.meta.get('lastActiveGameId');
      if (!id) return undefined;

      const summaries = await repositories.games.list({ status: 'active' });
      return summaries.find((summary) => summary.id === id) ?? summaries[0];
    },

    async rename(id, name) {
      const game = await repositories.games.get(id);
      if (!game) return;
      await repositories.games.update({
        ...game,
        name: name.trim() || undefined,
        updatedAt: clock.now(),
      });
    },

    async abandon(id) {
      const game = await repositories.games.get(id);
      if (!game) return;
      await repositories.games.update({ ...game, status: 'abandoned', updatedAt: clock.now() });
    },

    async remove(id) {
      await repositories.games.delete(id);
      if ((await repositories.meta.get('lastActiveGameId')) === id) {
        await repositories.meta.delete('lastActiveGameId');
      }
    },

    async removeAll() {
      const games = await repositories.games.list();
      for (const summary of games) {
        await repositories.games.delete(summary.id);
      }
      await repositories.meta.delete('lastActiveGameId');
      return games.length;
    },
  };
}

/**
 * Applies a fresh projection to a game record.
 *
 * Two things this must get right: an abandoned game is never resurrected, and a
 * correction that removes the win must also clear `finishedAt` and `result`,
 * not merely flip the status back.
 */
export function applyProjection(
  game: Game,
  projection: ReturnType<typeof recomputeGame>['projection'],
  roundCount: number,
  timestamp: string,
): Game {
  const status = game.status === 'abandoned' ? 'abandoned' : projection.status;
  const finished = status === 'finished';

  return {
    ...game,
    status,
    updatedAt: timestamp,
    finishedAt: finished ? (game.finishedAt ?? timestamp) : undefined,
    result: finished ? projection.result : undefined,
    summary: {
      totalsByTeam: { ...projection.totalsByTeam },
      roundCount,
      leaderTeamId: projection.standings[0]?.teamId,
    },
  };
}
