import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestStorage, type TestStorage } from '@/storage/testing';
import { fixedClock } from '@/storage/time';
import { BUILTIN_RULE_SETS, classic, modernAmerican, twoHanded } from '@/rules/builtin';
import { partyOverrides } from '@/application/viewmodels/setup';
import { createServices, type Services } from './index';

/**
 * The rule set editor's storage side.
 *
 * The guarantee under test throughout: a built-in is a value in code, so every
 * edit lands on a copy and the original is still there, byte for byte, when the
 * test finishes.
 */

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

async function makePreset(name = 'Mijn Classic', sourceId = classic.id) {
  const outcome = await services.ruleSets.createPreset({
    sourceId,
    sourceOrigin: 'builtin',
    name,
  });
  if (!outcome.ok) throw new Error(`kon geen preset maken: ${outcome.reason}`);
  return outcome.preset;
}

describe('creating a preset from a built-in', () => {
  it.each([
    ['Classic', classic],
    ['Modern American', modernAmerican],
    ['Two-Handed', twoHanded],
  ])('clones %s into an editable copy', async (_label, source) => {
    const preset = await makePreset(`Mijn ${source.name}`, source.id);

    expect(preset.origin).toBe('custom');
    expect(preset.locked).toBe(false);
    expect(preset.id).not.toBe(source.id);
    expect(preset.derivedFrom.ruleSetId).toBe(source.id);
    // The clone carries a frozen snapshot, so a later app release cannot move
    // the ground under a preset somebody is already using.
    expect(preset.derivedFrom.snapshot.name).toBe(source.name);
  });

  it('leaves the built-in itself untouched', async () => {
    const before = structuredClone(classic);
    const preset = await makePreset();

    await services.ruleSets.updatePreset({
      id: preset.id,
      overrides: [{ path: 'endGame.targetScore', value: 3000 }],
    });

    expect(classic).toEqual(before);
    const builtin = await services.ruleSets.resolve(classic.id, 'builtin');
    expect(builtin?.configuration.endGame.targetScore).toBe(before.configuration.endGame.targetScore);
  });

  it('never writes a built-in into the presets table', async () => {
    await makePreset();
    const stored = await services.ruleSets.listPresets();
    expect(stored.every((record) => record.origin === 'custom')).toBe(true);
    expect(stored.some((record) => record.id === classic.id)).toBe(false);
  });
});

