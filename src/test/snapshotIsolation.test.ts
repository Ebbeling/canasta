import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Repositories } from '@/application/ports';
import { createTestStorage, type TestStorage } from '@/storage/testing';
import { classic } from '@/rules/builtin';
import { cloneRuleSet, freezeForGame, resolveRuleSet } from '@/rules/resolve/resolveRuleSet';
import { makeGame } from '@/test/fixtures';

/**
 * The architecture test for spec §13: a rule set edited after a game began must
 * not change that game.
 *
 * This is the reason a game stores the whole resolved rule set rather than a
 * `ruleSetId` reference.
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

describe('rule set snapshot isolation', () => {
  it('keeps a stored game on its original configuration after the preset changes', async () => {
    // 1. A custom rule set A: Classic with a 3000-point target.
    const presetA = {
      ...cloneRuleSet(classic, {
        id: 'preset-a',
        name: 'Regelset A',
        now: '2026-09-19T12:00:00.000Z',
      }),
      overrides: [{ path: 'endGame.targetScore', value: 3000 }],
    };
    await repositories.presets.create(presetA);

    // 2. A game started with rule set A.
    const game = makeGame(freezeForGame(resolveRuleSet(presetA)), { id: 'game-a' });
    await repositories.games.create(game);

    // 3. Rule set A is edited afterwards, and a separate rule set B appears.
    await repositories.presets.update({
      ...presetA,
      overrides: [
        { path: 'endGame.targetScore', value: 9000 },
        { path: 'scoring.canastas.natural', value: 750 },
      ],
      updatedAt: '2026-09-20T12:00:00.000Z',
    });
    await repositories.presets.create(
      cloneRuleSet(classic, {
        id: 'preset-b',
        name: 'Regelset B',
        now: '2026-09-20T12:00:00.000Z',
      }),
    );

    // 4. The game is read back from storage.
    const reloaded = await repositories.games.get('game-a');

    // 5. It still carries the configuration it was started with.
    expect(reloaded?.effectiveRuleSet.configuration.endGame.targetScore).toBe(3000);
    expect(reloaded?.effectiveRuleSet.configuration.scoring.canastas.natural).toBe(500);

    // While the preset itself has genuinely moved on.
    const editedPreset = await repositories.presets.get('preset-a');
    expect(resolveRuleSet(editedPreset!).configuration.endGame.targetScore).toBe(9000);
  });

  it('survives deletion of the preset it came from', async () => {
    const preset = cloneRuleSet(classic, {
      id: 'preset-weg',
      name: 'Verdwijnt',
      now: '2026-09-19T12:00:00.000Z',
    });
    await repositories.presets.create(preset);

    const game = makeGame(freezeForGame(resolveRuleSet(preset)), { id: 'game-weeskind' });
    await repositories.games.create(game);
    await repositories.presets.delete('preset-weg');

    const reloaded = await repositories.games.get('game-weeskind');

    // The round form and the rules screen are generated from these, so losing
    // them would make the game unopenable rather than merely incomplete.
    expect(reloaded?.effectiveRuleSet.fields.length).toBeGreaterThan(0);
    expect(reloaded?.effectiveRuleSet.settings.length).toBeGreaterThan(0);
    expect(reloaded?.effectiveRuleSet.scoringRules.length).toBeGreaterThan(0);
    expect(reloaded?.effectiveRuleSet.source.url).toBe(classic.source.url);
  });

  it('hands back an immutable snapshot', async () => {
    const game = makeGame(freezeForGame(classic), { id: 'game-bevroren' });
    await repositories.games.create(game);

    const reloaded = await repositories.games.get('game-bevroren');

    expect(Object.isFrozen(reloaded!.effectiveRuleSet.configuration)).toBe(true);
    expect(() => {
      reloaded!.effectiveRuleSet.configuration.endGame.targetScore = 1;
    }).toThrow(TypeError);
  });

  it('does not let one game‘s snapshot leak into another', async () => {
    const strict = freezeForGame(classic, [{ path: 'endGame.targetScore', value: 3000 }]);
    const loose = freezeForGame(classic, [{ path: 'endGame.targetScore', value: 10000 }]);

    await repositories.games.create(makeGame(strict, { id: 'game-strict' }));
    await repositories.games.create(makeGame(loose, { id: 'game-loose' }));

    expect(
      (await repositories.games.get('game-strict'))?.effectiveRuleSet.configuration.endGame
        .targetScore,
    ).toBe(3000);
    expect(
      (await repositories.games.get('game-loose'))?.effectiveRuleSet.configuration.endGame
        .targetScore,
    ).toBe(10000);
  });
});
