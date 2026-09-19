import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestStorage, type TestStorage } from '@/storage/testing';
import { fixedClock } from '@/storage/time';
import { BUILTIN_RULE_SETS, classic } from '@/rules/builtin';
import { buildFieldLayout } from '@/application/viewmodels/roundForm';
import { blankInput } from '@/application/fields/access';
import { partyOverrides, type PartyShape } from '@/application/viewmodels/setup';
import { buildScoreboard } from '@/application/viewmodels/scoreboard';
import { createServices, type Services } from '@/application/services';
import type { Game } from '@/domain/game';

/**
 * Custom games, end to end.
 *
 * The thing being proved is an absence: there is no custom-game code path. A
 * six-player game in three teams is created, scored, corrected, finished and
 * exported by exactly the functions a four-player Classic game uses, and the
 * only difference between them is a handful of `ConfigOverride`s.
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

/** Seats spread round-robin, exactly as the wizard lays them out. */
function seatsFor(playerCount: number, teamCount: number): number[][] {
  const seats: number[][] = Array.from({ length: teamCount }, () => []);
  for (let seat = 0; seat < playerCount; seat += 1) seats[seat % teamCount]!.push(seat);
  return seats;
}

async function createCustomGame(playerCount: number, teamCount: number): Promise<Game> {
  const layout = shape(playerCount, teamCount);
  const outcome = await services.games.create({
    ruleSetId: classic.id,
    ruleSetOrigin: 'builtin',
    playerNames: Array.from({ length: playerCount }, (_unused, seat) => `Speler ${seat + 1}`),
    teamNames: Array.from({ length: teamCount }, (_unused, index) => `Team ${index + 1}`),
    teamSeats: seatsFor(playerCount, teamCount),
    overrides: partyOverrides(layout),
  });

  if (!outcome.ok) {
    throw new Error(
      `kon geen partij maken: ${outcome.reason === 'validation' ? outcome.issues.map((issue) => issue.message).join(' | ') : outcome.reason}`,
    );
  }
  return outcome.game;
}

/** One round: every team scores the card points it is given. */
async function playRound(game: Game, pointsPerTeam: number[]) {
  const fields = buildFieldLayout(game.effectiveRuleSet).flatMap((group) => group.fields);
  await services.rounds.saveNew({
    gameId: game.id,
    inputs: game.teams.map((team, index) => ({
      ...blankInput(team.id, fields),
      cardPoints: pointsPerTeam[index] ?? 0,
      opened: true,
    })),
  });
}