describe('editing a preset', () => {
  it('saves overrides and resolves them into the rule set', async () => {
    const preset = await makePreset();

    const outcome = await services.ruleSets.updatePreset({
      id: preset.id,
      overrides: [{ path: 'endGame.targetScore', value: 3000 }],
    });

    expect(outcome.ok).toBe(true);
    const resolved = await services.ruleSets.resolve(preset.id, 'custom');
    expect(resolved?.configuration.endGame.targetScore).toBe(3000);
  });

  it('stores a six-player, three-team shape', async () => {
    const preset = await makePreset();

    const outcome = await services.ruleSets.updatePreset({
      id: preset.id,
      overrides: partyOverrides({ playerCount: 6, teamCount: 3, mode: 'partnership' }),
    });

    expect(outcome.ok).toBe(true);
    const resolved = await services.ruleSets.resolve(preset.id, 'custom');
    expect(resolved?.configuration.players.default).toBe(6);
    expect(resolved?.configuration.teams).toEqual({
      mode: 'partnership',
      count: 3,
      teamSize: 2,
    });
  });

  it('refuses an incoherent party and writes nothing', async () => {
    const preset = await makePreset();

    const outcome = await services.ruleSets.updatePreset({
      id: preset.id,
      // Six players that do not divide over two teams of two.
      overrides: [
        { path: 'players.min', value: 6 },
        { path: 'players.max', value: 6 },
        { path: 'players.default', value: 6 },
      ],
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    if (outcome.reason !== 'validation') throw new Error('verwachtte een validatiefout');
    expect(outcome.issues.map((issue) => issue.code)).toContain('party.mismatch');

    const stored = await services.ruleSets.resolve(preset.id, 'custom');
    expect(stored?.configuration.players.default).toBe(4);
  });

  it('refuses an override that points at nothing', async () => {
    const preset = await makePreset();

    const outcome = await services.ruleSets.updatePreset({
      id: preset.id,
      overrides: [{ path: 'endGame.bestaatNiet', value: 1 }],
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unreachable');
    if (outcome.reason !== 'validation') throw new Error('verwachtte een validatiefout');
    expect(outcome.issues.map((issue) => issue.code)).toContain('override.unknownPath');
  });

  it('drops an override that sets a value back to the original', async () => {
    const preset = await makePreset();

    const outcome = await services.ruleSets.updatePreset({
      id: preset.id,
      overrides: [{ path: 'endGame.targetScore', value: classic.configuration.endGame.targetScore }],
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('unreachable');
    expect(outcome.preset.overrides).toEqual([]);
  });

  it('renames without touching the rules', async () => {
    const preset = await makePreset();
    await services.ruleSets.updatePreset({
      id: preset.id,
      overrides: [{ path: 'endGame.targetScore', value: 3000 }],
    });

    const renamed = await services.ruleSets.updatePreset({
      id: preset.id,
      name: 'Donderdagavond',
      overrides: [{ path: 'endGame.targetScore', value: 3000 }],
    });

    expect(renamed.ok).toBe(true);
    if (!renamed.ok) throw new Error('unreachable');
    expect(renamed.preset.name).toBe('Donderdagavond');
    expect(renamed.resolved.configuration.endGame.targetScore).toBe(3000);
  });
});

describe('duplicating and deleting', () => {
  it('duplicates a preset into an independent copy', async () => {
    const preset = await makePreset();
    await services.ruleSets.updatePreset({
      id: preset.id,
      overrides: [{ path: 'endGame.targetScore', value: 3000 }],
    });

    const copy = await services.ruleSets.createPreset({
      sourceId: preset.id,
      sourceOrigin: 'custom',
      name: 'Mijn Classic (kopie)',
    });

    expect(copy.ok).toBe(true);
    if (!copy.ok) throw new Error('unreachable');
    expect(copy.preset.id).not.toBe(preset.id);
    // The copy inherits the edited state, flattened into its own snapshot.
    expect(copy.resolved.configuration.endGame.targetScore).toBe(3000);

    // Editing the copy leaves the original alone.
    await services.ruleSets.updatePreset({
      id: copy.preset.id,
      overrides: [{ path: 'endGame.targetScore', value: 7000 }],
    });
    const original = await services.ruleSets.resolve(preset.id, 'custom');
    expect(original?.configuration.endGame.targetScore).toBe(3000);
  });

  it('deletes a preset and leaves the built-ins listed', async () => {
    const preset = await makePreset();
    await services.ruleSets.removePreset(preset.id);

    expect(await services.ruleSets.listPresets()).toEqual([]);
    const choices = await services.ruleSets.listAvailable();
    expect(choices.filter((choice) => choice.locked)).toHaveLength(BUILTIN_RULE_SETS.size);
  });

  it('cannot delete a built-in: there is no row to delete', async () => {
    await services.ruleSets.removePreset(classic.id);

    const builtin = await services.ruleSets.resolve(classic.id, 'builtin');
    expect(builtin?.name).toBe(classic.name);
    const choices = await services.ruleSets.listAvailable();
    expect(choices.some((choice) => choice.id === classic.id && choice.locked)).toBe(true);
  });

  it('reports an unknown preset rather than inventing one', async () => {
    const outcome = await services.ruleSets.updatePreset({ id: 'bestaat-niet', overrides: [] });
    expect(outcome).toEqual({ ok: false, reason: 'unknownRuleSet' });
  });
});

describe('the wizard list', () => {
  it('shows built-ins as locked and presets as editable', async () => {
    await makePreset('Mijn Classic 6 spelers');

    const choices = await services.ruleSets.listAvailable();
    const builtin = choices.find((choice) => choice.id === classic.id);
    const custom = choices.find((choice) => choice.name === 'Mijn Classic 6 spelers');

    expect(builtin?.locked).toBe(true);
    expect(custom?.locked).toBe(false);
    expect(custom?.origin).toBe('custom');
  });

  it('counts the house rules a preset carries', async () => {
    const preset = await makePreset();
    await services.ruleSets.updatePreset({
      id: preset.id,
      overrides: [
        { path: 'endGame.targetScore', value: 3000 },
        { path: 'deck.jokers', value: 6 },
      ],
    });

    const choices = await services.ruleSets.listAvailable();
    expect(choices.find((choice) => choice.id === preset.id)?.overrideCount).toBe(2);
  });
});
