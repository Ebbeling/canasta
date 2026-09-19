import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestStorage, type TestStorage } from '@/storage/testing';
import { fixedClock } from '@/storage/time';
import { BUILTIN_RULE_SETS, classic, modernAmerican } from '@/rules/builtin';
import { buildFieldLayout } from '@/application/viewmodels/roundForm';
import { blankInput } from '@/application/fields/access';
import { createServices, type Services } from '@/application/services';
import type { CreateGameInput } from '@/application/services/gameService';
import type { Repositories } from '@/application/ports';
import { recomputeGame } from '@/scoring/recompute';
import type { CanastaExportV1 } from './format';
import { EXPORT_FORMAT } from './format';
import { exportFileName } from './exportGame';
import { parseExport } from './parseExport';

let storage: TestStorage;
let services: Services;

beforeEach(async () => {
  storage = await createTestStorage();
  services = build(storage.repositories);
});

afterEach(async () => {
  await storage.close();
});

function build(repositories: Repositories): Services {
  return createServices({
    repositories,
    clock: fixedClock(),
    builtins: BUILTIN_RULE_SETS,
  });
}

function setupFor(ruleSetId: string): CreateGameInput {
  return {
    ruleSetId,
    ruleSetOrigin: 'builtin',
    playerNames: ['Michel', 'Paul', 'Anne', 'Karin'],
    teamNames: ['Michel / Anne', 'Paul / Karin'],
    teamSeats: [
      [0, 2],
      [1, 3],
    ],
    overrides: [],
    gameName: 'Donderdagavond',
  };
}

async function startGame(ruleSetId = classic.id, overrides: CreateGameInput['overrides'] = []) {
  const outcome = await services.games.create({ ...setupFor(ruleSetId), overrides });
  if (!outcome.ok) throw new Error(`kon geen spel maken: ${JSON.stringify(outcome)}`);
  return outcome.game;
}

async function addRound(gameId: string, teams: { id: string }[], points: number[]) {
  const fields = buildFieldLayout(classic).flatMap((group) => group.fields);
  const outcome = await services.rounds.saveNew({
    gameId,
    inputs: teams.map((team, index) => ({
      ...blankInput(team.id, fields),
      cardPoints: points[index] ?? 0,
      naturalCanastas: index === 0 ? 1 : 0,
      redThrees: index === 0 ? 1 : 0,
      opened: true,
    })),
  });
  if (!outcome.ok) throw new Error(`ronde opslaan mislukte: ${JSON.stringify(outcome)}`);
  return outcome;
}

async function exportOf(gameId: string): Promise<CanastaExportV1> {
  const result = await services.transfer.exportGame(gameId);
  if (!result.ok) throw new Error('export mislukte');
  return result.document;
}

/** A game with two rounds, exported. */
async function playedAndExported() {
  const game = await startGame();
  await addRound(game.id, game.teams, [400, 300]);
  await addRound(game.id, game.teams, [250, 510]);
  return { game, document: await exportOf(game.id) };
}

async function importJson(text: string) {
  const parsed = services.transfer.parse(text);
  if (!parsed.ok) throw new Error(`parse mislukte: ${parsed.reason}`);
  return services.transfer.importGame(parsed.document);
}

// --- Export -----------------------------------------------------------------

