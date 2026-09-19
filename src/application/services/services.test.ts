import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestStorage, type TestStorage } from '@/storage/testing';
import { fixedClock } from '@/storage/time';
import { BUILTIN_RULE_SETS, classic, modernAmerican, twoHanded } from '@/rules/builtin';
import { cloneRuleSet } from '@/rules/resolve/resolveRuleSet';
import { createServices, type Services } from './index';
import { buildFieldLayout } from '@/application/viewmodels/roundForm';
import { blankInput, writeFieldValue } from '@/application/fields/access';
import type { TeamRoundInput } from '@/domain/round';
import type { CreateGameInput } from './gameService';

let storage: TestStorage;
let services: Services;

beforeEach(async () => {
  storage = await createTestStorage();
  services = createServices({
    repositories: storage.repositories,
    clock: fixedClock(),
    builtins: BUILTIN_RULE_SETS,
  });
});

afterEach(async () => {
  await storage.close();
});

function setupFor(
  ruleSetId: string,
  overrides: CreateGameInput['overrides'] = [],
): CreateGameInput {
  const twoPlayer = ruleSetId === twoHanded.id;
  return {
    ruleSetId,
    ruleSetOrigin: 'builtin',
    playerNames: twoPlayer ? ['Michel', 'Paul'] : ['Michel', 'Paul', 'Anne', 'Karin'],
    teamNames: twoPlayer ? ['Michel', 'Paul'] : ['Michel / Anne', 'Paul / Karin'],
    teamSeats: twoPlayer
      ? [[0], [1]]
      : [
          [0, 2],
          [1, 3],
        ],
    overrides,
  };
}

async function startGame(input = setupFor(classic.id)) {
  const outcome = await services.games.create(input);
  if (!outcome.ok) throw new Error(`Spel starten mislukte: ${JSON.stringify(outcome)}`);
  return outcome.game;
}

/** Builds a round input for every team, seeded from the rule set's own fields. */
function inputsFor(
  gameTeams: { id: string }[],
  ruleSet: typeof classic,
  per: Record<string, unknown> = {},
): TeamRoundInput[] {
  const fields = buildFieldLayout(ruleSet).flatMap((group) => group.fields);
  return gameTeams.map((team) => {
    let input = blankInput(team.id, fields);
    for (const [fieldId, value] of Object.entries(per)) {
      const field = fields.find((item) => item.id === fieldId);
      if (field) input = writeFieldValue(input, field, value as never);
    }
    return input;
  });
}

