import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Repositories } from '@/application/ports';
import { createTestStorage, type TestStorage } from '@/storage/testing';
import { classic, modernAmerican } from '@/rules/builtin';
import { freezeForGame } from '@/rules/resolve/resolveRuleSet';
import { recomputeGame } from '@/scoring/recompute';
import { ENGINE_VERSION } from '@/scoring/scoreEngine';
import { makeGame, TEAM_A, TEAM_B, teamInput } from '@/test/fixtures';
import type { Game } from '@/domain/game';
import type { Round } from '@/domain/round';
import type { RuleSet } from '@/rules/schema/ruleSet';

/**
 * Proves that `Game + rule set snapshot + RoundInput + engineVersion` is enough
 * to reconstruct a historical game exactly.
 *
 * This test lives outside `src/storage` on purpose: it calls the scoring engine,
 * which the storage layer itself is forbidden to import. The repositories only
 * store and retrieve; the reconstruction happens here.
 */

let storage: TestStorage;
let repositories: Repositories;

beforeEach(async () => {
  storage = await createTestStorage();
  repositories = storage.repositories;
});

afterEach(async () => {
  await storage.close();
});

function roundFor(gameId: string, number: number, a: number, b: number): Round {
  return {
    id: `${gameId}-r${number}`,
    gameId,
    sequence: number,
    status: 'committed',
    createdAt: `2026-09-19T1${number}:00:00.000Z`,
    updatedAt: `2026-09-19T1${number}:00:00.000Z`,
    input: {
      teams: [
        teamInput(TEAM_A, { cardPoints: a, naturalCanastas: 1, redThrees: 1, opened: true }),
        teamInput(TEAM_B, { cardPoints: b, mixedCanastas: 1, opened: true }),
      ],
    },
  };
}

/** Plays a game into storage, computing scores outside the repository. */
async function persistGame(ruleSet: RuleSet, gameId: string): Promise<Game> {
  const game = makeGame(freezeForGame(ruleSet), { id: gameId });
  const rounds = [
    roundFor(gameId, 1, 420, 300),
    roundFor(gameId, 2, 250, 510),
    roundFor(gameId, 3, 800, 120),
  ];

  // The engine computes; the repository only stores what it is given.
  const { rounds: computed } = recomputeGame({ game, rounds });

  await repositories.transaction(['games', 'rounds'], async () => {
    await repositories.games.create(game);
    for (const round of computed) {
      await repositories.rounds.create(round);
    }
  });

  return game;
}

