import { describe, expect, it } from 'vitest';
import { modernAmerican } from './modernAmerican';
import { classic } from './classic';
import { calculateRoundScore } from '@/scoring/scoreEngine';
import { validateRound } from '@/scoring/validateRound';
import { initialMeldRequirement } from '@/rules/initialMeld/thresholds';
import { TEAM_A, TEAM_B, teamInput } from '@/test/fixtures';

type Overrides = Parameters<typeof teamInput>[1];

function score(overrides: Overrides, ruleSet = modernAmerican) {
  const [breakdown] = calculateRoundScore({
    ruleSet,
    teamIds: [TEAM_A, TEAM_B],
    roundNumber: 1,
    inputs: [teamInput(TEAM_A, overrides), teamInput(TEAM_B)],
    scoreBefore: { [TEAM_A]: 0, [TEAM_B]: 0 },
  });
  return breakdown!;
}

function lineValue(overrides: Overrides, ruleId: string): number | undefined {
  return score(overrides).lines.find((line) => line.ruleId === ruleId)?.value;
}

describe('Modern American — the swing table', () => {
  const threes = { redThrees: 2, blackThrees: 1 } satisfies Overrides;

  it('subtracts threes when the team has no canasta', () => {
    expect(lineValue(threes, 'threesSwing')).toBe(-400);
  });

  it('ignores threes when the team has exactly one canasta', () => {
    expect(lineValue({ ...threes, mixedCanastas: 1 }, 'threesSwing')).toBeUndefined();
  });

  it('adds threes when the team has two or more canastas', () => {
    expect(lineValue({ ...threes, mixedCanastas: 2 }, 'threesSwing')).toBe(400);
  });

  it('counts every canasta category towards the swing, not just natural and mixed', () => {
    // One sevens canasta plus one wild canasta is two canastas.
    expect(lineValue({ ...threes, sevensCanastas: 1, wildCanastas: 1 }, 'threesSwing')).toBe(400);
  });

  it('subtracts the melded card points when the team has no canasta', () => {
    expect(lineValue({ cardPoints: 300 }, 'cardPoints')).toBe(-300);
  });

  it('adds the melded card points from one canasta onwards', () => {
    expect(lineValue({ cardPoints: 300, mixedCanastas: 1 }, 'cardPoints')).toBe(300);
  });
});

describe('Modern American — canasta categories', () => {
  it('scores each verified category at its own value', () => {
    expect(lineValue({ naturalCanastas: 1 }, 'naturalCanastaBonus')).toBe(500);
    expect(lineValue({ mixedCanastas: 1 }, 'mixedCanastaBonus')).toBe(300);
    expect(lineValue({ acesCanastas: 1 }, 'acesCanastaBonus')).toBe(2500);
    expect(lineValue({ sevensCanastas: 1 }, 'sevensCanastaBonus')).toBe(2500);
    expect(lineValue({ wildCanastas: 1 }, 'wildCanastaBonus')).toBe(2000);
    expect(lineValue({ jokerCanastas: 1 }, 'jokerCanastaBonus')).toBe(2500);
    expect(lineValue({ twosCanastas: 1 }, 'twosCanastaBonus')).toBe(3000);
  });
});

describe('Modern American — penalties', () => {
  it('subtracts the incomplete-meld penalties by id', () => {
    expect(lineValue({ extra: { incompleteMelds: ['sevens'] } }, 'incompleteMeldPenalty')).toBe(
      -2500,
    );
    expect(
      lineValue({ extra: { incompleteMelds: ['sevens', 'wild'] } }, 'incompleteMeldPenalty'),
    ).toBe(-4500);
  });

  it('warns and scores zero for an unknown penalty id', () => {
    const breakdown = score({ extra: { incompleteMelds: ['samba'] } });
    expect(breakdown.lines.some((line) => line.ruleId === 'incompleteMeldPenalty')).toBe(false);
    expect(breakdown.issues.map((issue) => issue.code)).toContain('sumOver.unknownOption');
  });

  it('penalises three or more aces or sevens in hand', () => {
    expect(lineValue({ extra: { acesInHand: 2 } }, 'acesInHandPenalty')).toBeUndefined();
    expect(lineValue({ extra: { acesInHand: 3 } }, 'acesInHandPenalty')).toBe(-1500);
    expect(lineValue({ extra: { sevensInHand: 4 } }, 'sevensInHandPenalty')).toBe(-1500);
  });
});