describe('export', () => {
  it('exports a game that is still in progress', async () => {
    const { game, document } = await playedAndExported();

    expect(document.format).toBe(EXPORT_FORMAT);
    expect(document.version).toBe(1);
    expect(document.game.sourceId).toBe(game.id);
    expect(document.game.status).toBe('active');
    expect(document.game.rounds).toHaveLength(2);
  });

  it('exports a finished game with its result intact', async () => {
    const game = await startGame();
    await addRound(game.id, game.teams, [5200, 300]);

    const document = await exportOf(game.id);

    expect(document.game.status).toBe('finished');
    expect(document.game.result?.winnerTeamIds).toEqual([game.teams[0]!.id]);
    expect(document.game.finishedAt).toBeTruthy();
  });

  it('carries the complete effective rule set, not a reference', async () => {
    const { document } = await playedAndExported();
    const ruleSet = document.game.effectiveRuleSet;

    expect(ruleSet.fields.length).toBeGreaterThan(0);
    expect(ruleSet.scoringRules.length).toBeGreaterThan(0);
    expect(ruleSet.settings.length).toBeGreaterThan(0);
    expect(ruleSet.constraints.length).toBeGreaterThan(0);
    expect(ruleSet.provenance.entries.length).toBeGreaterThan(0);
    expect(ruleSet.source.url).toBe(classic.source.url);
    expect(ruleSet.configuration.endGame.targetScore).toBe(5000);
  });

  it('carries house rules folded into the snapshot', async () => {
    const game = await startGame(classic.id, [{ path: 'endGame.targetScore', value: 3000 }]);
    const document = await exportOf(game.id);

    expect(document.game.effectiveRuleSet.configuration.endGame.targetScore).toBe(3000);
    expect(document.game.gameOverrides).toEqual([{ path: 'endGame.targetScore', value: 3000 }]);
  });

  it('records the engine version that produced the scores', async () => {
    const { game, document } = await playedAndExported();

    expect(document.game.engineVersion).toBe(game.engineVersion);
    expect(document.application.engineVersion).toBe(game.engineVersion);
  });

  it('carries every round input', async () => {
    const { document } = await playedAndExported();

    expect(document.game.rounds.map((round) => round.input.teams[0]?.cardPoints)).toEqual([
      400, 250,
    ]);
    expect(document.game.rounds[0]?.input.teams[0]?.naturalCanastas).toBe(1);
    expect(document.game.rounds.every((round) => round.input.teams.length === 2)).toBe(true);
  });

  it('does not export an unsaved draft as a round', async () => {
    const game = await startGame();
    await addRound(game.id, game.teams, [400, 300]);

    // A half-typed round, never committed.
    const fields = buildFieldLayout(classic).flatMap((group) => group.fields);
    await services.rounds.saveDraft(`roundEntry:${game.id}`, game.id, {
      inputs: game.teams.map((team) => ({ ...blankInput(team.id, fields), cardPoints: 9999 })),
    });

    const document = await exportOf(game.id);

    expect(document.game.rounds).toHaveLength(1);
    expect(document.game.rounds.some((round) => round.input.teams[0]?.cardPoints === 9999)).toBe(
      false,
    );
  });

  it('builds a filename that is safe on every platform', () => {
    expect(exportFileName({ name: 'Michel / Anne vs Paul' }, '2026-09-19T12:00:00.000Z')).toBe(
      'canasta-michel-anne-vs-paul-2026-09-19.json',
    );
    expect(exportFileName({ name: '  ' }, '2026-09-19T12:00:00.000Z')).toBe(
      'canasta-2026-09-19.json',
    );
    expect(exportFileName({ name: 'a\\b:c*?"<>|' }, '2026-09-19T12:00:00.000Z')).not.toMatch(
      /[\\/:*?"<>|]/,
    );
  });

  it('reports a game that does not exist', async () => {
    expect(await services.transfer.exportGame('bestaat-niet')).toEqual({
      ok: false,
      reason: 'notFound',
    });
  });
});

// --- Import -----------------------------------------------------------------

describe('import', () => {
  it('imports a valid export', async () => {
    const { document } = await playedAndExported();
    const outcome = await services.transfer.importGame(document);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.rounds).toHaveLength(2);
  });

  it('mints a new id for the game, players, teams and rounds', async () => {
    const { game, document } = await playedAndExported();
    const outcome = await services.transfer.importGame(document);
    if (!outcome.ok) throw new Error('import mislukte');

    expect(outcome.game.id).not.toBe(game.id);
    expect(outcome.game.players.map((player) => player.id)).not.toEqual(
      game.players.map((player) => player.id),
    );
    expect(outcome.game.teams.map((team) => team.id)).not.toEqual(
      game.teams.map((team) => team.id),
    );

    const originalRoundIds = (await services.games.load(game.id))!.rounds.map((r) => r.id);
    expect(outcome.rounds.map((round) => round.id)).not.toEqual(originalRoundIds);
  });

  it('remaps every reference, leaving no source id behind', async () => {
    const { document } = await playedAndExported();
    const outcome = await services.transfer.importGame(document);
    if (!outcome.ok) throw new Error('import mislukte');

    const newPlayerIds = new Set(outcome.game.players.map((player) => player.id));
    const newTeamIds = new Set(outcome.game.teams.map((team) => team.id));

    // Team membership points at the imported players.
    for (const team of outcome.game.teams) {
      for (const memberId of team.memberIds) {
        expect(newPlayerIds.has(memberId)).toBe(true);
      }
    }

    // Round inputs point at the imported teams, and belong to the new game.
    for (const round of outcome.rounds) {
      expect(round.gameId).toBe(outcome.game.id);
      for (const teamInput of round.input.teams) {
        expect(newTeamIds.has(teamInput.teamId)).toBe(true);
      }
    }

    // No id from the file survives anywhere in the stored records.
    const sourceIds = new Set<string>([
      document.game.sourceId,
      ...document.game.players.map((player) => player.id),
      ...document.game.teams.map((team) => team.id),
      ...document.game.rounds.map((round) => round.sourceId),
    ]);
    const stored = JSON.stringify({
      game: { ...outcome.game, importedFrom: undefined },
      rounds: outcome.rounds,
    });
    for (const sourceId of sourceIds) {
      expect(stored).not.toContain(sourceId);
    }
  });

  it('records where it came from', async () => {
    const { game, document } = await playedAndExported();
    const outcome = await services.transfer.importGame(document);
    if (!outcome.ok) throw new Error('import mislukte');

    expect(outcome.game.importedFrom?.gameId).toBe(game.id);
  });

  it('keeps the rule set snapshot byte-for-byte', async () => {
    const { document } = await playedAndExported();
    const outcome = await services.transfer.importGame(document);
    if (!outcome.ok) throw new Error('import mislukte');

    expect(outcome.game.effectiveRuleSet).toEqual(document.game.effectiveRuleSet);
  });

  it('keeps the engine version rather than adopting the current one', async () => {
    const { document } = await playedAndExported();
    // A file written by an older engine.
    const older: CanastaExportV1 = structuredClone(document);
    older.game.engineVersion = 0;
    older.application.engineVersion = 0;

    const outcome = await services.transfer.importGame(older);
    if (!outcome.ok) throw new Error('import mislukte');

    expect(outcome.game.engineVersion).toBe(0);
  });

  it('keeps every round input exactly', async () => {
    const { document } = await playedAndExported();
    const outcome = await services.transfer.importGame(document);
    if (!outcome.ok) throw new Error('import mislukte');

    outcome.rounds.forEach((round, index) => {
      const source = document.game.rounds[index]!;
      round.input.teams.forEach((teamInput, teamIndex) => {
        const sourceInput = source.input.teams[teamIndex]!;
        // Everything but the remapped team id is identical.
        expect({ ...teamInput, teamId: '' }).toEqual({ ...sourceInput, teamId: '' });
      });
    });
  });

  it('reconstructs the scores and history', async () => {
    const { game, document } = await playedAndExported();
    const original = await services.games.load(game.id);
    const outcome = await services.transfer.importGame(document);
    if (!outcome.ok) throw new Error('import mislukte');

    const imported = await services.games.load(outcome.game.id);

    const totals = (loaded: NonNullable<typeof original>) =>
      loaded.game.teams
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((team) => loaded.game.summary?.totalsByTeam[team.id]);

    expect(totals(imported!)).toEqual(totals(original!));
    expect(imported!.rounds).toHaveLength(original!.rounds.length);
    expect(imported!.rounds.map((round) => round.computed?.scores[0]?.total)).toEqual(
      original!.rounds.map((round) => round.computed?.scores[0]?.total),
    );
  });

  it('keeps a finished game finished, with its winner', async () => {
    const game = await startGame();
    await addRound(game.id, game.teams, [5200, 300]);
    const document = await exportOf(game.id);

    const outcome = await services.transfer.importGame(document);
    if (!outcome.ok) throw new Error('import mislukte');

    expect(outcome.game.status).toBe('finished');
    expect(outcome.game.finishedAt).toBe(document.game.finishedAt);
    expect(outcome.game.result?.winnerTeamIds).toEqual([outcome.game.teams[0]!.id]);
    expect(outcome.game.result?.tie).toBe(false);
  });

  it('keeps a tie-break game unfinished, as the app policy says', async () => {
    const game = await startGame();

    // Symmetrical on purpose: `addRound` gives the first team an extra canasta,
    // which would break the tie this test is about.
    const fields = buildFieldLayout(classic).flatMap((group) => group.fields);
    await services.rounds.saveNew({
      gameId: game.id,
      inputs: game.teams.map((team) => ({
        ...blankInput(team.id, fields),
        cardPoints: 5200,
        opened: true,
      })),
    });

    const document = await exportOf(game.id);

    expect(document.game.status).toBe('active');
    expect(document.game.result).toBeUndefined();

    const outcome = await services.transfer.importGame(document);
    if (!outcome.ok) throw new Error('import mislukte');

    expect(outcome.game.status).toBe('active');
    expect(outcome.game.result).toBeUndefined();

    // And the scoreboard still reports the tie-break, not a winner.
    const loaded = await services.games.load(outcome.game.id);
    const { projection } = recomputeGame({ game: loaded!.game, rounds: loaded!.rounds });
    expect(projection.endState.kind).toBe('tieBreakRound');
  });

  it('imports a Modern American game just as well', async () => {
    const game = await startGame(modernAmerican.id);
    await addRound(game.id, game.teams, [400, 300]);
    const document = await exportOf(game.id);

    const outcome = await services.transfer.importGame(document);
    if (!outcome.ok) throw new Error('import mislukte');

    expect(outcome.game.effectiveRuleSet.configuration.endGame.targetScore).toBe(8500);
    expect(outcome.rounds).toHaveLength(1);
  });
});

