import { newId, type GameId, type PlayerId, type RoundId, type TeamId } from '@/domain/ids';
import type { Game, GameResult, Player, Team } from '@/domain/game';
import type { Round, TeamRoundInput } from '@/domain/round';
import type { RuleSet } from '@/rules/schema/ruleSet';
import { deepFreeze } from '@/domain/freeze';
import { recomputeGame } from '@/scoring/recompute';
import type { Clock, Repositories } from '@/application/ports';
import { applyProjection } from '@/application/services/gameService';
import type { CanastaExportV1 } from './format';

/**
 * Every id in the document mapped to a freshly minted one.
 *
 * Importing must never reuse the source ids: the same file imported twice has
 * to produce two independent games, and an import must not be able to overwrite
 * a game that happens to share an id.
 */
export interface IdMapping {
  gameId: { from: string; to: GameId };
  players: Map<string, PlayerId>;
  teams: Map<string, TeamId>;
  rounds: Map<string, RoundId>;
}

export function buildIdMapping(document: CanastaExportV1): IdMapping {
  const { game } = document;

  return {
    gameId: { from: game.sourceId, to: newId() },
    players: new Map(game.players.map((player) => [player.id, newId()])),
    teams: new Map(game.teams.map((team) => [team.id, newId()])),
    rounds: new Map(game.rounds.map((round) => [round.sourceId, newId()])),
  };
}

function remapRecord(
  source: Record<string, number> | undefined,
  teams: Map<string, TeamId>,
): Record<TeamId, number> {
  const result: Record<TeamId, number> = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    const mapped = teams.get(key);
    if (mapped) result[mapped] = value;
  }
  return result;
}

/**
 * Rebuilds the game and its rounds under new ids.
 *
 * Pure: it produces the records but writes nothing.
 */
export function remapDocument(
  document: CanastaExportV1,
  mapping: IdMapping,
  importedAt: string,
): { game: Game; rounds: Round[] } {
  const source = document.game;

  const players: Player[] = source.players.map((player) => ({
    id: mapping.players.get(player.id)!,
    name: player.name,
    seat: player.seat,
  }));

  const teams: Team[] = source.teams.map((team) => ({
    id: mapping.teams.get(team.id)!,
    name: team.name,
    memberIds: team.memberIds.map((memberId) => mapping.players.get(memberId)!),
    order: team.order,
  }));

  const result: GameResult | undefined = source.result
    ? {
        winnerTeamIds: source.result.winnerTeamIds.map((id) => mapping.teams.get(id)!),
        finalScores: remapRecord(source.result.finalScores, mapping.teams),
        decidedAfterRound: source.result.decidedAfterRound,
        tie: source.result.tie,
      }
    : undefined;

  const game: Game = {
    id: mapping.gameId.to,
    name: source.name,
    status: source.status,
    createdAt: source.createdAt,
    updatedAt: importedAt,
    finishedAt: source.finishedAt,
    players,
    teams,
    ruleSetRef: { ...source.ruleSetRef },
    // The snapshot from the file, not a lookup of the current rule set. A rule
    // set that changed since the export cannot reach an imported game.
    effectiveRuleSet: deepFreeze(structuredClone(source.effectiveRuleSet) as RuleSet),
    gameOverrides: structuredClone(source.gameOverrides),
    // Preserved as recorded. A newer engine does not silently adopt old scores.
    engineVersion: source.engineVersion,
    result,
    importedFrom: { gameId: mapping.gameId.from, at: importedAt },
  };

  const rounds: Round[] = [...source.rounds]
    .sort((a, b) => a.sequence - b.sequence)
    .map((round) => ({
      id: mapping.rounds.get(round.sourceId)!,
      gameId: mapping.gameId.to,
      sequence: round.sequence,
      status: round.status,
      createdAt: round.createdAt,
      updatedAt: round.updatedAt,
      input: {
        teams: round.input.teams.map((teamInput): TeamRoundInput => ({
          ...teamInput,
          teamId: mapping.teams.get(teamInput.teamId)!,
          extra: { ...teamInput.extra },
        })),
      },
      note: round.note,
      // Deliberately dropped: the stored computation is a cache keyed by the old
      // team ids. It is rebuilt below from `input`, which is the source of truth.
    }));

  return { game, rounds };
}

export type ImportOutcome =
  | {
      ok: true;
      game: Game;
      rounds: Round[];
      mapping: IdMapping;
      /** Set when the replay disagreed with the totals recorded in the file. */
      scoreMismatch?: { teamId: TeamId; exported: number; recomputed: number }[];
    }
  | { ok: false; reason: 'storage'; message: string; detail?: string };

export interface ImportDeps {
  repositories: Repositories;
  clock: Clock;
}

/**
 * Writes a validated export document into the database.
 *
 * Everything is validated and remapped before the transaction opens, and the
 * whole write happens inside one transaction, so a failure part-way cannot
 * leave a half-imported game behind.
 */
export async function importDocument(
  deps: ImportDeps,
  document: CanastaExportV1,
): Promise<ImportOutcome> {
  const importedAt = deps.clock.now();
  const mapping = buildIdMapping(document);
  const { game, rounds } = remapDocument(document, mapping, importedAt);

  // Replay from the inputs under the game's own snapshot. This is the existing
  // engine — no second scoring path for imports.
  const { rounds: computed, projection } = recomputeGame({ game, rounds });
  const restored = applyProjection(game, projection, computed.length, importedAt);

  // The file's own totals are an integrity check, never the source of truth.
  const scoreMismatch: { teamId: TeamId; exported: number; recomputed: number }[] = [];
  const exportedTotals = remapRecord(document.game.summary?.totalsByTeam, mapping.teams);
  for (const [teamId, exported] of Object.entries(exportedTotals)) {
    const recomputedTotal = projection.totalsByTeam[teamId] ?? 0;
    if (recomputedTotal !== exported) {
      scoreMismatch.push({ teamId, exported, recomputed: recomputedTotal });
    }
  }

  try {
    await deps.repositories.transaction(['games', 'rounds'], async () => {
      await deps.repositories.games.create(restored);
      for (const round of computed) {
        await deps.repositories.rounds.create(round);
      }
    });
  } catch (error) {
    return {
      ok: false,
      reason: 'storage',
      message: 'Het spel kon niet worden opgeslagen. Er is niets geïmporteerd.',
      detail: (error as Error).message,
    };
  }

  return {
    ok: true,
    game: restored,
    rounds: computed,
    mapping,
    scoreMismatch: scoreMismatch.length > 0 ? scoreMismatch : undefined,
  };
}
