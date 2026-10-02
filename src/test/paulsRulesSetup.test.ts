import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestStorage, type TestStorage } from '@/storage/testing';
import { fixedClock } from '@/storage/time';
import { BUILTIN_RULE_SETS, classic, paulsRules, twoHanded } from '@/rules/builtin';
import { blankInput } from '@/application/fields/access';
import { buildFieldLayout } from '@/application/viewmodels/roundForm';
import { buildScoreboard } from '@/application/viewmodels/scoreboard';
import {
  buildGameSetup,
  partyOverrides,
  teamLayoutsFor,
  type PartyShape,
} from '@/application/viewmodels/setup';
import { createServices, type Services } from '@/application/services';
import type { Game } from '@/domain/game';

/**
 * Starting a game of Paul's regels, through the flow a person actually walks.
 *
 * The number of players is not in the rule set — it is chosen at the table —
 * and nobody plays in a team. Both of those are properties of the rule set's
 * own data, so what is being proved here is that the ordinary setup path reads
 * them and behaves accordingly, without a single branch that knows which
 * variant it is looking at.
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

/** The shape the wizard produces for N people playing for themselves. */
const individual = (playerCount: number): PartyShape => ({
  playerCount,
  teamCount: playerCount,
  mode: 'individual',
});

async function startGame(playerCount: number, plannedRounds?: number): Promise<Game> {
  const names = Array.from({ length: playerCount }, (_unused, seat) => `Speler ${seat + 1}`);

  const outcome = await services.games.create({
    ruleSetId: paulsRules.id,
    ruleSetOrigin: 'builtin',
    playerNames: names,
    // Individual play: a participant is named after the person, exactly as the
    // wizard fills it in.
    teamNames: names,
    teamSeats: names.map((_unused, seat) => [seat]),
    overrides: [
      ...partyOverrides(individual(playerCount)),
      ...(plannedRounds === undefined
        ? []
        : [{ path: 'endGame.plannedRounds', value: plannedRounds }]),
    ],
  });

  if (!outcome.ok) {
    throw new Error(
      `kon geen partij starten: ${
        outcome.reason === 'validation'
          ? outcome.issues.map((issue) => issue.message).join(' | ')
          : outcome.reason
      }`,
    );
  }
  return outcome.game;
}

/** One round: everybody scores the card points they are given. */
async function playRound(game: Game, pointsPerPlayer: readonly number[]): Promise<void> {
  const fields = buildFieldLayout(game.effectiveRuleSet).flatMap((group) => group.fields);
  const outcome = await services.rounds.saveNew({
    gameId: game.id,
    inputs: game.teams.map((team, index) => ({
      ...blankInput(team.id, fields),
      cardPoints: pointsPerPlayer[index] ?? 0,
    })),
  });
  if (!outcome.ok) throw new Error('kon de ronde niet opslaan');
}

async function boardOf(game: Game) {
  const loaded = await services.games.load(game.id);
  return buildScoreboard(loaded!.game, loaded!.rounds);
}

describe('the setup step reads the rule set rather than a variant name', () => {
  it('offers Paul’s regels a range of players and no grouping', () => {
    const setup = buildGameSetup(paulsRules);

    expect(setup.minPlayers).toBe(2);
    expect(setup.maxPlayers).toBe(8);
    expect(setup.allowsTeams).toBe(false);
    expect(setup.hasTeams).toBe(false);
    expect(setup.teamNoun).toEqual({ singular: 'speler', plural: 'spelers' });
  });

  it('keeps Classic pinned to four players in two partnerships', () => {
    const setup = buildGameSetup(classic);

    expect(setup.minPlayers).toBe(4);
    expect(setup.maxPlayers).toBe(4);
    expect(setup.allowsTeams).toBe(true);
    expect(setup.hasTeams).toBe(true);
  });

  it('keeps Two-Handed pinned to two players', () => {
    const setup = buildGameSetup(twoHanded);

    expect(setup.minPlayers).toBe(2);
    expect(setup.maxPlayers).toBe(2);
  });

  it('offers no team layout at all where the variant has no teams', () => {
    // Four players do divide into two pairs. Not offering that is a statement
    // about the variant, not about the arithmetic.
    expect(teamLayoutsFor(4, false)).toEqual([
      { playerCount: 4, teamCount: 4, mode: 'individual' },
    ]);
    expect(teamLayoutsFor(4, true)).toHaveLength(2);
    expect(teamLayoutsFor(6, false)).toEqual([
      { playerCount: 6, teamCount: 6, mode: 'individual' },
    ]);
  });

  it('names a Paul’s participant after the player, not after a team', () => {
    const setup = buildGameSetup(paulsRules);
    expect(setup.defaultTeamNames.every((name) => name.startsWith('Speler'))).toBe(true);
  });

  it('says the player count is a range on the rule set card', () => {
    const choice = buildGameSetup(paulsRules).summaryLine;

    expect(choice).toContain('2–8 spelers');
    expect(choice).not.toContain('teams');
    expect(buildGameSetup(classic).summaryLine).toContain('4 spelers');
  });
});