// --- Duplicate import -------------------------------------------------------

describe('importing the same file twice', () => {
  it('creates two independent games', async () => {
    const { document } = await playedAndExported();

    const first = await services.transfer.importGame(document);
    const second = await services.transfer.importGame(document);
    if (!first.ok || !second.ok) throw new Error('import mislukte');

    expect(first.game.id).not.toBe(second.game.id);
    expect(await services.games.list()).toHaveLength(3); // origineel + twee imports
  });

  it('leaves the first import untouched', async () => {
    const { document } = await playedAndExported();

    const first = await services.transfer.importGame(document);
    if (!first.ok) throw new Error('import mislukte');
    const beforeSecond = await services.games.load(first.game.id);

    await services.transfer.importGame(document);

    const afterSecond = await services.games.load(first.game.id);
    expect(afterSecond).toEqual(beforeSecond);
  });

  it('does not overwrite the original game', async () => {
    const { game, document } = await playedAndExported();
    const before = await services.games.load(game.id);

    await services.transfer.importGame(document);

    expect(await services.games.load(game.id)).toEqual(before);
  });
});

// --- Invalid files ----------------------------------------------------------

describe('invalid files are refused', () => {
  function reasonFor(text: string) {
    const parsed = parseExport(text);
    return parsed.ok ? 'ok' : parsed.reason;
  }

  it('refuses text that is not JSON', () => {
    expect(reasonFor('dit is geen json')).toBe('invalidJson');
  });

  it('refuses a different format', () => {
    expect(reasonFor(JSON.stringify({ format: 'something-else', version: 1 }))).toBe(
      'unknownFormat',
    );
  });

  it('refuses an unsupported version', () => {
    expect(reasonFor(JSON.stringify({ format: EXPORT_FORMAT, version: 999 }))).toBe(
      'unsupportedVersion',
    );
  });

  it('refuses a document with no game', () => {
    expect(
      reasonFor(
        JSON.stringify({
          format: EXPORT_FORMAT,
          version: 1,
          exportedAt: '2026-09-19T12:00:00.000Z',
          application: { engineVersion: 1 },
        }),
      ),
    ).toBe('invalidStructure');
  });

  it('refuses a document with no players or teams', async () => {
    const { document } = await playedAndExported();
    const broken = structuredClone(document);
    broken.game.players = [];
    expect(reasonFor(JSON.stringify(broken))).toBe('invalidStructure');

    const noTeams = structuredClone(document);
    noTeams.game.teams = [];
    expect(reasonFor(JSON.stringify(noTeams))).toBe('invalidStructure');
  });

  it('refuses a round without input', async () => {
    const { document } = await playedAndExported();
    const broken = structuredClone(document) as unknown as {
      game: { rounds: { input?: unknown }[] };
    };
    delete broken.game.rounds[0]!.input;

    expect(reasonFor(JSON.stringify(broken))).toBe('invalidStructure');
  });

  it('refuses a round input that is missing a field', async () => {
    const { document } = await playedAndExported();
    const broken = structuredClone(document) as unknown as {
      game: { rounds: { input: { teams: { cardPoints?: unknown }[] } }[] };
    };
    delete broken.game.rounds[0]!.input.teams[0]!.cardPoints;

    expect(reasonFor(JSON.stringify(broken))).toBe('invalidStructure');
  });

  it('refuses an invalid rule set', async () => {
    const { document } = await playedAndExported();
    const broken = structuredClone(document);
    // A target score of 0 breaks the rule set's own constraint.
    broken.game.effectiveRuleSet.configuration.endGame.targetScore = 0;

    const parsed = parseExport(JSON.stringify(broken));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toBe('invalidRuleSet');
    expect(parsed.issues?.map((issue) => issue.code)).toContain('targetScorePositive');
  });

  it('refuses a rule set that is structurally incomplete', async () => {
    const { document } = await playedAndExported();
    const broken = structuredClone(document) as unknown as {
      game: { effectiveRuleSet: { scoringRules?: unknown } };
    };
    delete broken.game.effectiveRuleSet.scoringRules;

    expect(reasonFor(JSON.stringify(broken))).toBe('invalidStructure');
  });

  it('refuses duplicate ids inside the file', async () => {
    const { document } = await playedAndExported();

    const duplicatePlayers = structuredClone(document);
    duplicatePlayers.game.players[1]!.id = duplicatePlayers.game.players[0]!.id;
    expect(reasonFor(JSON.stringify(duplicatePlayers))).toBe('invalidReferences');

    const duplicateRounds = structuredClone(document);
    duplicateRounds.game.rounds[1]!.sourceId = duplicateRounds.game.rounds[0]!.sourceId;
    expect(reasonFor(JSON.stringify(duplicateRounds))).toBe('invalidReferences');
  });

  it('refuses a team that points at a player which is not in the file', async () => {
    const { document } = await playedAndExported();
    const broken = structuredClone(document);
    broken.game.teams[0]!.memberIds = ['speler-die-niet-bestaat'];

    expect(reasonFor(JSON.stringify(broken))).toBe('invalidReferences');
  });

  it('refuses a round that scores a team which is not in the file', async () => {
    const { document } = await playedAndExported();
    const broken = structuredClone(document);
    broken.game.rounds[0]!.input.teams[0]!.teamId = 'team-dat-niet-bestaat';

    expect(reasonFor(JSON.stringify(broken))).toBe('invalidReferences');
  });

  it('refuses a result that names a team which is not in the file', async () => {
    const game = await startGame();
    await addRound(game.id, game.teams, [5200, 300]);
    const document = await exportOf(game.id);

    const broken = structuredClone(document);
    broken.game.result!.winnerTeamIds = ['team-dat-niet-bestaat'];

    expect(reasonFor(JSON.stringify(broken))).toBe('invalidReferences');
  });

  it('never writes anything when a file is refused', async () => {
    const { document } = await playedAndExported();
    const broken = structuredClone(document);
    broken.game.teams[0]!.memberIds = ['speler-die-niet-bestaat'];

    const before = await services.games.list();
    expect(parseExport(JSON.stringify(broken)).ok).toBe(false);
    expect(await services.games.list()).toEqual(before);
  });

  it('explains itself in Dutch, without a stack trace', () => {
    const parsed = parseExport('{ kapot');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toBe('Dit bestand is geen geldige JSON.');
    expect(parsed.message).not.toMatch(/at .*\d+:\d+/);
  });
});

