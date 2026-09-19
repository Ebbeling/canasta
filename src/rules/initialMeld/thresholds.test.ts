import { describe, expect, it } from 'vitest';
import { initialMeldRequirement, validateThresholds } from './thresholds';
import { classic, modernAmerican, twoHanded } from '@/rules/builtin';
import type { InitialMeldThreshold } from '@/rules/schema/configuration';

describe('Classic thresholds — both sides of every boundary', () => {
  // Pagat and Bicycle agree: negative → 15, 0–1495 → 50, 1500–2995 → 90,
  // 3000+ → 120. The earlier specification wrote 1499/2999.
  it.each([
    [-500, 15],
    [-5, 15],
    [-1, 15],
    [0, 50],
    [1490, 50],
    [1495, 50],
    [1500, 90],
    [2995, 90],
    [3000, 120],
    [99999, 120],
  ])('a cumulative score of %i requires %i', (score, required) => {
    expect(initialMeldRequirement(classic.configuration, score)?.required).toBe(required);
  });

  it('resolves a score inside the documented 1496–1499 gap into the next band', () => {
    // Unreachable in practice — every Canasta score is a multiple of 5 — but the
    // lookup must not return null if one ever occurs.
    expect(initialMeldRequirement(classic.configuration, 1497)?.required).toBe(90);
  });

  it('gives Two-Handed the same staircase, as the source states', () => {
    for (const score of [-1, 0, 1495, 1500, 2995, 3000]) {
      expect(initialMeldRequirement(twoHanded.configuration, score)).toEqual(
        initialMeldRequirement(classic.configuration, score),
      );
    }
  });
});

describe('Modern American thresholds', () => {
  it.each([
    [-500, 125],
    [0, 125],
    [2995, 125],
    [3000, 155],
    [4995, 155],
    [5000, 180],
    [12000, 180],
  ])('a cumulative score of %i requires %i', (score, required) => {
    expect(initialMeldRequirement(modernAmerican.configuration, score)?.required).toBe(required);
  });

  it('keeps a negative score at 125, which Pagat states and the CLA leaves open', () => {
    expect(initialMeldRequirement(modernAmerican.configuration, -2000)?.required).toBe(125);
  });
});

describe('disabled initial meld', () => {
  it('returns null', () => {
    const config = structuredClone(classic.configuration);
    config.initialMeld.enabled = false;

    expect(initialMeldRequirement(config, 1000)).toBeNull();
  });
});

describe('validateThresholds', () => {
  const band = (
    minScore: number | null,
    maxScore: number | null,
    required: number,
  ): InitialMeldThreshold => ({ minScore, maxScore, required });

  it('accepts the built-in staircases', () => {
    for (const ruleSet of [classic, modernAmerican, twoHanded]) {
      const errors = validateThresholds(ruleSet.configuration.initialMeld.thresholds).filter(
        (issue) => issue.severity === 'error',
      );
      expect(errors).toEqual([]);
    }
  });

  it('accepts a single unbounded band', () => {
    expect(validateThresholds([band(null, null, 50)])).toEqual([]);
  });

  it('rejects an empty staircase', () => {
    expect(validateThresholds([]).map((issue) => issue.code)).toEqual(['thresholds.empty']);
  });

  it('rejects a staircase that does not start unbounded', () => {
    const codes = validateThresholds([band(0, 1495, 50), band(1500, null, 90)]).map(
      (issue) => issue.code,
    );
    expect(codes).toContain('thresholds.openStart');
  });

  it('rejects a staircase that does not end unbounded', () => {
    const codes = validateThresholds([band(null, 1495, 50), band(1500, 2995, 90)]).map(
      (issue) => issue.code,
    );
    expect(codes).toContain('thresholds.openEnd');
  });

  it('rejects overlapping bands', () => {
    const codes = validateThresholds([band(null, 1500, 50), band(1400, null, 90)]).map(
      (issue) => issue.code,
    );
    expect(codes).toContain('thresholds.overlap');
  });

  it('rejects a band made unreachable by an unbounded predecessor', () => {
    const codes = validateThresholds([band(null, null, 50), band(1500, null, 90)]).map(
      (issue) => issue.code,
    );
    expect(codes).toContain('thresholds.unreachable');
  });

  it('rejects a band whose bounds are inverted', () => {
    const codes = validateThresholds([band(null, -1, 15), band(3000, 1500, 90)]).map(
      (issue) => issue.code,
    );
    expect(codes).toContain('thresholds.inverted');
  });

  it('warns but does not fail on a gap', () => {
    const issues = validateThresholds([band(null, 1495, 50), band(1500, null, 90)]);
    const gap = issues.find((issue) => issue.code === 'thresholds.gap');

    expect(gap?.severity).toBe('warning');
    expect(issues.some((issue) => issue.severity === 'error')).toBe(false);
  });
});
