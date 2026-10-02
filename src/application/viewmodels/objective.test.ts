import { describe, expect, it } from 'vitest';
import type { Round, TeamRoundInput } from '@/domain/round';
import { classic, paulsRules } from '@/rules/builtin';
import { freezeForGame } from '@/rules/resolve/resolveRuleSet';
import { makeGame, TEAM_A, TEAM_B, teamInput } from '@/test/fixtures';
import { buildScoreboard } from './scoreboard';
import { describeRuleSet } from './rulesView';
import { buildGameSetup } from './setup';
import { describeObjective, objectiveProgress, roundLabel } from './objective';

/**
 * What a screen is told about how a game ends.
 *
 * Two rule sets end a game two different ways, and neither way may reach a
 * component as a configuration value it has to interpret. "Nog 1.200 tot
 * 5.000" and "Ronde 3 van 10" are both answers to the same question, composed
 * here so that React only renders a string either way.
 */

function round(sequence: number, a: Partial<TeamRoundInput>, b: Partial<TeamRoundInput>): Round {
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

function rounds(n: number, a: number, b: number): Round[] {
  return Array.from({ length: n }, (_unused, index) =>
    round(index + 1, { cardPoints: a }, { cardPoints: b }),
  );
}

const paulsGame = makeGame(freezeForGame(paulsRules));
const classicGame = makeGame(freezeForGame(classic));

describe('describeObjective', () => {
  it('names a target score as a target', () => {
    const vm = describeObjective({ kind: 'targetScore', targetScore: 5000 }, 'running');

    expect(vm).toMatchObject({
      kind: 'targetScore',
      term: 'Doel',
      valueText: '5.000',
      inline: 'doel 5.000 punten',
    });
  });

  it('names the round being played while the game runs', () => {
    const vm = describeObjective(
      { kind: 'plannedRounds', plannedRounds: 10, roundsPlayed: 2 },
      'running',
    );

    expect(vm.term).toBe('Ronde');
    expect(vm.valueText).toBe('3 van 10');
    expect(vm.inline).toBe('10 rondes');
    expect(vm.winnerLine).toBe('De hoogste totaalscore over alle rondes wint.');
  });

  it('starts at round 1 of 10 before anything is played', () => {
    const vm = describeObjective(
      { kind: 'plannedRounds', plannedRounds: 10, roundsPlayed: 0 },
      'running',
    );

    expect(`${vm.term} ${vm.valueText}`).toBe('Ronde 1 van 10');
  });

  it('reaches round 10 of 10 while the last one is being played', () => {
    const vm = describeObjective(
      { kind: 'plannedRounds', plannedRounds: 10, roundsPlayed: 9 },
      'running',
    );

    expect(`${vm.term} ${vm.valueText}`).toBe('Ronde 10 van 10');
  });

  it('counts what was played once the game is over', () => {
    const vm = describeObjective(
      { kind: 'plannedRounds', plannedRounds: 10, roundsPlayed: 10 },
      'finished',
    );

    expect(`${vm.term} ${vm.valueText}`).toBe('Rondes 10 van 10');
  });
});

describe('objectiveProgress', () => {
  it('measures a target score per team', () => {
    const towards = objectiveProgress({ kind: 'targetScore', targetScore: 5000 }, 1250);

    expect(towards.progress).toBe(0.25);
    expect(towards.infoLine).toBe('Nog 3.750 tot 5.000');
    expect(towards.barLabel).toBe('voortgang naar de doelscore');
  });

  it('measures rounds, which are the same for everybody', () => {
    const objective = { kind: 'plannedRounds', plannedRounds: 10, roundsPlayed: 4 } as const;

    expect(objectiveProgress(objective, 100)).toEqual(objectiveProgress(objective, 9000));
    expect(objectiveProgress(objective, 100).progress).toBe(0.4);
    expect(objectiveProgress(objective, 100).infoLine).toBe('Ronde 5 van 10');
  });

  it('says so when every round has been played', () => {
    const towards = objectiveProgress(
      { kind: 'plannedRounds', plannedRounds: 10, roundsPlayed: 10 },
      4820,
    );

    expect(towards.progress).toBe(1);
    expect(towards.infoLine).toBe('Alle 10 rondes gespeeld');
  });
});

describe('roundLabel', () => {
  it('counts towards the planned total where there is one', () => {
    expect(roundLabel(paulsRules, 1)).toBe('Ronde 1 van 10');
    expect(roundLabel(paulsRules, 10)).toBe('Ronde 10 van 10');
  });

  it('just names the round where there is not', () => {
    expect(roundLabel(classic, 7)).toBe('Ronde 7');
  });
});

describe('the scoreboard of a game played over rounds', () => {
  it('shows the round it is on instead of a target', () => {
    const board = buildScoreboard(paulsGame, rounds(2, 500, 400));

    expect(board.objective.term).toBe('Ronde');
    expect(board.objective.valueText).toBe('3 van 10');
    expect(board.teams[0]!.infoLines[0]).toBe('Ronde 3 van 10');
    expect(board.nextRoundLabel).toBe('Ronde 3 van 10');
  });

  it('never mentions a score anyone has to reach', () => {
    const board = buildScoreboard(paulsGame, rounds(2, 500, 400));
    const everything = JSON.stringify(board);

    expect(everything).not.toContain('Doel');
    expect(everything).not.toContain('doel ');
  });

  it('names the bar for what it actually measures', () => {
    const board = buildScoreboard(paulsGame, rounds(2, 500, 400));
    expect(board.teams[0]!.progressLabel).toContain('voortgang door de rondes');

    const classicBoard = buildScoreboard(classicGame, rounds(2, 500, 400));
    expect(classicBoard.teams[0]!.progressLabel).toContain('voortgang naar de doelscore');
  });

  it('closes with the final standings once the rounds are up', () => {
    const board = buildScoreboard(paulsGame, rounds(10, 500, 400));

    expect(board.status).toBe('finished');
    expect(board.canAddRound).toBe(false);
    expect(board.outcome.kind).toBe('won');
    expect(board.objective.term).toBe('Rondes');
    expect(board.objective.valueText).toBe('10 van 10');
  });

  it('explains a level game in the words of its own objective', () => {
    const board = buildScoreboard(paulsGame, rounds(10, 500, 500));

    expect(board.outcome.kind).toBe('tieBreakRound');
    if (board.outcome.kind !== 'tieBreakRound') return;
    expect(board.outcome.headline).toContain('na 10 rondes precies gelijk');
  });

  it('still says "punten of meer" for a game played to a target', () => {
    const board = buildScoreboard(classicGame, rounds(5, 1000, 1000));

    expect(board.outcome.kind).toBe('tieBreakRound');
    if (board.outcome.kind !== 'tieBreakRound') return;
    expect(board.outcome.headline).toContain('5.000 punten of meer');
  });
});

describe('setting a game up', () => {
  it('says how many rounds there are and that the highest total wins', () => {
    const summary = describeRuleSet(paulsRules).summaryLine;

    expect(summary).toContain('10 rondes');
    expect(summary).toContain('hoogste totaal wint');
    expect(summary).not.toContain('doel');
  });

  it('offers the round count as something a game may choose', () => {
    const setup = buildGameSetup(paulsRules);
    const editable = setup.editableSections.flatMap((section) => section.values);

    const plannedRounds = editable.find((value) => value.key === 'endGame.plannedRounds');
    expect(plannedRounds?.label).toBe('Aantal rondes');
    expect(plannedRounds?.value).toBe(10);
    expect(plannedRounds?.min).toBe(1);
  });

  it('never offers a target score, because there is none to offer', () => {
    const setup = buildGameSetup(paulsRules);
    const keys = setup.editableSections.flatMap((section) =>
      section.values.map((value) => value.key),
    );

    expect(keys).not.toContain('endGame.targetScore');
    expect(keys).not.toContain('goOut.concealedEnabled');
  });

  it('leaves the Classic wizard exactly as it was', () => {
    const summary = describeRuleSet(classic).summaryLine;
    expect(summary).toContain('doel 5.000 punten');

    const keys = buildGameSetup(classic).editableSections.flatMap((section) =>
      section.values.map((value) => value.key),
    );
    expect(keys).toContain('endGame.targetScore');
  });
});