// --- Transaction ------------------------------------------------------------

describe('a failing import leaves nothing behind', () => {
  it('rolls back when a round cannot be written', async () => {
    const { document } = await playedAndExported();
    const before = await services.games.list();

    // A repository that fails on the second round, once the game is already in.
    let roundWrites = 0;
    const flaky: Repositories = {
      ...storage.repositories,
      rounds: {
        ...storage.repositories.rounds,
        create: async (round) => {
          roundWrites += 1;
          if (roundWrites === 2) throw new Error('schijf vol');
          return storage.repositories.rounds.create(round);
        },
      },
    };

    const outcome = await build(flaky).transfer.importGame(document);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('storage');

    // No half-imported game, and no orphaned rounds.
    expect(await services.games.list()).toEqual(before);
    const allRounds = await Promise.all(before.map((summary) => services.games.load(summary.id)));
    expect(allRounds.flatMap((loaded) => loaded?.rounds ?? [])).toHaveLength(2);
  });
});

// --- Historical integrity ---------------------------------------------------

describe('historical integrity', () => {
  it('uses the snapshot from the file, not the current rule set', async () => {
    // A game played under a house rule the built-in does not have.
    const game = await startGame(classic.id, [{ path: 'scoring.canastas.natural', value: 750 }]);
    await addRound(game.id, game.teams, [0, 0]);
    const document = await exportOf(game.id);

    const outcome = await services.transfer.importGame(document);
    if (!outcome.ok) throw new Error('import mislukte');

    expect(outcome.game.effectiveRuleSet.configuration.scoring.canastas.natural).toBe(750);
    // The built-in is untouched, and was never consulted.
    expect(classic.configuration.scoring.canastas.natural).toBe(500);

    // 750 for the canasta plus 100 for one red three.
    expect(outcome.rounds[0]?.computed?.scores[0]?.total).toBe(850);
  });

  it('reports a mismatch instead of adopting the totals from the file', async () => {
    const { document } = await playedAndExported();

    // A file whose recorded totals disagree with its own inputs.
    const tampered = structuredClone(document);
    const firstTeamId = tampered.game.teams[0]!.id;
    tampered.game.summary = {
      totalsByTeam: { [firstTeamId]: 999999 },
      roundCount: tampered.game.rounds.length,
    };

    const outcome = await services.transfer.importGame(tampered);
    if (!outcome.ok) throw new Error('import mislukte');

    expect(outcome.scoreMismatch).toHaveLength(1);
    expect(outcome.scoreMismatch?.[0]?.exported).toBe(999999);
    // The replay from the inputs wins.
    expect(outcome.game.summary?.totalsByTeam[outcome.game.teams[0]!.id]).not.toBe(999999);
  });
});