describe('historical reconstruction', () => {
  it('reproduces a stored game‘s scores exactly from what was persisted', async () => {
    const original = await persistGame(classic, 'game-classic');
    const originalTotals = recomputeGame({
      game: original,
      rounds: [
        roundFor('game-classic', 1, 420, 300),
        roundFor('game-classic', 2, 250, 510),
        roundFor('game-classic', 3, 800, 120),
      ],
    }).projection.totalsByTeam;

    // Nothing but storage is used to get the game back.
    const loadedGame = await repositories.games.get('game-classic');
    const loadedRounds = await repositories.rounds.listByGame('game-classic');

    const replay = recomputeGame({ game: loadedGame!, rounds: loadedRounds });

    expect(replay.projection.totalsByTeam).toEqual(originalTotals);
  });

  it('matches the breakdown that was stored, line for line', async () => {
    await persistGame(classic, 'game-lines');

    const loadedGame = await repositories.games.get('game-lines');
    const loadedRounds = await repositories.rounds.listByGame('game-lines');
    const replay = recomputeGame({ game: loadedGame!, rounds: loadedRounds });

    for (const [index, round] of loadedRounds.entries()) {
      const stored = round.computed!.scores;
      const recomputed = replay.rounds[index]!.computed!.scores;

      expect(recomputed.map((score) => score.total)).toEqual(stored.map((score) => score.total));
      expect(recomputed[0]!.breakdown.lines.map((line) => [line.ruleId, line.value])).toEqual(
        stored[0]!.breakdown.lines.map((line) => [line.ruleId, line.value]),
      );
    }
  });

  it('reconstructs a Modern American game from the same four ingredients', async () => {
    await persistGame(modernAmerican, 'game-modern');

    const loadedGame = await repositories.games.get('game-modern');
    const loadedRounds = await repositories.rounds.listByGame('game-modern');

    // The snapshot, not the current built-in, drives the replay.
    expect(loadedGame!.effectiveRuleSet.configuration.endGame.targetScore).toBe(8500);

    const replay = recomputeGame({ game: loadedGame!, rounds: loadedRounds });
    expect(replay.projection.totalsByTeam[TEAM_A]).toBe(
      loadedRounds.at(-1)!.computed!.scoreAfter[TEAM_A],
    );
  });

  it('replays against the game‘s own snapshot, not the current built-in', async () => {
    // A game played under a house rule that the built-in does not have.
    const houseRules = freezeForGame(classic, [{ path: 'scoring.canastas.natural', value: 750 }]);
    const game = makeGame(houseRules, { id: 'game-huisregels' });
    const rounds = [roundFor('game-huisregels', 1, 0, 0)];

    await repositories.transaction(['games', 'rounds'], async () => {
      await repositories.games.create(game);
      for (const round of recomputeGame({ game, rounds }).rounds) {
        await repositories.rounds.create(round);
      }
    });

    const loadedGame = await repositories.games.get('game-huisregels');
    const loadedRounds = await repositories.rounds.listByGame('game-huisregels');
    const replay = recomputeGame({ game: loadedGame!, rounds: loadedRounds });

    // 750 for the natural canasta plus 100 for one red three — not the
    // built-in's 500, which is still what `classic` says.
    expect(replay.projection.totalsByTeam[TEAM_A]).toBe(850);
    expect(classic.configuration.scoring.canastas.natural).toBe(500);
  });

  it('stores the engine version on the game and on every computation', async () => {
    await persistGame(classic, 'game-engine');

    const loadedGame = await repositories.games.get('game-engine');
    const loadedRounds = await repositories.rounds.listByGame('game-engine');

    expect(loadedGame!.engineVersion).toBe(classic.engineVersion);
    for (const round of loadedRounds) {
      expect(round.computed?.engineVersion).toBe(ENGINE_VERSION);
    }
  });

  it('lets a later engine notice a difference instead of rewriting history', async () => {
    await persistGame(classic, 'game-drift');

    const loadedGame = await repositories.games.get('game-drift');
    const loadedRounds = await repositories.rounds.listByGame('game-drift');

    // Stand in for a future release whose scoring differs.
    const patched = structuredClone(loadedGame!) as Game;
    (patched.effectiveRuleSet as RuleSet).configuration.scoring.canastas.natural = 600;

    const replay = recomputeGame({ game: patched, rounds: loadedRounds });

    const storedTotal = loadedRounds[0]!.computed!.scores[0]!.total;
    const replayedTotal = replay.rounds[0]!.computed!.scores[0]!.total;

    // The difference is detectable, and the stored value is untouched.
    expect(replayedTotal).not.toBe(storedTotal);
    expect((await repositories.rounds.get(loadedRounds[0]!.id))!.computed!.scores[0]!.total).toBe(
      storedTotal,
    );
  });

  it('keeps RoundInput as the source of truth: a stale cache does not survive replay', async () => {
    await persistGame(classic, 'game-cache');

    const rounds = await repositories.rounds.listByGame('game-cache');
    const tampered = structuredClone(rounds[0]!);
    tampered.computed!.scores[0]!.total = 999999;
    await repositories.rounds.update(tampered);

    const loadedGame = await repositories.games.get('game-cache');
    const loadedRounds = await repositories.rounds.listByGame('game-cache');
    const replay = recomputeGame({ game: loadedGame!, rounds: loadedRounds });

    // Recomputation derives from `input`, so the tampered cache is discarded.
    expect(replay.rounds[0]!.computed!.scores[0]!.total).not.toBe(999999);
  });
});
