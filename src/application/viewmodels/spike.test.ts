import { describe, expect, it } from 'vitest';
import { classic, modernAmerican, twoHanded } from '@/rules/builtin';
import { buildFieldLayout, visibleFields } from './roundForm';
import { describeRuleSet } from './rulesView';
import { blankInput, readFieldValue, writeFieldValue } from '@/application/fields/access';

/**
 * The spike: can the rules screen and the round form be produced from rule-set
 * data alone, for all three built-ins?
 *
 * If a case here needs a special branch, the answer is to extend the declarative
 * metadata — never to add an exception in React.
 */

const RULE_SETS = [
  ['Classic', classic],
  ['Modern American', modernAmerican],
  ['Two-Handed', twoHanded],
] as const;

describe.each(RULE_SETS)('%s — round form from metadata alone', (_name, ruleSet) => {
  const groups = buildFieldLayout(ruleSet);
  const fields = visibleFields(ruleSet);

  it('produces at least one group of fields', () => {
    expect(groups.length).toBeGreaterThan(0);
    expect(fields.length).toBeGreaterThan(0);
  });

  it('gives every group a Dutch title', () => {
    for (const group of groups) {
      expect(group.title).toBeTruthy();
      expect(group.title).not.toBe(group.category);
    }
  });

  it('gives every field a label, a known type and an input mode', () => {
    for (const field of fields) {
      expect(field.label).toBeTruthy();
      expect(['points', 'count', 'choice', 'boolean', 'multiselect']).toContain(field.type);
      expect(['numeric', 'none']).toContain(field.inputMode);
    }
  });

  it('resolves options for every multiselect', () => {
    for (const field of fields.filter((item) => item.type === 'multiselect')) {
      expect(field.options.length).toBeGreaterThan(0);
      for (const option of field.options) {
        expect(option.value).toBeTruthy();
        expect(option.label).toBeTruthy();
        // A label that equals its id means the option metadata is missing.
        expect(option.label).not.toBe(option.value);
      }
    }
  });

  it('can seed and round-trip a blank input for every field', () => {
    let input = blankInput('team-a', fields);

    for (const field of fields) {
      expect(readFieldValue(input, field.id)).toEqual(field.defaultValue);
    }

    // Writing one field leaves every other one untouched.
    const first = fields[0]!;
    input = writeFieldValue(input, first, first.type === 'boolean' ? true : 7);
    for (const field of fields.slice(1)) {
      expect(readFieldValue(input, field.id)).toEqual(field.defaultValue);
    }
  });

  it('routes non-canonical fields into extra', () => {
    const input = blankInput('team-a', fields);
    for (const field of fields) {
      const inExtra = Object.prototype.hasOwnProperty.call(input.extra, field.id);
      expect(inExtra).toBe(field.isExtra);
    }
  });
});

describe.each(RULE_SETS)('%s — rules screen from metadata alone', (_name, ruleSet) => {
  const description = describeRuleSet(ruleSet);

  it('produces a headline and a summary line', () => {
    expect(description.headline).toBe(ruleSet.name);
    expect(description.summaryLine).toMatch(/spelers?/);
    expect(description.summaryLine).toMatch(/punten/);
  });

  it('gives every part of the summary line its own unit', () => {
    // Guards against a bare "13" where "13 kaarten per speler" belongs: every
    // segment must carry a word, not just a number.
    for (const segment of description.summaryLine.split(' · ')) {
      expect(segment).toMatch(/[a-z]/i);
    }
  });

  it('never leaks a raw configuration path into the summary', () => {
    expect(description.summaryLine).not.toMatch(/[a-z]+\.[a-z]+/i);
  });

  it('groups settings into titled sections, with no empty section', () => {
    expect(description.sections.length).toBeGreaterThan(0);
    for (const section of description.sections) {
      expect(section.title).toBeTruthy();
      expect(section.values.length).toBeGreaterThan(0);
    }
  });

  it('covers every visible setting exactly once', () => {
    const rendered = description.sections.flatMap((section) => section.values.map((v) => v.key));
    expect(new Set(rendered).size).toBe(rendered.length);
    expect(rendered.length).toBeGreaterThanOrEqual(description.sections.length);
  });

  it('formats every value into readable text, never "[object Object]"', () => {
    for (const section of description.sections) {
      for (const value of section.values) {
        expect(value.valueText).toBeTruthy();
        expect(value.valueText).not.toContain('[object');
        expect(value.label).toBeTruthy();
        expect(value.effectLabel).toBeTruthy();
        expect(value.badge.label).toBeTruthy();
      }
    }
  });

  it('flattens tables and threshold staircases into labelled rows', () => {
    const tables = description.sections
      .flatMap((section) => section.values)
      .filter((value) => value.type === 'numberTable' || value.type === 'thresholds');

    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      expect(table.rows?.length).toBeGreaterThan(0);
      for (const row of table.rows ?? []) {
        expect(row.label).toBeTruthy();
        expect(row.valueText).toBeTruthy();
      }
    }
  });

  it('names its source with a URL and a retrieval date', () => {
    expect(description.source.url).toMatch(/^https:\/\//);
    expect(description.source.retrievedAt).toBe('2026-09-19');
  });

  it('labels every capability in Dutch', () => {
    expect(description.capabilities.length).toBeGreaterThan(0);
    for (const capability of description.capabilities) {
      expect(capability.label).not.toBe(capability.key);
    }
  });

  it('discloses every non-verified value with its own explanation', () => {
    expect(description.caveats.length).toBeGreaterThan(0);
    for (const caveat of description.caveats) {
      expect(caveat.badge.status).not.toBe('verified');
      expect(caveat.badge.note).toBeTruthy();
      expect(caveat.badge.meaning).toBeTruthy();
    }
  });

  it('gives every caveat a human label, never a raw configuration path', () => {
    // A path here means the rule set records provenance for something it never
    // declares as a setting — the fix is metadata, not a fallback in the UI.
    for (const caveat of description.caveats) {
      expect(caveat.label).not.toBe(caveat.key);
      expect(caveat.label).not.toMatch(/\./);
    }
  });
});

