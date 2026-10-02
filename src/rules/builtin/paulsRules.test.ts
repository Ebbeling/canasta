import { describe, expect, it } from 'vitest';
import type { Round, TeamRoundInput } from '@/domain/round';
import { validateRuleSet } from '@/rules/validation/validateRuleSet';
import { freezeForGame } from '@/rules/resolve/resolveRuleSet';
import { buildFieldLayout, visibleFields } from '@/application/viewmodels/roundForm';
import { calculateRoundScore } from '@/scoring/scoreEngine';
import { evaluateRound } from '@/scoring/evaluateRound';
import { recomputeGame } from '@/scoring/recompute';
import { makeGame, TEAM_A, TEAM_B, teamInput } from '@/test/fixtures';
import { classic } from './classic';
import { paulsRules } from './paulsRules';

/**
 * Paul's regels.
 *
 * Six things are Paul's, and they are what this file pins down: 26 cards out
 * of six decks, an opening of thirty points times the round number, red threes
 * at −300 and black at −100 a piece and always negative, a hundred for going
 * out, no concealed going out at all, and a game over an agreed number of
 * rounds with no target score anywhere in sight.
 *
 * Everything else is Classic's, and that is tested here too — not because it
 * is interesting, but because "inherited" has to mean inherited rather than
 * retyped-and-drifted.
 */

const game = makeGame(freezeForGame(paulsRules));

function score(input: Partial<TeamRoundInput>, roundNumber = 1): number {
  const [breakdown] = calculateRoundScore({
    ruleSet: paulsRules,
    teamIds: [TEAM_A],
    roundNumber,
    inputs: [teamInput(TEAM_A, input)],
    scoreBefore: { [TEAM_A]: 0 },
  });
  return breakdown?.total ?? 0;
}

function round(
  sequence: number,
  a: Partial<TeamRoundInput>,
  b: Partial<TeamRoundInput> = {},
): Round {
  return {
    id: `round-${sequence}`,
    gameId: 'game-1',
    sequence,
    status: 'committed',
    createdAt: '2026-09-19T10:00:00.000Z',
    updatedAt: '2026-09-19T10:00:00.000Z',
    input: { teams: [teamInput(TEAM_A, a), teamInput(TEAM_B, b)] },
  };
}

/** `n` rounds in which A scores `a` card points and B scores `b`. */
function rounds(n: number, a: number, b: number): Round[] {
  return Array.from({ length: n }, (_unused, index) =>
    round(index + 1, { cardPoints: a }, { cardPoints: b }),
  );
}

