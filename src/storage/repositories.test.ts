import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RecordAlreadyExistsError, RecordNotFoundError } from '@/application/ports';
import type { Repositories } from '@/application/ports';
import { createTestStorage, type TestStorage } from './testing';
import { DB_VERSION } from './db';
import { recordSchemaVersion } from './index';
import { classic } from '@/rules/builtin';
import { cloneRuleSet, freezeForGame } from '@/rules/resolve/resolveRuleSet';
import { makeGame, TEAM_A, TEAM_B, teamInput } from '@/test/fixtures';
import type { Game } from '@/domain/game';
import type { Round } from '@/domain/round';

let storage: TestStorage;
let repositories: Repositories;

beforeEach(async () => {
  storage = await createTestStorage();
  repositories = storage.repositories;
});

afterEach(async () => {
  await storage.close();
});

function aGame(overrides: Partial<Game> = {}): Game {
  return makeGame(freezeForGame(classic), overrides);
}

function aRound(gameId: string, roundNumber: number, cardPoints = 100): Round {
  return {
    id: `round-${gameId}-${roundNumber}`,
    gameId,
    sequence: roundNumber,
    status: 'committed',
    createdAt: '2026-09-19T12:00:00.000Z',
    updatedAt: '2026-09-19T12:00:00.000Z',
    input: {
      teams: [teamInput(TEAM_A, { cardPoints, opened: true }), teamInput(TEAM_B, { opened: true })],
    },
  };
}

describe('games', () => {
  it('creates and reads a game back', async () => {
    const game = aGame();
    await repositories.games.create(game);

    const loaded = await repositories.games.get(game.id);
    expect(loaded?.id).toBe(game.id);
    expect(loaded?.players.map((player) => player.name)).toEqual([
      'Michel',
      'Paul',
      'Anne',
      'Karin',
    ]);
    expect(loaded?.teams).toHaveLength(2);
  });

  it('returns undefined for a game that does not exist', async () => {
    expect(await repositories.games.get('onbekend')).toBeUndefined();
    expect(await repositories.games.exists('onbekend')).toBe(false);
  });

  it('refuses to create a game whose id is already taken', async () => {
    const game = aGame();
    await repositories.games.create(game);

    await expect(repositories.games.create(game)).rejects.toThrow(RecordAlreadyExistsError);
  });

  it('updates an existing game', async () => {
    const game = aGame();
    await repositories.games.create(game);

    await repositories.games.update({
      ...game,
      name: 'Donderdagavond',
      status: 'finished',
      updatedAt: '2026-09-19T14:00:00.000Z',
    });

    const loaded = await repositories.games.get(game.id);
    expect(loaded?.name).toBe('Donderdagavond');
    expect(loaded?.status).toBe('finished');
  });

  it('refuses to update a game that does not exist', async () => {
    await expect(repositories.games.update(aGame({ id: 'spookspel' }))).rejects.toThrow(
      RecordNotFoundError,
    );
  });

  it('deletes a game together with its rounds and drafts', async () => {
    const game = aGame();
    await repositories.games.create(game);
    await repositories.rounds.create(aRound(game.id, 1));
    await repositories.rounds.create(aRound(game.id, 2));
    await repositories.drafts.put({
      key: `round:${game.id}`,
      kind: 'roundEntry',
      gameId: game.id,
      data: { cardPoints: 40 },
    });

    await repositories.games.delete(game.id);

    expect(await repositories.games.get(game.id)).toBeUndefined();
    expect(await repositories.rounds.listByGame(game.id)).toEqual([]);
    expect(await repositories.drafts.listByGame(game.id)).toEqual([]);
  });

  it('lists games newest first, with a round count', async () => {
    const older = aGame({ id: 'game-older', updatedAt: '2026-09-18T10:00:00.000Z' });
    const newer = aGame({ id: 'game-newer', updatedAt: '2026-09-19T10:00:00.000Z' });
    await repositories.games.create(older);
    await repositories.games.create(newer);
    await repositories.rounds.create(aRound(newer.id, 1));

    const list = await repositories.games.list();

    expect(list.map((entry) => entry.id)).toEqual(['game-newer', 'game-older']);
    expect(list[0]?.roundCount).toBe(1);
    expect(list[1]?.roundCount).toBe(0);
    expect(list[0]?.ruleSetName).toBe('Classic Canasta');
  });

  it('filters, orders and limits the list', async () => {
    await repositories.games.create(aGame({ id: 'a', status: 'active' }));
    await repositories.games.create(
      aGame({ id: 'b', status: 'finished', updatedAt: '2026-09-17T10:00:00.000Z' }),
    );

    expect((await repositories.games.list({ status: 'finished' })).map((item) => item.id)).toEqual([
      'b',
    ]);
    expect((await repositories.games.list({ order: 'oldest' })).map((item) => item.id)).toEqual([
      'b',
      'a',
    ]);
    expect(await repositories.games.list({ limit: 1 })).toHaveLength(1);
  });
});

