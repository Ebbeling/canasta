import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestStorage, type TestStorage } from '@/storage/testing';
import { fixedClock } from '@/storage/time';
import { BUILTIN_RULE_SETS, classic } from '@/rules/builtin';
import { createServices, type Services } from '@/application/services';
import { blankInput } from '@/application/fields/access';
import { buildFieldLayout } from './roundForm';
import { partyOverrides, type PartyShape } from './setup';
import { buildScoreboard } from './scoreboard';
import { previewRound } from './roundPreview';
import { describeRuleSet } from './rulesView';
import { applyOverrides } from '@/rules/resolve/resolveRuleSet';
import type { Game } from '@/domain/game';

/**
 * The values a screen is given rather than works out.
 *
 * Each of these exists because the design asks for something the interface
 * would otherwise have had to derive: who is ahead and by how much, how much of
 * a round is filled in and what its participants are called, and a fact split
 * into a value and the word for it. All three are decisions about the game or
 * its rules, so they are settled here and React only renders them.
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

const shape = (playerCount: number, teamCount: number): PartyShape => ({
  playerCount,
  teamCount,
  mode: playerCount / teamCount === 1 ? 'individual' : 'partnership',
});

function seatsFor(playerCount: number, teamCount: number): number[][] {
  const seats: number[][] = Array.from({ length: teamCount }, () => []);
  for (let seat = 0; seat < playerCount; seat += 1) seats[seat % teamCount]!.push(seat);
  return seats;
}

async function createGame(playerCount: number, teamCount: number): Promise<Game> {
  const layout = shape(playerCount, teamCount);
  const outcome = await services.games.create({
    ruleSetId: classic.id,
    ruleSetOrigin: 'builtin',
    playerNames: Array.from({ length: playerCount }, (_u, seat) => `Speler ${seat + 1}`),
    teamNames: Array.from({ length: teamCount }, (_u, index) => `Team ${index + 1}`),
    teamSeats: seatsFor(playerCount, teamCount),
    overrides: teamCount === 2 && playerCount === 4 ? [] : partyOverrides(layout),
  });
  if (!outcome.ok) throw new Error('kon geen partij maken');
  return outcome.game;
}

async function addRound(game: Game, pointsPerTeam: number[]) {
  const fields = buildFieldLayout(game.effectiveRuleSet).flatMap((group) => group.fields);
  const outcome = await services.rounds.saveNew({
    gameId: game.id,
    inputs: game.teams.map((team, index) => ({
      ...blankInput(team.id, fields),
      cardPoints: pointsPerTeam[index] ?? 0,
      opened: true,
    })),
  });
  if (!outcome.ok) throw new Error('kon geen ronde opslaan');
}

async function boardOf(game: Game) {
  const loaded = await services.games.load(game.id);
  return buildScoreboard(loaded!.game, loaded!.rounds);
}

describe('the standings say who is ahead, and by how much', () => {
  it('gives the leader the distance to the team behind it', async () => {
    const game = await createGame(6, 3);
    await addRound(game, [100, 400, 250]);

    const board = await boardOf(game);
    const byRank = [...board.teams].sort((a, b) => a.rank - b.rank);

    expect(byRank[0]!.leadText).toBe('+150');
    expect(byRank[0]!.gapText).toBe('');
    expect(byRank[1]!.leadText).toBe('');
    expect(byRank[1]!.gapText).toBe('−150');
    expect(byRank[2]!.gapText).toBe('−300');
  });

  it('names no lead while every team is level', async () => {
    const game = await createGame(6, 3);
    await addRound(game, [200, 200, 200]);

    const board = await boardOf(game);
    for (const team of board.teams) {
      expect(team.lead).toBe(0);
      expect(team.leadText).toBe('');
    }
  });

  it('gives a shared lead to both teams that hold it', async () => {
    const game = await createGame(6, 3);
    await addRound(game, [400, 400, 250]);

    const board = await boardOf(game);
    const leaders = board.teams.filter((team) => team.isLeader);
    expect(leaders).toHaveLength(2);
    for (const leader of leaders) expect(leader.leadText).toBe('+150');
  });
});

describe('a round says how far it has got, in the words of its own game', () => {
  async function previewFor(playerCount: number, teamCount: number, filled: number) {
    const game = await createGame(playerCount, teamCount);
    const fields = buildFieldLayout(game.effectiveRuleSet).flatMap((group) => group.fields);

    return previewRound({
      ruleSet: game.effectiveRuleSet,
      teams: game.teams,
      roundNumber: 1,
      inputs: game.teams.map((team, index) => ({
        ...blankInput(team.id, fields),
        cardPoints: index < filled ? 100 : 0,
        opened: index < filled,
      })),
      scoreBefore: {},
    });
  }

  it('counts teams in a game of partnerships', async () => {
    const preview = await previewFor(6, 3, 2);
    expect(preview.filledCount).toBe(2);
    expect(preview.filledLabel).toBe('2 van 3 teams ingevuld');
  });

  it('counts players when everyone plays for themselves', async () => {
    const preview = await previewFor(6, 6, 3);
    expect(preview.filledCount).toBe(3);
    expect(preview.filledLabel).toBe('3 van 6 spelers ingevuld');
  });

  it('starts at none filled in', async () => {
    const preview = await previewFor(4, 2, 0);
    expect(preview.filledLabel).toBe('0 van 2 teams ingevuld');
  });
});

describe('a rule set fact carries its value apart from its name', () => {
  it('leaves the unit out of the value', () => {
    const description = describeRuleSet(classic);
    const byLabel = new Map(description.summaryFacts.map((fact) => [fact.label, fact]));

    expect(byLabel.get('Spelers')?.valueText).toBe('4');
    expect(byLabel.get('Teams')?.valueText).toBe('2');
    expect(byLabel.get('Kaartspel')?.valueText).toBe('108');
    expect(byLabel.get('Doelscore')?.valueText).toBe('5.000');
  });

  it('keeps the sentence form for the one-line summary', () => {
    const description = describeRuleSet(classic);
    expect(description.summaryLine).toContain('4 spelers');
    expect(description.summaryLine).toContain('doel 5.000 punten');
  });

  it('holds for a rule set where everyone plays for themselves', () => {
    const effective = applyOverrides(
      classic,
      partyOverrides({ playerCount: 6, teamCount: 6, mode: 'individual' }),
    );

    const description = describeRuleSet(effective);
    const byLabel = new Map(description.summaryFacts.map((fact) => [fact.label, fact]));

    expect(byLabel.get('Spelers')?.valueText).toBe('6');
    // No teams to speak of, so no tile for them.
    expect(byLabel.has('Teams')).toBe(false);
  });
});