describe('creating custom games', () => {
  it.each([
    [2, 2],
    [4, 2],
    [6, 3],
    [8, 4],
    [8, 2],
    [6, 2],
  ])('creates a game with %i players in %i teams', async (playerCount, teamCount) => {
    const game = await createCustomGame(playerCount, teamCount);

    expect(game.players).toHaveLength(playerCount);
    expect(game.teams).toHaveLength(teamCount);
    expect(game.teams.flatMap((team) => team.memberIds)).toHaveLength(playerCount);
  });

  it.each([
    [3, 3],
    [5, 5],
    [6, 6],
  ])('creates individual play for %i players', async (playerCount, teamCount) => {
    const game = await createCustomGame(playerCount, teamCount);

    expect(game.teams).toHaveLength(teamCount);
    expect(game.teams.every((team) => team.memberIds.length === 1)).toBe(true);
    expect(game.effectiveRuleSet.configuration.teams.mode).toBe('individual');
  });

  it('gives every player and team its own id', async () => {
    const game = await createCustomGame(6, 3);

    const playerIds = game.players.map((player) => player.id);
    const teamIds = game.teams.map((team) => team.id);
    expect(new Set(playerIds).size).toBe(6);
    expect(new Set(teamIds).size).toBe(3);
    expect(playerIds.some((id) => teamIds.includes(id))).toBe(false);
  });

  it('puts nobody in two teams', async () => {
    const game = await createCustomGame(8, 4);
    const assigned = game.teams.flatMap((team) => team.memberIds);
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it('seats every player in exactly one team, by the seats it was given', async () => {
    const game = await createCustomGame(6, 3);
    const bySeat = new Map(game.players.map((player) => [player.id, player.seat]));

    // Round-robin: team 0 gets seats 0 and 3, team 1 gets 1 and 4, and so on.
    game.teams.forEach((team, index) => {
      const seats = team.memberIds.map((id) => bySeat.get(id)!).sort((a, b) => a - b);
      expect(seats).toEqual([index, index + 3]);
    });
  });

  it('refuses a party that does not divide, and stores nothing', async () => {
    const outcome = await services.games.create({
      ruleSetId: classic.id,
      ruleSetOrigin: 'builtin',
      playerNames: ['A', 'B', 'C', 'D', 'E'],
      teamNames: ['Een', 'Twee'],
      teamSeats: [
        [0, 2, 4],
        [1, 3],
      ],
      overrides: [
        { path: 'players.min', value: 5 },
        { path: 'players.max', value: 5 },
        { path: 'players.default', value: 5 },
      ],
    });

    expect(outcome.ok).toBe(false);
    expect(await services.games.list()).toHaveLength(0);
  });

  it('freezes the custom shape into the game', async () => {
    const game = await createCustomGame(6, 3);

    expect(game.effectiveRuleSet.configuration.players.default).toBe(6);
    expect(game.effectiveRuleSet.configuration.teams.count).toBe(3);
    expect(game.effectiveRuleSet.configuration.teams.teamSize).toBe(2);
    expect(game.gameOverrides.length).toBeGreaterThan(0);
    expect(Object.isFrozen(game.effectiveRuleSet)).toBe(true);
  });
});

describe('scoring a custom game', () => {
  it('scores three teams independently', async () => {
    const game = await createCustomGame(6, 3);
    await playRound(game, [300, 500, 400]);

    const loaded = await services.games.load(game.id);
    const board = buildScoreboard(loaded!.game, loaded!.rounds);

    expect(board.teams.map((team) => team.total)).toEqual([300, 500, 400]);
    expect(board.teams.find((team) => team.isLeader)?.total).toBe(500);
  });

  it('adds up across rounds for six players in three teams', async () => {
    const game = await createCustomGame(6, 3);
    await playRound(game, [300, 500, 400]);
    await playRound(game, [200, 100, 250]);

    const loaded = await services.games.load(game.id);
    const board = buildScoreboard(loaded!.game, loaded!.rounds);
    expect(board.teams.map((team) => team.total)).toEqual([500, 600, 650]);
  });

  it('scores four teams of two', async () => {
    const game = await createCustomGame(8, 4);
    await playRound(game, [100, 200, 300, 400]);

    const loaded = await services.games.load(game.id);
    const board = buildScoreboard(loaded!.game, loaded!.rounds);
    expect(board.teams.map((team) => team.total)).toEqual([100, 200, 300, 400]);
  });

  it('scores individual play with six players', async () => {
    const game = await createCustomGame(6, 6);
    await playRound(game, [50, 100, 150, 200, 250, 300]);

    const loaded = await services.games.load(game.id);
    const board = buildScoreboard(loaded!.game, loaded!.rounds);
    expect(board.teams.map((team) => team.total)).toEqual([50, 100, 150, 200, 250, 300]);
  });

  it('cascades a correction through every later round, with three teams', async () => {
    const game = await createCustomGame(6, 3);
    await playRound(game, [300, 500, 400]);
    await playRound(game, [200, 100, 250]);

    const loaded = await services.games.load(game.id);
    const first = loaded!.rounds[0]!;
    const fields = buildFieldLayout(game.effectiveRuleSet).flatMap((group) => group.fields);

    await services.rounds.correct({
      gameId: game.id,
      roundId: first.id,
      inputs: game.teams.map((team, index) => ({
        ...blankInput(team.id, fields),
        cardPoints: [900, 500, 400][index] ?? 0,
        opened: true,
      })),
    });

    const after = await services.games.load(game.id);
    const board = buildScoreboard(after!.game, after!.rounds);
    // Only the first team's first round moved: 900 + 200 instead of 300 + 200.
    expect(board.teams.map((team) => team.total)).toEqual([1100, 600, 650]);
  });

  it('finishes when a team passes the target, whatever the team count', async () => {
    const game = await createCustomGame(6, 3);
    await playRound(game, [5200, 100, 200]);

    const loaded = await services.games.load(game.id);
    const board = buildScoreboard(loaded!.game, loaded!.rounds);

    expect(board.outcome.kind).toBe('won');
    if (board.outcome.kind !== 'won') throw new Error('unreachable');
    expect(board.outcome.winnerTeamIds).toEqual([game.teams[0]!.id]);
  });

  it('plays an extra round when three teams tie exactly on the target', async () => {
    const game = await createCustomGame(6, 3);
    await playRound(game, [5200, 5200, 100]);

    const loaded = await services.games.load(game.id);
    const board = buildScoreboard(loaded!.game, loaded!.rounds);

    expect(board.outcome.kind).toBe('tieBreakRound');
    if (board.outcome.kind !== 'tieBreakRound') throw new Error('unreachable');
    expect(board.outcome.leaderTeamIds).toHaveLength(2);
    expect(board.canAddRound).toBe(true);
  });

  it('generates the round form from the frozen rule set, for every team', async () => {
    const game = await createCustomGame(6, 3);
    const loaded = await services.games.load(game.id);
    const fields = buildFieldLayout(loaded!.game.effectiveRuleSet).flatMap(
      (group) => group.fields,
    );

    // The same field catalogue as Classic: a custom party changes who plays,
    // not what is scored.
    const classicFields = buildFieldLayout(classic).flatMap((group) => group.fields);
    expect(fields.map((field) => field.id)).toEqual(classicFields.map((field) => field.id));
  });
});

describe('existing games stay historical', () => {
  it('keeps its own shape when a preset it came from is edited', async () => {
    const created = await services.ruleSets.createPreset({
      sourceId: classic.id,
      sourceOrigin: 'builtin',
      name: 'Zes spelers',
      overrides: partyOverrides(shape(6, 3)),
    });
    if (!created.ok) throw new Error('kon geen preset maken');

    const outcome = await services.games.create({
      ruleSetId: created.preset.id,
      ruleSetOrigin: 'custom',
      playerNames: Array.from({ length: 6 }, (_unused, seat) => `Speler ${seat + 1}`),
      teamNames: ['Een', 'Twee', 'Drie'],
      teamSeats: seatsFor(6, 3),
      overrides: [],
    });
    if (!outcome.ok) throw new Error('kon geen partij maken');

    // The preset moves on to eight players in four teams.
    await services.ruleSets.updatePreset({
      id: created.preset.id,
      name: 'Acht spelers',
      overrides: partyOverrides(shape(8, 4)),
    });

    const reloaded = await services.games.load(outcome.game.id);
    expect(reloaded!.game.players).toHaveLength(6);
    expect(reloaded!.game.teams).toHaveLength(3);
    expect(reloaded!.game.effectiveRuleSet.configuration.players.default).toBe(6);
    expect(reloaded!.game.ruleSetRef.name).toBe('Zes spelers');
  });

  it('survives the preset being deleted outright', async () => {
    const created = await services.ruleSets.createPreset({
      sourceId: classic.id,
      sourceOrigin: 'builtin',
      name: 'Tijdelijk',
      overrides: partyOverrides(shape(6, 3)),
    });
    if (!created.ok) throw new Error('kon geen preset maken');

    const outcome = await services.games.create({
      ruleSetId: created.preset.id,
      ruleSetOrigin: 'custom',
      playerNames: Array.from({ length: 6 }, (_unused, seat) => `Speler ${seat + 1}`),
      teamNames: ['Een', 'Twee', 'Drie'],
      teamSeats: seatsFor(6, 3),
      overrides: [],
    });
    if (!outcome.ok) throw new Error('kon geen partij maken');

    await playRound(outcome.game, [300, 400, 500]);
    await services.ruleSets.removePreset(created.preset.id);

    const reloaded = await services.games.load(outcome.game.id);
    const board = buildScoreboard(reloaded!.game, reloaded!.rounds);
    expect(board.teams.map((team) => team.total)).toEqual([300, 400, 500]);
  });

  it('leaves a standard game standard when a custom game is created next to it', async () => {
    const standard = await services.games.create({
      ruleSetId: classic.id,
      ruleSetOrigin: 'builtin',
      playerNames: ['A', 'B', 'C', 'D'],
      teamNames: ['Een', 'Twee'],
      teamSeats: [
        [0, 2],
        [1, 3],
      ],
      overrides: [],
    });
    if (!standard.ok) throw new Error('kon geen partij maken');

    await createCustomGame(8, 4);

    const reloaded = await services.games.load(standard.game.id);
    expect(reloaded!.game.players).toHaveLength(4);
    expect(reloaded!.game.teams).toHaveLength(2);
    expect(reloaded!.game.gameOverrides).toEqual([]);
  });
});

describe('persistence and transfer', () => {
  it('reloads a custom game from storage unchanged', async () => {
    const game = await createCustomGame(6, 3);
    await playRound(game, [300, 500, 400]);

    const reloaded = await services.games.load(game.id);
    expect(reloaded!.game.players).toHaveLength(6);
    expect(reloaded!.game.teams).toHaveLength(3);
    expect(reloaded!.rounds).toHaveLength(1);
  });

  it('exports and re-imports a custom game with new ids and the same teams', async () => {
    const game = await createCustomGame(6, 3);
    await playRound(game, [300, 500, 400]);
    await playRound(game, [100, 200, 300]);

    const exported = await services.transfer.exportGame(game.id);
    if (!exported.ok) throw new Error('export mislukt');

    const parsed = services.transfer.parse(exported.json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');

    const imported = await services.transfer.importGame(parsed.document);
    expect(imported.ok).toBe(true);
    if (!imported.ok) throw new Error('unreachable');

    const copy = await services.games.load(imported.game.id);
    expect(copy!.game.id).not.toBe(game.id);
    expect(copy!.game.players).toHaveLength(6);
    expect(copy!.game.teams).toHaveLength(3);

    // Ids are remapped, membership is not.
    const originalIds = new Set([
      ...game.players.map((player) => player.id),
      ...game.teams.map((team) => team.id),
    ]);
    const copyIds = [
      ...copy!.game.players.map((player) => player.id),
      ...copy!.game.teams.map((team) => team.id),
    ];
    expect(copyIds.some((id) => originalIds.has(id))).toBe(false);

    const shapeOf = (loaded: Game) => {
      const bySeat = new Map(loaded.players.map((player) => [player.id, player.seat]));
      return loaded.teams.map((team) =>
        team.memberIds.map((id) => bySeat.get(id)).sort((a, b) => (a ?? 0) - (b ?? 0)),
      );
    };
    expect(shapeOf(copy!.game)).toEqual(shapeOf(game));

    // The frozen rule set travels with it, six players and all.
    expect(copy!.game.effectiveRuleSet.configuration.players.default).toBe(6);
    expect(copy!.game.effectiveRuleSet.configuration.teams.count).toBe(3);
    expect(copy!.game.engineVersion).toBe(game.engineVersion);

    // And the scores replay identically from the inputs.
    const before = buildScoreboard(game, (await services.games.load(game.id))!.rounds);
    const after = buildScoreboard(copy!.game, copy!.rounds);
    expect(after.teams.map((team) => team.total)).toEqual(before.teams.map((team) => team.total));
  });

  it('keeps the export at format version 1', async () => {
    const game = await createCustomGame(6, 3);
    const exported = await services.transfer.exportGame(game.id);
    if (!exported.ok) throw new Error('export mislukt');

    const document = JSON.parse(exported.json) as { format: string; version: number };
    expect(document.format).toBe('canasta-game-export');
    expect(document.version).toBe(1);
  });
});