describe.each([
  [3, 10],
  [4, 10],
  [6, 2],
])('a game of %i players over %i rounds', (playerCount, plannedRounds) => {
  it('starts, with one participant per player', async () => {
    const game = await startGame(playerCount, plannedRounds);

    expect(game.players).toHaveLength(playerCount);
    expect(game.teams).toHaveLength(playerCount);
    for (const team of game.teams) expect(team.memberIds).toHaveLength(1);
    expect(game.teams.map((team) => team.name)).toEqual(game.players.map((player) => player.name));
  });

  it('freezes the party it was started with', async () => {
    const game = await startGame(playerCount, plannedRounds);
    const { players, teams, dealing, deck, endGame } = game.effectiveRuleSet.configuration;

    expect(players).toEqual({ min: playerCount, max: playerCount, default: playerCount });
    expect(teams).toEqual({ mode: 'individual', count: playerCount, teamSize: 1 });
    expect(dealing.cardsPerPlayer).toBe(26);
    expect(deck.standardDecks).toBe(6);
    expect(endGame.plannedRounds).toBe(plannedRounds);
  });

  it('asks every player the same opening, and raises it per round', async () => {
    const game = await startGame(playerCount, plannedRounds);

    const first = await boardOf(game);
    const openings = first.teams.map((team) => team.infoLines[1]);
    expect(new Set(openings).size).toBe(1);
    expect(openings[0]).toContain('30 punten');

    await playRound(
      game,
      game.teams.map(() => 100),
    );
    const second = await boardOf(game);
    expect(second.teams[0]!.infoLines[1]).toContain('60 punten');
  });

  it('counts every player a total of their own, and crowns the largest', async () => {
    const game = await startGame(playerCount, plannedRounds);
    // Each seat scores a different amount, so no two totals can collide.
    const points = game.teams.map((_team, seat) => (seat + 1) * 100);

    for (let round = 0; round < plannedRounds; round += 1) await playRound(game, points);

    const board = await boardOf(game);

    expect(board.teams.map((team) => team.total)).toEqual(
      points.map((perRound) => perRound * plannedRounds),
    );
    expect(board.status).toBe('finished');
    expect(board.canAddRound).toBe(false);
    if (board.outcome.kind !== 'won') throw new Error('verwacht een gewonnen partij');
    expect(board.outcome.winnerNames).toEqual([`Speler ${playerCount}`]);
  });

  it('counts the rounds, and stops offering one when they are up', async () => {
    const game = await startGame(playerCount, plannedRounds);

    for (let round = 0; round < plannedRounds - 1; round += 1) {
      const board = await boardOf(game);
      expect(board.canAddRound).toBe(true);
      expect(board.nextRoundLabel).toBe(`Ronde ${round + 1} van ${plannedRounds}`);
      await playRound(
        game,
        game.teams.map((_team, seat) => seat * 10),
      );
    }

    const lastRound = await boardOf(game);
    expect(lastRound.nextRoundLabel).toBe(`Ronde ${plannedRounds} van ${plannedRounds}`);

    await playRound(
      game,
      game.teams.map((_team, seat) => seat * 10),
    );
    expect((await boardOf(game)).canAddRound).toBe(false);
  });
});

describe('the player count really is free', () => {
  it.each([2, 3, 4, 5, 6, 7, 8])('starts a game of %i', async (playerCount) => {
    const game = await startGame(playerCount);

    expect(game.teams).toHaveLength(playerCount);
    expect(game.effectiveRuleSet.configuration.teams.mode).toBe('individual');
  });

  it('bounds the stepper by what the rule set declares, not by a constant', () => {
    // This is the whole mechanism: the wizard asks the rule set how many
    // players it allows, and pins the stepper when the answer is one number.
    // Nothing in the interface knows which variant leaves the choice open.
    const pauls = buildGameSetup(paulsRules);
    expect([pauls.minPlayers, pauls.maxPlayers]).toEqual([2, 8]);

    for (const fixed of [classic, twoHanded]) {
      const setup = buildGameSetup(fixed);
      expect(setup.minPlayers).toBe(setup.maxPlayers);
    }
  });
});