describe('Modern American — special hands replace the round score', () => {
  const withSpecialHand = {
    cardPoints: 400,
    naturalCanastas: 1,
    redThrees: 2,
    cardsInHand: 30,
    wentOut: true,
    extra: { specialHands: ['garbage'] },
  } satisfies Overrides;

  it('scores only the special hand, suppressing every other rule', () => {
    const breakdown = score(withSpecialHand);

    expect(breakdown.total).toBe(3000);
    expect(breakdown.lines.map((line) => line.ruleId)).toEqual(['specialHandBonus']);
  });

  it('adds the special hand instead when the mode is switched to "add"', () => {
    // Proof that replace-versus-add is data: one configuration value, no code.
    const additive = structuredClone(modernAmerican);
    additive.configuration.specialHands.mode = 'add';

    const breakdown = score(withSpecialHand, additive);

    // 3000 hand + 400 card points + 500 canasta + 100 going out − 30 in hand.
    expect(breakdown.total).toBe(3970);
    expect(breakdown.lines.map((line) => line.ruleId)).toEqual([
      'specialHandBonus',
      'cardPoints',
      'naturalCanastaBonus',
      'goingOutBonus',
      'handPenalty',
    ]);
  });

  it('lets the opposing team score normally in the same round', () => {
    const [teamA, teamB] = calculateRoundScore({
      ruleSet: modernAmerican,
      teamIds: [TEAM_A, TEAM_B],
      roundNumber: 1,
      inputs: [
        teamInput(TEAM_A, withSpecialHand),
        teamInput(TEAM_B, { cardPoints: 200, mixedCanastas: 1, cardsInHand: 40 }),
      ],
      scoreBefore: { [TEAM_A]: 0, [TEAM_B]: 0 },
    });

    expect(teamA!.total).toBe(3000);
    expect(teamB!.total).toBe(460);
  });

  it('gives the two Dream Hands the value that wins the game outright', () => {
    expect(score({ extra: { specialHands: ['dreamHandPlus4'] } }).total).toBe(8500);
    expect(score({ extra: { specialHands: ['dreamHandPlus5'] } }).total).toBe(8500);
  });
});

describe('Modern American — going out', () => {
  it('rejects going out on fewer than two canastas', () => {
    const issues = validateRound({
      ruleSet: modernAmerican,
      teamIds: [TEAM_A, TEAM_B],
      roundNumber: 1,
      inputs: [teamInput(TEAM_A, { wentOut: true, naturalCanastas: 1 }), teamInput(TEAM_B)],
      scoreBefore: { [TEAM_A]: 0, [TEAM_B]: 0 },
    });

    const issue = issues.find((item) => item.code === 'goOutNeedsTwoCanastas');
    expect(issue?.severity).toBe('error');
    expect(issue?.message).toBe("Uitgaan vereist minimaal 2 Canasta's.");
  });

  it('accepts going out on two canastas of any category', () => {
    const issues = validateRound({
      ruleSet: modernAmerican,
      teamIds: [TEAM_A, TEAM_B],
      roundNumber: 1,
      inputs: [
        teamInput(TEAM_A, { wentOut: true, naturalCanastas: 1, extra: { sevensCanastas: 1 } }),
        teamInput(TEAM_B),
      ],
      scoreBefore: { [TEAM_A]: 0, [TEAM_B]: 0 },
    });

    expect(issues.some((item) => item.code === 'goOutNeedsTwoCanastas')).toBe(false);
  });
});

describe('Modern American — initial meld thresholds', () => {
  it.each([
    [-500, 125],
    [0, 125],
    [2995, 125],
    [3000, 155],
    [4995, 155],
    [5000, 180],
    [99999, 180],
  ])('a score of %i requires %i', (score_, required) => {
    expect(initialMeldRequirement(modernAmerican.configuration, score_)?.required).toBe(required);
  });
});

describe('cross-variant isolation', () => {
  it('scores the same input differently under Classic and Modern American', () => {
    const input = { cardPoints: 420, naturalCanastas: 1, redThrees: 2, opened: true } as const;

    const classicTotal = score(input, classic).total;
    const modernTotal = score(input, modernAmerican).total;

    expect(classicTotal).toBe(1120);
    expect(modernTotal).toBe(920);
    expect(classicTotal).not.toBe(modernTotal);
  });

  it('never emits Modern-only lines under Classic', () => {
    const breakdown = score({ extra: { specialHands: ['garbage'], wildCanastas: 3 } }, classic);
    const ids = breakdown.lines.map((line) => line.ruleId);

    expect(ids).not.toContain('specialHandBonus');
    expect(ids).not.toContain('wildCanastaBonus');
  });
});