describe('the rule set itself', () => {
  it('is a locked built-in with its own identity', () => {
    expect(paulsRules.id).toBe('builtin.paulsRules');
    expect(paulsRules.name).toBe("Paul's regels");
    expect(paulsRules.origin).toBe('builtin');
    expect(paulsRules.locked).toBe(true);
  });

  it('validates with zero errors', () => {
    const errors = validateRuleSet(paulsRules).filter((issue) => issue.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('deals 26 cards per player from six decks', () => {
    expect(paulsRules.configuration.dealing.cardsPerPlayer).toBe(26);
    expect(paulsRules.configuration.deck.standardDecks).toBe(6);
    expect(paulsRules.configuration.deck.jokers).toBe(12);
    expect(paulsRules.configuration.deck.totalCards).toBe(324);
  });

  it('says plainly that it has no published source', () => {
    expect(paulsRules.source.url).toBeUndefined();
    expect(paulsRules.provenance.notes).toContain('huisregels');
  });

  it('marks every value it borrowed from Classic as not described', () => {
    const borrowed = paulsRules.provenance.entries.filter(
      (entry) => entry.status === 'not-specified',
    );

    expect(borrowed.length).toBeGreaterThan(0);
    for (const entry of borrowed) {
      expect(entry.note).toBeTruthy();
    }

    // Everything taken from Classic says so by naming Classic's own source.
    const fromClassic = borrowed.filter((entry) => entry.path !== 'deck.jokers');
    for (const entry of fromClassic) {
      expect(entry.source?.name).toBe(classic.source.name);
    }
  });

  it('claims no source for the figure it simply multiplied', () => {
    // Twelve jokers is six decks times two. Attributing that to Pagat would be
    // dressing arithmetic up as a rule somebody wrote down.
    const jokers = paulsRules.provenance.entries.find((entry) => entry.path === 'deck.jokers');

    expect(jokers?.status).toBe('not-specified');
    expect(jokers?.source).toBeUndefined();
    expect(jokers?.note).toContain('6 × 2');
  });
});

describe('the opening requirement grows with the round', () => {
  function opening(roundNumber: number, scoreBefore = 0): number | null {
    const computation = evaluateRound({
      ruleSet: paulsRules,
      teamIds: [TEAM_A],
      roundNumber,
      inputs: [teamInput(TEAM_A, {})],
      scoreBefore: { [TEAM_A]: scoreBefore },
    });
    return computation.initialMeldRequirement[TEAM_A] ?? null;
  }

  it.each([
    [1, 30],
    [2, 60],
    [3, 90],
    [4, 120],
    [5, 150],
    [10, 300],
  ])('asks %i × 30 in round %i', (roundNumber, required) => {
    expect(opening(roundNumber)).toBe(required);
  });

  it('keeps counting past the rounds anyone wrote down', () => {
    // The point of a formula rather than a staircase: there is no last band to
    // fall off, so a game that runs long is still answered.
    expect(opening(17)).toBe(510);
    expect(opening(40)).toBe(1200);
  });

  it('ignores the standings, where Classic would not', () => {
    expect(opening(3, 0)).toBe(90);
    expect(opening(3, 4000)).toBe(90);
    expect(opening(3, -500)).toBe(90);
  });

  it('asks every team the same number', () => {
    const computation = evaluateRound({
      ruleSet: paulsRules,
      teamIds: [TEAM_A, TEAM_B],
      roundNumber: 6,
      inputs: [teamInput(TEAM_A, {}), teamInput(TEAM_B, {})],
      scoreBefore: { [TEAM_A]: 3200, [TEAM_B]: 100 },
    });

    expect(computation.initialMeldRequirement[TEAM_A]).toBe(180);
    expect(computation.initialMeldRequirement[TEAM_B]).toBe(180);
  });

  it('leaves Classic on its staircase', () => {
    const computation = evaluateRound({
      ruleSet: classic,
      teamIds: [TEAM_A],
      roundNumber: 7,
      inputs: [teamInput(TEAM_A, {})],
      scoreBefore: { [TEAM_A]: 1600 },
    });

    expect(computation.initialMeldRequirement[TEAM_A]).toBe(90);
  });
});

describe('threes are a penalty, always', () => {
  it.each([
    [0, 0],
    [1, -300],
    [2, -600],
    [3, -900],
  ])('scores %i red three(s) as %i', (redThrees, total) => {
    expect(score({ redThrees })).toBe(total);
  });

  it.each([
    [0, 0],
    [1, -100],
    [2, -200],
    [3, -300],
  ])('scores %i black three(s) as %i', (blackThrees, total) => {
    expect(score({ extra: { blackThrees } })).toBe(total);
  });

  it('adds both kinds up: two red and three black is −900', () => {
    expect(score({ redThrees: 2, extra: { blackThrees: 3 } })).toBe(-900);
  });

  it('stays negative whether or not the team opened', () => {
    // Classic flips the sign of a red three on `opened`. Here there is no sign
    // to flip, so the two inputs must give the same answer.
    expect(score({ redThrees: 2, opened: true })).toBe(-600);
    expect(score({ redThrees: 2, opened: false })).toBe(-600);
  });

  it('stays negative whatever the canastas say', () => {
    // Modern American swings threes on the canasta count. This does not.
    expect(score({ redThrees: 1, naturalCanastas: 2, mixedCanastas: 2 })).toBe(1600 - 300);
    expect(score({ redThrees: 1 })).toBe(-300);
  });

  it('does not read the Classic condition at all', () => {
    expect(paulsRules.configuration.threes.red.requiresMeld).toBe(false);
    expect(paulsRules.configuration.threes.swingWithCanastas).toBe(false);

    const rule = paulsRules.scoringRules.find((item) => item.id === 'redThreePenalty');
    expect(JSON.stringify(rule)).not.toContain('requiresMeld');
    expect(JSON.stringify(rule)).not.toContain('opened');
  });

  it('counts the twelve threes six decks actually contain', () => {
    expect(score({ redThrees: 12 })).toBe(-3600);
    expect(score({ extra: { blackThrees: 12 } })).toBe(-1200);
  });

  it('leaves Classic alone: there, an opened team scores its red threes', () => {
    const [breakdown] = calculateRoundScore({
      ruleSet: classic,
      teamIds: [TEAM_A],
      roundNumber: 1,
      inputs: [teamInput(TEAM_A, { redThrees: 2, opened: true })],
      scoreBefore: { [TEAM_A]: 0 },
    });

    expect(breakdown?.total).toBe(200);
  });
});

describe('going out', () => {
  it('is worth 100', () => {
    expect(score({ wentOut: true, naturalCanastas: 1 })).toBe(600);
    expect(paulsRules.configuration.scoring.goingOut.normal).toBe(100);
  });

  it('cannot be concealed: there is no extra bonus to collect', () => {
    expect(paulsRules.configuration.goOut.concealedEnabled).toBe(false);
    expect(paulsRules.capabilities.concealedGoingOut).toBe(false);

    const plain = score({ wentOut: true, naturalCanastas: 1 });
    const claimed = score({ wentOut: true, naturalCanastas: 1, concealedGoingOut: true });
    expect(claimed).toBe(plain);
  });

  it('is never offered in the round form', () => {
    // No special case anywhere: the field's own `visibleWhen` reads a
    // capability that is off, which is the mechanism that already existed.
    const ids = visibleFields(paulsRules).map((field) => field.id);
    expect(ids).not.toContain('concealedGoingOut');
    expect(ids).toContain('blackThrees');
    expect(ids).toContain('redThrees');

    const labels = buildFieldLayout(paulsRules)
      .flatMap((group) => group.fields)
      .map((field) => field.label);
    expect(labels.join(' ')).not.toMatch(/[Vv]erborgen/);
  });

  it('keeps the field definition, so nothing in the UI had to learn about it', () => {
    expect(paulsRules.fields.some((field) => field.id === 'concealedGoingOut')).toBe(true);
  });
});

describe('a round, scored end to end', () => {
  it('adds cards, canastas and going out, then subtracts the hand and the threes', () => {
    const total = score({
      cardPoints: 420,
      naturalCanastas: 1,
      mixedCanastas: 1,
      redThrees: 1,
      extra: { blackThrees: 2 },
      wentOut: true,
      cardsInHand: 0,
    });

    // 420 + 500 + 300 + 100 − 300 − 200
    expect(total).toBe(820);
  });

  it('subtracts the cards still in hand', () => {
    expect(score({ cardPoints: 400, cardsInHand: 55 })).toBe(345);
  });
});

describe('the game ends on rounds, not on a score', () => {
  it('has no target score to reach', () => {
    expect(paulsRules.configuration.endGame.mode).toBe('plannedRounds');
    expect(paulsRules.configuration.endGame.plannedRounds).toBe(10);
    expect(paulsRules.settings.some((setting) => setting.key === 'endGame.targetScore')).toBe(
      false,
    );
  });

  it('keeps running after a total that would have ended Classic', () => {
    // Nine rounds of 800 is 7.200 — past Classic's 5.000 and Modern
    // American's 8.500 is still ahead. Neither figure means anything here.
    const { projection } = recomputeGame({ game, rounds: rounds(9, 800, 700) });

    expect(projection.totalsByTeam[TEAM_A]).toBe(7200);
    expect(projection.status).toBe('active');
    expect(projection.endState.kind).toBe('inProgress');
  });

  it('is not finished after round 9', () => {
    const { projection } = recomputeGame({ game, rounds: rounds(9, 500, 400) });

    expect(projection.status).toBe('active');
    expect(projection.result).toBeUndefined();
  });

  it('is finished after round 10', () => {
    const { projection } = recomputeGame({ game, rounds: rounds(10, 500, 400) });

    expect(projection.status).toBe('finished');
    expect(projection.result?.decidedAfterRound).toBe(10);
  });

  it('offers no eleventh round', () => {
    const { projection } = recomputeGame({ game, rounds: rounds(10, 500, 400) });

    // `canAddRound` on the scoreboard is exactly this: a finished game takes
    // no more rounds.
    expect(projection.status).toBe('finished');
  });

  it('reports the round count as the objective while it runs', () => {
    const { projection } = recomputeGame({ game, rounds: rounds(3, 500, 400) });

    expect(projection.endState).toEqual({
      kind: 'inProgress',
      objective: { kind: 'plannedRounds', plannedRounds: 10, roundsPlayed: 3 },
    });
  });

  it('follows a house rule that shortens the game', () => {
    // The round count is ordinary game configuration, so a game may deviate on
    // it through the same override pipeline as any other setting.
    const short = makeGame(
      freezeForGame(paulsRules, [{ path: 'endGame.plannedRounds', value: 4 }]),
    );
    const { projection } = recomputeGame({ game: short, rounds: rounds(4, 500, 400) });

    expect(projection.status).toBe('finished');
    expect(projection.result?.decidedAfterRound).toBe(4);
  });
});

describe('the winner is the highest total over all rounds', () => {
  /** The brief's own example: A 4820, B 5140 — B wins on the sum. */
  const example: Round[] = [
    round(1, { cardPoints: 2000 }, { cardPoints: 1000 }),
    round(2, { cardPoints: 1000 }, { cardPoints: 2000 }),
    round(3, { cardPoints: 1000 }, { cardPoints: 1000 }),
    round(4, { cardPoints: 500 }, { cardPoints: 800 }),
    round(5, { cardPoints: 320 }, { cardPoints: 340 }),
    ...Array.from({ length: 5 }, (_unused, index) =>
      round(index + 6, { cardPoints: 0 }, { cardPoints: 0 }),
    ),
  ];

  it('adds every round up and crowns the larger sum', () => {
    const { projection } = recomputeGame({ game, rounds: example });

    expect(projection.totalsByTeam[TEAM_A]).toBe(4820);
    expect(projection.totalsByTeam[TEAM_B]).toBe(5140);
    expect(projection.result?.winnerTeamIds).toEqual([TEAM_B]);
    expect(projection.result?.tie).toBe(false);
  });

  it('is not the winner of the last round', () => {
    // A takes the final round by 500 and still loses the game.
    const lastRoundSwing: Round[] = [
      ...rounds(9, 100, 400),
      round(10, { cardPoints: 600 }, { cardPoints: 100 }),
    ];
    const { projection } = recomputeGame({ game, rounds: lastRoundSwing });

    expect(projection.totalsByTeam[TEAM_A]).toBe(1500);
    expect(projection.totalsByTeam[TEAM_B]).toBe(3700);
    expect(projection.result?.winnerTeamIds).toEqual([TEAM_B]);
  });

  it('is not the team that won the most rounds', () => {
    // B takes nine rounds by 10 points each; A takes one by 500.
    const manySmallWins: Round[] = [
      round(1, { cardPoints: 600 }, { cardPoints: 100 }),
      ...Array.from({ length: 9 }, (_unused, index) =>
        round(index + 2, { cardPoints: 100 }, { cardPoints: 110 }),
      ),
    ];
    const { projection } = recomputeGame({ game, rounds: manySmallWins });

    expect(projection.totalsByTeam[TEAM_A]).toBe(1500);
    expect(projection.totalsByTeam[TEAM_B]).toBe(1090);
    expect(projection.result?.winnerTeamIds).toEqual([TEAM_A]);
  });

  it('is not whoever passed some score first', () => {
    const { projection } = recomputeGame({ game, rounds: rounds(10, 700, 900) });

    expect(projection.totalsByTeam[TEAM_A]).toBe(7000);
    expect(projection.totalsByTeam[TEAM_B]).toBe(9000);
    expect(projection.result?.winnerTeamIds).toEqual([TEAM_B]);
  });

  it('plays one more round when the totals are exactly level', () => {
    // The app policy this rule set inherits, stated as such in its provenance.
    const { projection } = recomputeGame({ game, rounds: rounds(10, 500, 500) });

    expect(projection.endState.kind).toBe('tieBreakRound');
    expect(projection.status).toBe('active');
    expect(projection.result).toBeUndefined();
  });

  it('settles after that extra round', () => {
    const levelThenDecided: Round[] = [
      ...rounds(10, 500, 500),
      round(11, { cardPoints: 300 }, { cardPoints: 100 }),
    ];
    const { projection } = recomputeGame({ game, rounds: levelThenDecided });

    expect(projection.status).toBe('finished');
    expect(projection.result?.winnerTeamIds).toEqual([TEAM_A]);
    expect(projection.result?.decidedAfterRound).toBe(11);
  });
});

describe('nothing about Classic changed', () => {
  it('scores a Classic round exactly as before', () => {
    const [breakdown] = calculateRoundScore({
      ruleSet: classic,
      teamIds: [TEAM_A],
      roundNumber: 1,
      inputs: [
        teamInput(TEAM_A, {
          cardPoints: 420,
          naturalCanastas: 1,
          mixedCanastas: 1,
          redThrees: 2,
          opened: true,
          wentOut: true,
          concealedGoingOut: true,
        }),
      ],
      scoreBefore: { [TEAM_A]: 0 },
    });

    // 420 + 500 + 300 + 200 (red threes) + 200 (concealed, replacing 100)
    expect(breakdown?.total).toBe(1620);
  });

  it('still ends a Classic game on its target score', () => {
    const classicGame = makeGame(freezeForGame(classic));

    // Four rounds: 4.400 against 3.600, nobody past the target yet.
    const running = recomputeGame({ game: classicGame, rounds: rounds(4, 1100, 900) });
    expect(running.projection.endState).toEqual({
      kind: 'inProgress',
      objective: { kind: 'targetScore', targetScore: 5000 },
    });

    // The fifth takes A past 5.000, and a Classic game ends there — ten rounds
    // is a Paul's rule and must not have leaked anywhere near this one.
    const finished = recomputeGame({ game: classicGame, rounds: rounds(5, 1100, 900) });
    expect(finished.projection.status).toBe('finished');
    expect(finished.projection.result?.decidedAfterRound).toBe(5);
    expect(finished.projection.result?.winnerTeamIds).toEqual([TEAM_A]);
  });
});