describe('rounds', () => {
  let gameId: string;

  beforeEach(async () => {
    const game = aGame();
    await repositories.games.create(game);
    gameId = game.id;
  });

  it('creates and reads a round back with its input intact', async () => {
    const round = aRound(gameId, 1, 420);
    await repositories.rounds.create(round);

    const loaded = await repositories.rounds.get(round.id);
    expect(loaded?.sequence).toBe(1);
    expect(loaded?.input.teams[0]?.cardPoints).toBe(420);
    expect(loaded?.input.teams[0]?.teamId).toBe(TEAM_A);
  });

  it('refuses a duplicate round id and an update of a missing round', async () => {
    const round = aRound(gameId, 1);
    await repositories.rounds.create(round);

    await expect(repositories.rounds.create(round)).rejects.toThrow(RecordAlreadyExistsError);
    await expect(repositories.rounds.update(aRound(gameId, 99))).rejects.toThrow(
      RecordNotFoundError,
    );
  });

  it('updates a round', async () => {
    const round = aRound(gameId, 1, 100);
    await repositories.rounds.create(round);

    const corrected = structuredClone(round);
    corrected.input.teams[0]!.cardPoints = 250;
    corrected.updatedAt = '2026-09-19T15:00:00.000Z';
    await repositories.rounds.update(corrected);

    const loaded = await repositories.rounds.get(round.id);
    expect(loaded?.input.teams[0]?.cardPoints).toBe(250);
    expect(loaded?.updatedAt).toBe('2026-09-19T15:00:00.000Z');
  });

  it('deletes a single round', async () => {
    const round = aRound(gameId, 1);
    await repositories.rounds.create(round);
    await repositories.rounds.delete(round.id);

    expect(await repositories.rounds.get(round.id)).toBeUndefined();
  });

  it('queries by game and returns rounds in round-number order', async () => {
    // Inserted out of order on purpose.
    for (const number of [3, 1, 2]) {
      await repositories.rounds.create(aRound(gameId, number));
    }

    const rounds = await repositories.rounds.listByGame(gameId);
    expect(rounds.map((round) => round.sequence)).toEqual([1, 2, 3]);
  });

  it('keeps rounds of different games apart', async () => {
    const other = aGame({ id: 'game-2' });
    await repositories.games.create(other);
    await repositories.rounds.create(aRound(gameId, 1));
    await repositories.rounds.create(aRound(other.id, 1));

    expect(await repositories.rounds.listByGame(gameId)).toHaveLength(1);
    expect(await repositories.rounds.listByGame(other.id)).toHaveLength(1);
  });

  it('reports the highest stored round number', async () => {
    expect(await repositories.rounds.lastRoundNumber(gameId)).toBe(0);

    await repositories.rounds.create(aRound(gameId, 1));
    await repositories.rounds.create(aRound(gameId, 2));
    expect(await repositories.rounds.lastRoundNumber(gameId)).toBe(2);

    // Deleting round 2 does not renumber round 1.
    await repositories.rounds.delete(`round-${gameId}-2`);
    expect(await repositories.rounds.lastRoundNumber(gameId)).toBe(1);
  });

  it('deletes every round of a game at once', async () => {
    await repositories.rounds.create(aRound(gameId, 1));
    await repositories.rounds.create(aRound(gameId, 2));

    expect(await repositories.rounds.deleteByGame(gameId)).toBe(2);
    expect(await repositories.rounds.listByGame(gameId)).toEqual([]);
  });
});

describe('presets', () => {
  const preset = () =>
    cloneRuleSet(classic, {
      id: 'preset-1',
      name: 'Mijn Canasta',
      now: '2026-09-19T12:00:00.000Z',
    });

  it('creates, reads, updates and deletes', async () => {
    await repositories.presets.create(preset());

    const loaded = await repositories.presets.get('preset-1');
    expect(loaded?.name).toBe('Mijn Canasta');
    expect(loaded?.derivedFrom.ruleSetId).toBe('builtin.classic');

    await repositories.presets.update({
      ...loaded!,
      name: 'Familie Canasta',
      overrides: [{ path: 'endGame.targetScore', value: 3000 }],
    });

    const updated = await repositories.presets.get('preset-1');
    expect(updated?.name).toBe('Familie Canasta');
    expect(updated?.overrides).toHaveLength(1);

    await repositories.presets.delete('preset-1');
    expect(await repositories.presets.get('preset-1')).toBeUndefined();
  });

  it('refuses a duplicate id and an update of a missing preset', async () => {
    await repositories.presets.create(preset());

    await expect(repositories.presets.create(preset())).rejects.toThrow(RecordAlreadyExistsError);
    await expect(repositories.presets.update({ ...preset(), id: 'bestaat-niet' })).rejects.toThrow(
      RecordNotFoundError,
    );
  });

  it('lists presets by name', async () => {
    await repositories.presets.create({ ...preset(), id: 'p2', name: 'Zondagse regels' });
    await repositories.presets.create({ ...preset(), id: 'p1', name: 'Familie Canasta' });

    expect((await repositories.presets.list()).map((item) => item.name)).toEqual([
      'Familie Canasta',
      'Zondagse regels',
    ]);
  });
});

