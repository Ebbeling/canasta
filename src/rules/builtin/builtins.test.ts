import { describe, expect, it } from 'vitest';
import { BUILTIN_RULE_SETS } from './index';
import { validateRuleSet } from '@/rules/validation/validateRuleSet';
import { calculateRoundScore } from '@/scoring/scoreEngine';
import { classic } from './classic';
import { modernAmerican } from './modernAmerican';
import { twoHanded } from './twoHanded';
import { TEAM_A, TEAM_B, teamInput } from '@/test/fixtures';

describe('every built-in rule set', () => {
  const ruleSets = [...BUILTIN_RULE_SETS.values()];

  it('covers Classic, Modern American and Two-Handed', () => {
    expect(ruleSets.map((ruleSet) => ruleSet.id).sort()).toEqual([
      'builtin.classic',
      'builtin.modernAmerican',
      'builtin.twoHanded',
    ]);
  });

  it.each(ruleSets.map((ruleSet) => [ruleSet.name, ruleSet] as const))(
    '%s validates with zero errors',
    (_name, ruleSet) => {
      const errors = validateRuleSet(ruleSet).filter((issue) => issue.severity === 'error');
      expect(errors).toEqual([]);
    },
  );

  it.each(ruleSets.map((ruleSet) => [ruleSet.name, ruleSet] as const))(
    '%s is locked and marked as built-in',
    (_name, ruleSet) => {
      expect(ruleSet.locked).toBe(true);
      expect(ruleSet.origin).toBe('builtin');
    },
  );

  it.each(ruleSets.map((ruleSet) => [ruleSet.name, ruleSet] as const))(
    '%s cites a source with a URL and a retrieval date',
    (_name, ruleSet) => {
      expect(ruleSet.source.url).toMatch(/^https:\/\//);
      expect(ruleSet.source.retrievedAt).toBe('2026-09-19');
    },
  );

  it.each(ruleSets.map((ruleSet) => [ruleSet.name, ruleSet] as const))(
    '%s never claims an app choice as a source rule',
    (_name, ruleSet) => {
      // The tie-break is an app policy in every rule set; it must say so.
      const tie = ruleSet.settings.find((setting) => setting.key === 'endGame.winner.tie');
      expect(tie?.status).toBe('app-policy');

      const provenance = ruleSet.provenance.entries.find(
        (entry) => entry.path === 'endGame.winner.tie',
      );
      expect(provenance?.status).toBe('app-policy');
    },
  );
});

describe('the resolved decisions are encoded, not assumed', () => {
  it('fills Modern American setup details from Pagat and says so', () => {
    expect(modernAmerican.configuration.players.default).toBe(4);
    expect(modernAmerican.configuration.teams.count).toBe(2);
    expect(modernAmerican.configuration.deck.standardDecks).toBe(2);
    expect(modernAmerican.configuration.deck.jokers).toBe(4);
    expect(modernAmerican.configuration.deck.totalCards).toBe(108);

    const decks = modernAmerican.provenance.entries.find(
      (entry) => entry.path === 'deck.standardDecks',
    );
    expect(decks?.status).toBe('secondary-source');
    expect(decks?.source?.name).toBe('Pagat');
  });

  it('keeps concealed going out off for Modern American without claiming a ban', () => {
    expect(modernAmerican.configuration.goOut.concealedEnabled).toBe(false);

    const entry = modernAmerican.provenance.entries.find(
      (item) => item.path === 'goOut.concealedEnabled',
    );
    expect(entry?.status).toBe('not-specified');
    expect(entry?.note).toContain('beschrijft verborgen uitgaan niet');
    expect(entry?.note).not.toMatch(/verboden|niet toegestaan/);
  });

  it('keeps The Splash off and marks it as described only by the secondary source', () => {
    expect(modernAmerican.configuration.initialMeld.splashAllowed).toBe(false);
    const entry = modernAmerican.provenance.entries.find(
      (item) => item.path === 'initialMeld.splashAllowed',
    );
    expect(entry?.status).toBe('not-specified');
  });

  it('scores Garbage at the CLA value of 3000', () => {
    const garbage = modernAmerican.configuration.specialHands.hands.find(
      (hand) => hand.id === 'garbage',
    );
    expect(garbage?.bonus).toBe(3000);
  });

  it('follows Pagat on the Classic black three not freezing the pile', () => {
    expect(classic.configuration.threes.black.freezesPile).toBe(false);
    const setting = classic.settings.find((item) => item.key === 'threes.black.freezesPile');
    expect(setting?.editable).toBe(true);
  });
});

describe('Two-Handed inherits Classic and differs only where the source says so', () => {
  it('applies the four documented deltas', () => {
    expect(twoHanded.configuration.players.default).toBe(2);
    expect(twoHanded.configuration.dealing.cardsPerPlayer).toBe(15);
    expect(twoHanded.configuration.dealing.drawCount).toBe(2);
    expect(twoHanded.configuration.goOut.minimumCanastas).toBe(2);
    expect(twoHanded.configuration.endGame.targetScore).toBe(5000);
  });

  it('inherits the Classic scoring, threes and thresholds verbatim', () => {
    expect(twoHanded.configuration.scoring).toEqual(classic.configuration.scoring);
    expect(twoHanded.configuration.threes).toEqual(classic.configuration.threes);
    expect(twoHanded.configuration.initialMeld.thresholds).toEqual(
      classic.configuration.initialMeld.thresholds,
    );
  });

  it('needs no engine code: two one-player teams score through the Classic rules', () => {
    expect(twoHanded.configuration.teams).toEqual({
      mode: 'individual',
      count: 2,
      teamSize: 1,
    });

    const breakdowns = calculateRoundScore({
      ruleSet: twoHanded,
      teamIds: [TEAM_A, TEAM_B],
      roundNumber: 1,
      inputs: [
        teamInput(TEAM_A, { cardPoints: 420, naturalCanastas: 1, opened: true }),
        teamInput(TEAM_B, { cardPoints: 100, opened: true, cardsInHand: 20 }),
      ],
      scoreBefore: { [TEAM_A]: 0, [TEAM_B]: 0 },
    });

    expect(breakdowns.map((breakdown) => breakdown.total)).toEqual([920, 80]);
  });
});
