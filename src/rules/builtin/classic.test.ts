import { describe, expect, it } from 'vitest';
import { classic } from './classic';
import { getBuiltinRuleSet } from './index';
import { calculateRoundScore } from '@/scoring/scoreEngine';
import { validateRuleSet } from '@/rules/validation/validateRuleSet';
import { TEAM_A, TEAM_B, teamInput } from '@/test/fixtures';

function scoreClassic(overrides: Parameters<typeof teamInput>[1], ruleSet = classic) {
  const [breakdown] = calculateRoundScore({
    ruleSet,
    teamIds: [TEAM_A, TEAM_B],
    roundNumber: 1,
    inputs: [teamInput(TEAM_A, overrides), teamInput(TEAM_B)],
    scoreBefore: { [TEAM_A]: 0, [TEAM_B]: 0 },
  });
  return breakdown!;
}

describe('Classic Canasta — rule set integrity', () => {
  it('validates with zero errors', () => {
    const issues = validateRuleSet(classic);
    const errors = issues.filter((issue) => issue.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('is deep-frozen in the registry, so nothing can mutate the built-in', () => {
    const registered = getBuiltinRuleSet(classic.id)!;
    expect(Object.isFrozen(registered.configuration.scoring.canastas)).toBe(true);
    expect(() => {
      registered.configuration.scoring.canastas.natural = 999;
    }).toThrow(TypeError);
  });
});

describe('Classic Canasta — the §22 golden case', () => {
  // 420 card points, 35 in hand, one natural canasta, one mixed canasta,
  // two red threes, went out normally. The specification's worked example.
  const breakdown = scoreClassic({
    cardPoints: 420,
    cardsInHand: 35,
    naturalCanastas: 1,
    mixedCanastas: 1,
    redThrees: 2,
    opened: true,
    wentOut: true,
  });

  it('totals 1485', () => {
    expect(breakdown.total).toBe(1485);
  });

  it('produces exactly the six documented lines, in order', () => {
    expect(breakdown.lines.map((line) => [line.ruleId, line.value])).toEqual([
      ['cardPoints', 420],
      ['naturalCanastaBonus', 500],
      ['mixedCanastaBonus', 300],
      ['redThreeBonus', 200],
      ['goingOutBonus', 100],
      ['handPenalty', -35],
    ]);
  });

  it('explains each line from structured detail, not prose', () => {
    const natural = breakdown.lines.find((line) => line.ruleId === 'naturalCanastaBonus');
    expect(natural?.detail).toEqual({ count: 1, unitValue: 500 });
    expect(natural?.explain).toBe("1 natuurlijke Canasta('s)\nBonus: +500 per stuk");
  });

  it('splits into card, bonus and penalty subtotals', () => {
    expect(breakdown.subtotals).toEqual({ cards: 420, bonus: 1100, penalty: -35 });
  });
});

describe('Classic Canasta — verified edge cases', () => {
  it('scores a zero round as zero with no lines', () => {
    const breakdown = scoreClassic({ opened: true });
    expect(breakdown.total).toBe(0);
    expect(breakdown.lines).toEqual([]);
  });

  it('gives 200 for concealed going out, not 300', () => {
    const breakdown = scoreClassic({ opened: true, wentOut: true, concealedGoingOut: true });
    expect(breakdown.lines.filter((line) => line.ruleId === 'goingOutBonus')).toHaveLength(1);
    expect(breakdown.total).toBe(200);
  });

  it('omits the going-out line entirely when the team did not go out', () => {
    const breakdown = scoreClassic({ opened: true, cardPoints: 100 });
    expect(breakdown.lines.some((line) => line.ruleId === 'goingOutBonus')).toBe(false);
  });

  it('counts red threes negative for a team that never melded', () => {
    const breakdown = scoreClassic({ redThrees: 2, opened: false });
    expect(breakdown.total).toBe(-200);
  });

  it('scores four red threes as 800 from the table, not 4 × 100', () => {
    const breakdown = scoreClassic({ redThrees: 4, opened: true });
    expect(breakdown.total).toBe(800);
  });

  it('clamps an impossible red-three count and says so', () => {
    const breakdown = scoreClassic({ redThrees: 5, opened: true });
    expect(breakdown.total).toBe(800);
    expect(breakdown.issues.map((issue) => issue.code)).toContain('lookup.clamped');
  });

  it('skips the hand penalty when the rule set switches it off', () => {
    const noPenalty = structuredClone(classic);
    noPenalty.configuration.penalties.handCardsSubtracted = false;
    const breakdown = scoreClassic({ cardsInHand: 35, opened: true }, noPenalty);
    expect(breakdown.lines.some((line) => line.ruleId === 'handPenalty')).toBe(false);
    expect(breakdown.total).toBe(0);
  });

  it('shifts only the affected line when a house rule changes one value', () => {
    const houseRules = structuredClone(classic);
    houseRules.configuration.scoring.canastas.natural = 600;
    const before = scoreClassic({ naturalCanastas: 1, opened: true });
    const after = scoreClassic({ naturalCanastas: 1, opened: true }, houseRules);
    expect(after.total - before.total).toBe(100);
  });
});
