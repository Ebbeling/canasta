import { describe, expect, it } from 'vitest';
import {
  applyOverrides,
  cloneRuleSet,
  freezeForGame,
  resolveRuleSet,
  validateOverrides,
} from './resolveRuleSet';
import { classic, getBuiltinRuleSet } from '@/rules/builtin';
import { validateRuleSet } from '@/rules/validation/validateRuleSet';

const cloneOptions = { id: 'custom-1', name: 'Mijn Canasta', now: '2026-09-19T12:00:00.000Z' };

describe('cloning a built-in', () => {
  it('produces an unlocked custom rule set with no overrides yet', () => {
    const record = cloneRuleSet(classic, cloneOptions);

    expect(record.id).toBe('custom-1');
    expect(record.origin).toBe('custom');
    expect(record.locked).toBe(false);
    expect(record.overrides).toEqual([]);
    expect(record.derivedFrom.ruleSetId).toBe('builtin.classic');
  });

  it('keeps a frozen snapshot of the source', () => {
    const record = cloneRuleSet(classic, cloneOptions);

    expect(record.derivedFrom.snapshot.configuration.scoring.canastas).toEqual(
      classic.configuration.scoring.canastas,
    );
    expect(Object.isFrozen(record.derivedFrom.snapshot.configuration)).toBe(true);
  });

  it('cannot mutate the built-in it came from', () => {
    const record = cloneRuleSet(classic, cloneOptions);
    const resolved = resolveRuleSet({
      ...record,
      overrides: [{ path: 'scoring.canastas.natural', value: 600 }],
    });

    expect(resolved.configuration.scoring.canastas.natural).toBe(600);
    expect(getBuiltinRuleSet('builtin.classic')!.configuration.scoring.canastas.natural).toBe(500);
  });
});

describe('overrides', () => {
  it('resolves every override and keeps the count for the house-rules badge', () => {
    const record = {
      ...cloneRuleSet(classic, cloneOptions),
      overrides: [
        { path: 'endGame.targetScore', value: 3000 },
        { path: 'scoring.goingOut.normal', value: 200 },
      ],
    };

    const resolved = resolveRuleSet(record);
    expect(resolved.configuration.endGame.targetScore).toBe(3000);
    expect(resolved.configuration.scoring.goingOut.normal).toBe(200);
    expect(record.overrides).toHaveLength(2);
  });

  it('replaces an array wholesale rather than merging element-wise', () => {
    const resolved = applyOverrides(classic, [
      { path: 'threes.red.valueByCount', value: [0, 50, 100] },
    ]);

    expect(resolved.configuration.threes.red.valueByCount).toEqual([0, 50, 100]);
  });

  it('rejects an override that points at a path the configuration does not have', () => {
    const issues = validateOverrides(classic, [{ path: 'scoring.canastas.samba', value: 1500 }]);

    expect(issues.map((issue) => issue.code)).toEqual(['override.unknownPath']);
  });

  it('produces a custom rule set that still validates', () => {
    const resolved = resolveRuleSet({
      ...cloneRuleSet(classic, cloneOptions),
      overrides: [{ path: 'endGame.targetScore', value: 3000 }],
    });

    const errors = validateRuleSet(resolved).filter((issue) => issue.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('catches a house rule that breaks the rule set', () => {
    const resolved = resolveRuleSet({
      ...cloneRuleSet(classic, cloneOptions),
      overrides: [{ path: 'endGame.targetScore', value: 0 }],
    });

    const errors = validateRuleSet(resolved).filter((issue) => issue.severity === 'error');
    expect(errors.map((issue) => issue.code)).toContain('targetScorePositive');
  });

  it('flattens a clone of a clone against the resolved parent', () => {
    const first = {
      ...cloneRuleSet(classic, cloneOptions),
      overrides: [{ path: 'endGame.targetScore', value: 3000 }],
    };
    const second = cloneRuleSet(resolveRuleSet(first), { id: 'custom-2', name: 'Nog eentje' });

    expect(second.derivedFrom.snapshot.configuration.endGame.targetScore).toBe(3000);
    expect(second.overrides).toEqual([]);
  });
});

describe('freezing a rule set for a game (§13)', () => {
  it('stores the whole rule set, not just its configuration', () => {
    const frozen = freezeForGame(classic);

    expect(frozen.fields.length).toBeGreaterThan(0);
    expect(frozen.settings.length).toBeGreaterThan(0);
    expect(frozen.scoringRules.length).toBeGreaterThan(0);
    expect(frozen.source.url).toBe(classic.source.url);
  });

  it('folds game-level house rules in and freezes the result', () => {
    const frozen = freezeForGame(classic, [{ path: 'endGame.targetScore', value: 3000 }]);

    expect(frozen.configuration.endGame.targetScore).toBe(3000);
    expect(() => {
      frozen.configuration.endGame.targetScore = 9999;
    }).toThrow(TypeError);
  });

  it('is unaffected by later edits to the preset it came from', () => {
    const record = {
      ...cloneRuleSet(classic, cloneOptions),
      overrides: [{ path: 'endGame.targetScore', value: 3000 }],
    };
    const frozen = freezeForGame(resolveRuleSet(record));

    // The preset moves on; the started game must not.
    const editedLater = resolveRuleSet({
      ...record,
      overrides: [{ path: 'endGame.targetScore', value: 7000 }],
    });

    expect(editedLater.configuration.endGame.targetScore).toBe(7000);
    expect(frozen.configuration.endGame.targetScore).toBe(3000);
  });
});