describe('games.create', () => {
  it('stores the full rule set snapshot, not just an id', async () => {
    const game = await startGame();
    const reloaded = (await services.games.load(game.id))!.game;

    expect(reloaded.effectiveRuleSet.fields.length).toBeGreaterThan(0);
    expect(reloaded.effectiveRuleSet.settings.length).toBeGreaterThan(0);
    expect(reloaded.effectiveRuleSet.scoringRules.length).toBeGreaterThan(0);
    expect(reloaded.effectiveRuleSet.provenance.entries.length).toBeGreaterThan(0);
    expect(reloaded.effectiveRuleSet.source.url).toBe(classic.source.url);
  });

  it('stamps the engine version', async () => {
    const game = await startGame();
    expect(game.engineVersion).toBe(classic.engineVersion);
  });

  it('folds house rules into the snapshot and keeps them for display', async () => {
    const game = await startGame(
      setupFor(classic.id, [{ path: 'endGame.targetScore', value: 3000 }]),
    );

    expect(game.effectiveRuleSet.configuration.endGame.targetScore).toBe(3000);
    expect(game.gameOverrides).toEqual([{ path: 'endGame.targetScore', value: 3000 }]);
  });

  it('ignores an override that sets a value back to its original', async () => {
    const game = await startGame(
      setupFor(classic.id, [{ path: 'endGame.targetScore', value: 5000 }]),
    );
    expect(game.gameOverrides).toEqual([]);
  });

  it('refuses a house rule that breaks the rule set', async () => {
    const outcome = await services.games.create(
      setupFor(classic.id, [{ path: 'endGame.targetScore', value: 0 }]),
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok || outcome.reason !== 'validation') throw new Error('validatiefout verwacht');
    expect(outcome.issues.map((issue) => issue.code)).toContain('targetScorePositive');
  });

  it('refuses an override pointing at a path that does not exist', async () => {
    const outcome = await services.games.create(
      setupFor(classic.id, [{ path: 'scoring.canastas.samba', value: 1500 }]),
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok || outcome.reason !== 'validation') throw new Error('validatiefout verwacht');
    expect(outcome.issues.map((issue) => issue.code)).toContain('override.unknownPath');
  });

  it('refuses a player count the rule set does not allow', async () => {
    const outcome = await services.games.create({
      ...setupFor(classic.id),
      playerNames: ['Michel', 'Paul', 'Anne'],
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok || outcome.reason !== 'validation') throw new Error('validatiefout verwacht');
    expect(outcome.issues.map((issue) => issue.code)).toContain('setup.playerCount');
  });

  it('refuses an unknown rule set', async () => {
    const outcome = await services.games.create(setupFor('builtin.samba'));
    expect(outcome).toEqual({ ok: false, reason: 'unknownRuleSet' });
  });

  it('records the last active game and rule set', async () => {
    const game = await startGame();
    const meta = await services.settings.readMeta();

    expect(meta.lastActiveGameId).toBe(game.id);
    expect(meta.lastUsedRuleSetId).toBe(classic.id);
  });

  it('starts a Two-Handed game as two one-player teams', async () => {
    const game = await startGame(setupFor(twoHanded.id));

    expect(game.players).toHaveLength(2);
    expect(game.teams).toHaveLength(2);
    expect(game.teams.every((team) => team.memberIds.length === 1)).toBe(true);
  });
});

describe('a game is immune to later rule set edits', () => {
  it('keeps its own configuration after the preset it came from changes', async () => {
    const preset = {
      ...cloneRuleSet(classic, { id: 'preset-a', name: 'Regelset A' }),
      overrides: [{ path: 'endGame.targetScore', value: 3000 }],
    };
    await services.ruleSets.savePreset(preset);

    const outcome = await services.games.create({
      ...setupFor(classic.id),
      ruleSetId: 'preset-a',
      ruleSetOrigin: 'custom',
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    await services.ruleSets.savePreset({
      ...preset,
      overrides: [{ path: 'endGame.targetScore', value: 9000 }],
    });

    const reloaded = (await services.games.load(outcome.game.id))!.game;
    expect(reloaded.effectiveRuleSet.configuration.endGame.targetScore).toBe(3000);
  });
});

describe('rounds.saveNew', () => {
  it('saves the round and the updated totals together', async () => {
    const game = await startGame();
    const outcome = await services.rounds.saveNew({
      gameId: game.id,
      inputs: inputsFor(game.teams, classic, { cardPoints: 400, opened: true }),
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.rounds).toHaveLength(1);
    expect(outcome.game.summary?.roundCount).toBe(1);
    expect(outcome.game.summary?.totalsByTeam[game.teams[0]!.id]).toBe(400);
  });

  it('blocks on an error but not on a warning', async () => {
    const game = await startGame();

    // Two teams going out is impossible — an error.
    const blocked = await services.rounds.saveNew({
      gameId: game.id,
      inputs: inputsFor(game.teams, classic, { wentOut: true, opened: true }),
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok && blocked.reason === 'validation') {
      expect(blocked.issues.map((issue) => issue.code)).toContain('round.multipleGoOut');
    }

    // Going out without a canasta is odd but recordable — a warning.
    const inputs = inputsFor(game.teams, classic, { opened: true });
    inputs[0] = { ...inputs[0]!, wentOut: true };
    const allowed = await services.rounds.saveNew({ gameId: game.id, inputs });
    expect(allowed.ok).toBe(true);
  });

  it('finishes the game once a team reaches the target', async () => {
    const game = await startGame();
    const inputs = inputsFor(game.teams, classic, { opened: true });
    inputs[0] = { ...inputs[0]!, cardPoints: 5200 };

    const outcome = await services.rounds.saveNew({ gameId: game.id, inputs });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.game.status).toBe('finished');
    expect(outcome.game.result?.winnerTeamIds).toEqual([game.teams[0]!.id]);
    expect(outcome.game.finishedAt).toBeTruthy();
  });

  it('plays an extra round on an exact tie instead of declaring a winner', async () => {
    const game = await startGame();
    const outcome = await services.rounds.saveNew({
      gameId: game.id,
      inputs: inputsFor(game.teams, classic, { cardPoints: 5200, opened: true }),
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.game.status).toBe('active');
    expect(outcome.game.result).toBeUndefined();
  });

  it('does not rewrite earlier rounds', async () => {
    const game = await startGame();
    const inputs = inputsFor(game.teams, classic, { cardPoints: 100, opened: true });

    const first = await services.rounds.saveNew({ gameId: game.id, inputs });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const firstRoundUpdatedAt = first.rounds[0]!.updatedAt;

    await services.rounds.saveNew({ gameId: game.id, inputs });

    const reloaded = (await services.games.load(game.id))!.rounds;
    expect(reloaded[0]!.updatedAt).toBe(firstRoundUpdatedAt);
  });

  it('clears the draft after saving', async () => {
    const game = await startGame();
    const key = `roundEntry:${game.id}`;
    await services.rounds.saveDraft(key, game.id, {
      inputs: inputsFor(game.teams, classic),
    });
    expect(await services.rounds.loadDraft(key)).toBeDefined();

    await services.rounds.saveNew({
      gameId: game.id,
      inputs: inputsFor(game.teams, classic, { cardPoints: 100, opened: true }),
    });

    expect(await services.rounds.loadDraft(key)).toBeUndefined();
  });

  it('reports a conflict when the game changed elsewhere', async () => {
    const game = await startGame();
    const outcome = await services.rounds.saveNew({
      gameId: game.id,
      inputs: inputsFor(game.teams, classic, { cardPoints: 100, opened: true }),
      expectedUpdatedAt: '1999-01-01T00:00:00.000Z',
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('conflict');
  });
});

describe('rounds.correct', () => {
  async function gameWithThreeRounds() {
    const game = await startGame();
    for (const points of [400, 300, 200]) {
      await services.rounds.saveNew({
        gameId: game.id,
        inputs: inputsFor(game.teams, classic, { cardPoints: points, opened: true }),
      });
    }
    return (await services.games.load(game.id))!;
  }

  it('recomputes every later round', async () => {
    const { game, rounds } = await gameWithThreeRounds();
    const before = rounds.map((round) => round.computed!.scoreAfter[game.teams[0]!.id]);
    expect(before).toEqual([400, 700, 900]);

    const corrected = inputsFor(game.teams, classic, { cardPoints: 600, opened: true });
    const outcome = await services.rounds.correct({
      gameId: game.id,
      roundId: rounds[0]!.id,
      inputs: corrected,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.rounds.map((round) => round.computed!.scoreAfter[game.teams[0]!.id])).toEqual([
      600, 900, 1100,
    ]);
  });

  it('recomputes the initial meld requirement of later rounds', async () => {
    const game = await startGame();
    await services.rounds.saveNew({
      gameId: game.id,
      inputs: inputsFor(game.teams, classic, { cardPoints: 1400, opened: true }),
    });
    await services.rounds.saveNew({
      gameId: game.id,
      inputs: inputsFor(game.teams, classic, { cardPoints: 100, opened: true }),
    });

    const loaded = (await services.games.load(game.id))!;
    expect(loaded.rounds[1]!.computed!.initialMeldRequirement[game.teams[0]!.id]).toBe(50);

    await services.rounds.correct({
      gameId: game.id,
      roundId: loaded.rounds[0]!.id,
      inputs: inputsFor(game.teams, classic, { cardPoints: 1600, opened: true }),
    });

    const after = (await services.games.load(game.id))!;
    expect(after.rounds[1]!.computed!.initialMeldRequirement[game.teams[0]!.id]).toBe(90);
  });

  it('makes a won game active again when the correction removes the win', async () => {
    const game = await startGame();
    const winning = inputsFor(game.teams, classic, { opened: true });
    winning[0] = { ...winning[0]!, cardPoints: 5200 };

    const won = await services.rounds.saveNew({ gameId: game.id, inputs: winning });
    expect(won.ok).toBe(true);
    if (!won.ok) return;
    expect(won.game.status).toBe('finished');

    const reduced = inputsFor(game.teams, classic, { opened: true });
    reduced[0] = { ...reduced[0]!, cardPoints: 1000 };

    const outcome = await services.rounds.correct({
      gameId: game.id,
      roundId: won.rounds[0]!.id,
      inputs: reduced,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.game.status).toBe('active');
    expect(outcome.game.result).toBeUndefined();
    expect(outcome.game.finishedAt).toBeUndefined();
  });

  it('leaves an abandoned game abandoned', async () => {
    const { game, rounds } = await gameWithThreeRounds();
    await services.games.abandon(game.id);

    const outcome = await services.rounds.correct({
      gameId: game.id,
      roundId: rounds[0]!.id,
      inputs: inputsFor(game.teams, classic, { cardPoints: 999, opened: true }),
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.game.status).toBe('abandoned');
  });
});

describe('rounds.remove', () => {
  it('drops the round and recomputes, without renumbering sequences', async () => {
    const game = await startGame();
    for (const points of [100, 200, 300]) {
      await services.rounds.saveNew({
        gameId: game.id,
        inputs: inputsFor(game.teams, classic, { cardPoints: points, opened: true }),
      });
    }
    const loaded = (await services.games.load(game.id))!;

    const outcome = await services.rounds.remove({
      gameId: game.id,
      roundId: loaded.rounds[1]!.id,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.rounds.map((round) => round.sequence)).toEqual([1, 3]);
    expect(outcome.game.summary?.totalsByTeam[game.teams[0]!.id]).toBe(400);
  });
});

describe('ruleSets', () => {
  it('lists the three built-ins with a summary line', async () => {
    const choices = await services.ruleSets.listAvailable();

    expect(choices.map((choice) => choice.id).sort()).toEqual([
      classic.id,
      modernAmerican.id,
      twoHanded.id,
    ]);
    for (const choice of choices) {
      expect(choice.summaryLine).toMatch(/spelers?/);
      expect(choice.locked).toBe(true);
    }
  });

  it('lists a saved preset alongside the built-ins, with its house-rule count', async () => {
    await services.ruleSets.savePreset({
      ...cloneRuleSet(classic, { id: 'preset-1', name: 'Mijn Canasta' }),
      overrides: [{ path: 'endGame.targetScore', value: 3000 }],
    });

    const choices = await services.ruleSets.listAvailable();
    const mine = choices.find((choice) => choice.id === 'preset-1');

    expect(mine?.origin).toBe('custom');
    expect(mine?.locked).toBe(false);
    expect(mine?.overrideCount).toBe(1);
  });
});
