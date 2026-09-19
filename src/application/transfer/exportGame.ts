import type { Game } from '@/domain/game';
import type { Round } from '@/domain/round';
import type { RuleSet } from '@/rules/schema/ruleSet';
import { EXPORT_FORMAT, EXPORT_VERSION, type CanastaExportV1 } from './format';

/**
 * Builds the export document for a game.
 *
 * Pure: it takes the stored game and its rounds and returns plain data. Files,
 * blobs and downloads live in the UI layer.
 *
 * Drafts are deliberately absent. A draft is unsaved UI state, so exporting one
 * would put a half-typed round into a document that is supposed to represent a
 * game as it was actually played.
 */
export function buildExportDocument(
  game: Game,
  rounds: readonly Round[],
  options: { exportedAt: string; appVersion?: string },
): CanastaExportV1 {
  const ordered = [...rounds].sort((a, b) => a.sequence - b.sequence);

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: options.exportedAt,
    application: {
      // The engine that produced these scores, not necessarily the current one.
      engineVersion: game.engineVersion,
      appVersion: options.appVersion,
    },
    game: {
      sourceId: game.id,
      name: game.name,
      status: game.status,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
      finishedAt: game.finishedAt,
      players: structuredClone(game.players),
      teams: structuredClone(game.teams),
      ruleSetRef: structuredClone(game.ruleSetRef),
      // The frozen snapshot, in full. This is what makes the file self-contained.
      effectiveRuleSet: structuredClone(game.effectiveRuleSet) as RuleSet,
      gameOverrides: structuredClone(game.gameOverrides),
      engineVersion: game.engineVersion,
      result: game.result ? structuredClone(game.result) : undefined,
      summary: game.summary
        ? {
            totalsByTeam: { ...game.summary.totalsByTeam },
            roundCount: game.summary.roundCount,
          }
        : undefined,
      rounds: ordered.map((round) => ({
        sourceId: round.id,
        sequence: round.sequence,
        status: round.status,
        createdAt: round.createdAt,
        updatedAt: round.updatedAt,
        input: structuredClone(round.input),
        note: round.note,
        computed: round.computed ? structuredClone(round.computed) : undefined,
      })),
    },
  };
}

/** Serialises the document as UTF-8 JSON, indented so a human can read it. */
export function serialiseExport(document: CanastaExportV1): string {
  return JSON.stringify(document, null, 2);
}

/**
 * A filename that is safe on Windows, macOS and Linux.
 *
 * Everything outside letters, digits, dash and underscore is replaced, so a
 * game called "Michel / Anne vs Paul" cannot produce a path separator.
 */
export function exportFileName(game: Pick<Game, 'name'>, exportedAt: string): string {
  const date = exportedAt.slice(0, 10);
  const raw = game.name?.trim() ?? '';

  const slug = raw
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .toLowerCase();

  return slug ? `canasta-${slug}-${date}.json` : `canasta-${date}.json`;
}