describe('drafts', () => {
  it('creates, reads, overwrites and deletes', async () => {
    await repositories.drafts.put({
      key: 'wizard',
      kind: 'wizard',
      data: { step: 'players' },
    });

    const loaded = await repositories.drafts.get<{ step: string }>('wizard');
    expect(loaded?.data.step).toBe('players');
    expect(loaded?.updatedAt).toBe('2026-09-19T12:00:00.000Z');

    // One draft per key: the newest write wins.
    await repositories.drafts.put({ key: 'wizard', kind: 'wizard', data: { step: 'teams' } });
    expect((await repositories.drafts.get<{ step: string }>('wizard'))?.data.step).toBe('teams');
    expect(await repositories.drafts.list('wizard')).toHaveLength(1);

    await repositories.drafts.delete('wizard');
    expect(await repositories.drafts.get('wizard')).toBeUndefined();
  });

  it('lists by kind and by game', async () => {
    await repositories.drafts.put({ key: 'wizard', kind: 'wizard', data: {} });
    await repositories.drafts.put({
      key: 'round:game-1',
      kind: 'roundEntry',
      gameId: 'game-1',
      data: { cardPoints: 40 },
    });

    expect((await repositories.drafts.list('roundEntry')).map((item) => item.key)).toEqual([
      'round:game-1',
    ]);
    expect((await repositories.drafts.listByGame('game-1')).map((item) => item.key)).toEqual([
      'round:game-1',
    ]);
    expect(await repositories.drafts.list()).toHaveLength(2);
  });
});

describe('meta', () => {
  it('writes, reads, overwrites and deletes a value', async () => {
    expect(await repositories.meta.get('lastActiveGameId')).toBeUndefined();

    await repositories.meta.set('lastActiveGameId', 'game-1');
    expect(await repositories.meta.get('lastActiveGameId')).toBe('game-1');

    await repositories.meta.set('lastActiveGameId', 'game-2');
    expect(await repositories.meta.get('lastActiveGameId')).toBe('game-2');

    await repositories.meta.delete('lastActiveGameId');
    expect(await repositories.meta.get('lastActiveGameId')).toBeUndefined();
  });

  it('returns every stored key at once', async () => {
    await repositories.meta.set('appVersion', '0.1.0');
    await repositories.meta.set('storagePersisted', true);

    expect(await repositories.meta.all()).toEqual({
      appVersion: '0.1.0',
      storagePersisted: true,
    });
  });

  it('records the schema version', async () => {
    await recordSchemaVersion(repositories);
    expect(await repositories.meta.get('schemaVersion')).toBe(DB_VERSION);
  });
});

describe('transactions', () => {
  it('commits a round and its game metadata together', async () => {
    const game = aGame();
    await repositories.games.create(game);

    await repositories.transaction(['games', 'rounds'], async () => {
      await repositories.rounds.create(aRound(game.id, 1));
      await repositories.games.update({ ...game, updatedAt: '2026-09-19T16:00:00.000Z' });
    });

    expect(await repositories.rounds.listByGame(game.id)).toHaveLength(1);
    expect((await repositories.games.get(game.id))?.updatedAt).toBe('2026-09-19T16:00:00.000Z');
  });

  it('rolls both writes back when one of them fails', async () => {
    const game = aGame();
    await repositories.games.create(game);

    await expect(
      repositories.transaction(['games', 'rounds'], async () => {
        await repositories.rounds.create(aRound(game.id, 1));
        // A game that was never created: this update must abort the transaction.
        await repositories.games.update(aGame({ id: 'spookspel' }));
      }),
    ).rejects.toThrow();

    // No half-saved game: the round is gone too.
    expect(await repositories.rounds.listByGame(game.id)).toEqual([]);
  });
});

describe('stored data is independent of the caller’s objects', () => {
  it('does not change when the caller mutates the object it passed in', async () => {
    const round = aRound('game-1', 1, 100);
    const game = aGame({ id: 'game-1' });
    await repositories.games.create(game);
    await repositories.rounds.create(round);

    round.input.teams[0]!.cardPoints = 9999;

    expect((await repositories.rounds.get(round.id))?.input.teams[0]?.cardPoints).toBe(100);
  });
});