describe('the rules screen never presents an app choice as a rule', () => {
  it('marks the tie-break as an app policy and explains it verbatim', () => {
    const description = describeRuleSet(classic);
    const tie = description.sections
      .flatMap((section) => section.values)
      .find((value) => value.key === 'endGame.winner.tie');

    expect(tie?.badge.status).toBe('app-policy');
    expect(tie?.badge.label).toBe('Keuze van de app');
    expect(tie?.badge.note).toContain('Geen enkele bron beschrijft een exact gelijkspel');
    // The value itself reads as a Dutch choice, not as an enum member.
    expect(tie?.valueText).toBe('Extra ronde spelen');
  });

  it('reports concealed going out in Modern American as undescribed, not as banned', () => {
    const description = describeRuleSet(modernAmerican);
    const caveat = description.caveats.find((item) => item.key === 'goOut.concealedEnabled');

    expect(caveat?.badge.status).toBe('not-specified');
    expect(caveat?.badge.note).toContain('beschrijft verborgen uitgaan niet');
    expect(caveat?.badge.note).not.toMatch(/verboden|niet toegestaan/);
    expect(caveat?.badge.configurable).toBe(true);
  });

  it('credits Pagat for the Modern American setup values it supplied', () => {
    const description = describeRuleSet(modernAmerican);
    const decks = description.caveats.find((item) => item.key === 'deck.standardDecks');

    expect(decks?.badge.status).toBe('secondary-source');
    expect(decks?.badge.source?.name).toBe('Pagat');
  });
});

describe('house rules are reflected, not hidden', () => {
  it('counts overrides in the headline and labels them', () => {
    const description = describeRuleSet(classic, {
      overrides: [
        { path: 'endGame.targetScore', value: 3000 },
        { path: 'scoring.canastas.natural', value: 600 },
      ],
    });

    expect(description.headline).toBe('Classic Canasta · 2 huisregels');
    expect(description.overrides.map((item) => item.label)).toEqual([
      'Doelscore',
      'Natuurlijke Canasta',
    ]);
    expect(description.overrides[0]?.valueText).toBe('3.000');
  });

  it('marks the affected settings as overridden', () => {
    const description = describeRuleSet(classic, {
      overrides: [{ path: 'endGame.targetScore', value: 3000 }],
    });
    const target = description.sections
      .flatMap((section) => section.values)
      .find((value) => value.key === 'endGame.targetScore');

    expect(target?.overridden).toBe(true);
  });
});

describe('the three variants genuinely differ, from data alone', () => {
  it('shows Modern-only fields only under Modern American', () => {
    const classicIds = visibleFields(classic).map((field) => field.id);
    const modernIds = visibleFields(modernAmerican).map((field) => field.id);

    expect(modernIds).toContain('wildCanastas');
    expect(modernIds).toContain('specialHands');
    expect(classicIds).not.toContain('wildCanastas');
    expect(classicIds).not.toContain('specialHands');
  });

  it('hides concealed going out where the rule set switches it off', () => {
    expect(visibleFields(classic).map((field) => field.id)).toContain('concealedGoingOut');
    expect(visibleFields(modernAmerican).map((field) => field.id)).not.toContain(
      'concealedGoingOut',
    );
  });

  it('describes Two-Handed as a two-player game without a team count', () => {
    const description = describeRuleSet(twoHanded);
    expect(description.summaryLine).toContain('2 spelers');
    expect(description.summaryFacts.map((fact) => fact.label)).not.toContain('Teams');
  });

  it('shows each variant its own target score', () => {
    expect(describeRuleSet(classic).summaryLine).toContain('5.000');
    expect(describeRuleSet(modernAmerican).summaryLine).toContain('8.500');
    expect(describeRuleSet(twoHanded).summaryLine).toContain('5.000');
  });
});