// --- Round trip -------------------------------------------------------------

describe('round trip', () => {
  it('produces a game that is identical apart from ids and import metadata', async () => {
    const game = await startGame();
    await addRound(game.id, game.teams, [400, 300]);
    await addRound(game.id, game.teams, [250, 510]);
    await addRound(game.id, game.teams, [800, 120]);

    const original = (await services.games.load(game.id))!;
    const json = (await services.transfer.exportGame(game.id)) as { json: string };

    const outcome = await importJson(json.json);
    if (!outcome.ok) throw new Error('import mislukte');
    const imported = (await services.games.load(outcome.game.id))!;

    // Rule set and engine version travel untouched.
    expect(imported.game.effectiveRuleSet).toEqual(original.game.effectiveRuleSet);
    expect(imported.game.engineVersion).toBe(original.game.engineVersion);

    // Same status, same round count.
    expect(imported.game.status).toBe(original.game.status);
    expect(imported.rounds).toHaveLength(original.rounds.length);

    // Same inputs, apart from the remapped team ids.
    const strip = (loaded: typeof original) =>
      loaded.rounds.map((round) => ({
        sequence: round.sequence,
        teams: round.input.teams.map((teamInput) => ({ ...teamInput, teamId: undefined })),
      }));
    expect(strip(imported)).toEqual(strip(original));

    // Same scores, in team order.
    const totals = (loaded: typeof original) =>
      loaded.game.teams
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((team) => loaded.game.summary?.totalsByTeam[team.id]);
    expect(totals(imported)).toEqual(totals(original));

    // Same audit trail, line for line.
    const lines = (loaded: typeof original) =>
      loaded.rounds.map((round) =>
        round.computed?.scores.map((score) =>
          score.breakdown.lines.map((line) => [line.ruleId, line.value]),
        ),
      );
    expect(lines(imported)).toEqual(lines(original));

    // The players and teams are the same people under new ids.
    expect(imported.game.players.map((player) => player.name)).toEqual(
      original.game.players.map((player) => player.name),
    );
    expect(imported.game.teams.map((team) => team.name)).toEqual(
      original.game.teams.map((team) => team.name),
    );
  });

  it('survives a second round trip', async () => {
    const { game } = await playedAndExported();
    const first = (await services.transfer.exportGame(game.id)) as { json: string };

    const importedOnce = await importJson(first.json);
    if (!importedOnce.ok) throw new Error('import mislukte');

    const second = (await services.transfer.exportGame(importedOnce.game.id)) as { json: string };
    const importedTwice = await importJson(second.json);
    if (!importedTwice.ok) throw new Error('tweede import mislukte');

    expect(importedTwice.game.effectiveRuleSet).toEqual(importedOnce.game.effectiveRuleSet);
    expect(importedTwice.game.summary?.totalsByTeam[importedTwice.game.teams[0]!.id]).toBe(
      importedOnce.game.summary?.totalsByTeam[importedOnce.game.teams[0]!.id],
    );
  });
});

// --- Preview ----------------------------------------------------------------

describe('preview', () => {
  it('summarises the file before anything is written', async () => {
    const { document } = await playedAndExported();
    const preview = services.transfer.preview(document);

    expect(preview).toMatchObject({
      gameName: 'Donderdagavond',
      ruleSetName: 'Classic Canasta',
      playerCount: 4,
      teamCount: 2,
      roundCount: 2,
      status: 'active',
    });
  });
});
