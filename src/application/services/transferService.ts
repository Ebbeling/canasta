import type { GameId } from '@/domain/ids';
import type { Clock, Repositories } from '@/application/ports';
import {
  buildExportDocument,
  exportFileName,
  serialiseExport,
} from '@/application/transfer/exportGame';
import {
  parseExport,
  previewOf,
  type ImportPreview,
  type ParseResult,
} from '@/application/transfer/parseExport';
import { importDocument, type ImportOutcome } from '@/application/transfer/importGame';
import type { CanastaExportV1 } from '@/application/transfer/format';

export type ExportOutcome =
  | { ok: true; document: CanastaExportV1; json: string; fileName: string }
  | { ok: false; reason: 'notFound' };

/**
 * Export and import of a single game.
 *
 * Framework-free on purpose: this service produces and consumes text. Files,
 * blobs, downloads and `<input type="file">` belong to the UI.
 */
export interface TransferService {
  exportGame(gameId: GameId): Promise<ExportOutcome>;
  /** Pure. Validates without touching the database, so a preview is free. */
  parse(text: string): ParseResult;
  preview(document: CanastaExportV1): ImportPreview;
  importGame(document: CanastaExportV1): Promise<ImportOutcome>;
}

export interface TransferServiceDeps {
  repositories: Repositories;
  clock: Clock;
  appVersion?: string;
}

export function createTransferService(deps: TransferServiceDeps): TransferService {
  return {
    async exportGame(gameId) {
      const game = await deps.repositories.games.get(gameId);
      if (!game) return { ok: false, reason: 'notFound' };

      // Only committed rounds. Drafts are unsaved UI state and never travel.
      const rounds = await deps.repositories.rounds.listByGame(gameId);
      const exportedAt = deps.clock.now();

      const document = buildExportDocument(game, rounds, {
        exportedAt,
        appVersion: deps.appVersion,
      });

      return {
        ok: true,
        document,
        json: serialiseExport(document),
        fileName: exportFileName(game, exportedAt),
      };
    },

    parse(text) {
      return parseExport(text);
    },

    preview(document) {
      return previewOf(document);
    },

    importGame(document) {
      return importDocument({ repositories: deps.repositories, clock: deps.clock }, document);
    },
  };
}
