import { newId, type GameId } from '@/domain/ids';
import type { Tournament, TournamentId } from '@/domain/tournament';
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
import {
  tournamentExportV1Schema,
  TOURNAMENT_EXPORT_FORMAT,
  TOURNAMENT_EXPORT_VERSION,
  type CanastaTournamentExportV1,
} from '@/application/transfer/tournamentFormat';

export type ExportOutcome =
  | { ok: true; document: CanastaExportV1; json: string; fileName: string }
  | { ok: false; reason: 'notFound' };

export type TournamentExportOutcome =
  | { ok: true; document: CanastaTournamentExportV1; json: string; fileName: string }
  | { ok: false; reason: 'notFound' };

export type TournamentParseResult =
  | { ok: true; document: CanastaTournamentExportV1 }
  | { ok: false; reason: 'invalidJson' | 'unknownFormat' | 'invalidShape'; message: string };

export type TournamentImportOutcome =
  | { ok: true; tournament: Tournament; importedGames: number }
  | { ok: false; reason: 'storage'; message: string };

/**
 * Export and import of a single game.
 *
 * Framework-free on purpose: this service produces and consumes text. Files,
 * blobs, downloads and `<input type="file">` belong to the UI.
 */
export interface TransferService {
  exportGame(gameId: GameId): Promise<ExportOutcome>;
  /**
   * A whole tournament: its schedule, its people and a complete export of every
   * game played at its tables. Self-contained in the same way a game export is.
   */
  exportTournament(tournamentId: TournamentId): Promise<TournamentExportOutcome>;
  parseTournament(text: string): TournamentParseResult;
  importTournament(document: CanastaTournamentExportV1): Promise<TournamentImportOutcome>;
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

    async exportTournament(tournamentId) {
      const tournament = await deps.repositories.tournaments.get(tournamentId);
      if (!tournament) return { ok: false, reason: 'notFound' };

      const exportedAt = deps.clock.now();
      const gameIds = [
        ...new Set(
          tournament.rounds
            .flatMap((round) => round.matches)
            .map((match) => match.gameId)
            .filter((id): id is GameId => Boolean(id)),
        ),
      ];

      const games: CanastaExportV1[] = [];
      for (const id of gameIds) {
        const game = await deps.repositories.games.get(id);
        if (!game) continue;
        const rounds = await deps.repositories.rounds.listByGame(id);
        games.push(
          buildExportDocument(game, rounds, { exportedAt, appVersion: deps.appVersion }),
        );
      }

      const document: CanastaTournamentExportV1 = {
        format: TOURNAMENT_EXPORT_FORMAT,
        version: TOURNAMENT_EXPORT_VERSION,
        exportedAt,
        application: { appVersion: deps.appVersion },
        tournament: structuredClone(tournament),
        games,
      };

      const safeName = tournament.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      return {
        ok: true,
        document,
        json: JSON.stringify(document, null, 2),
        fileName: `canasta-toernooi-${safeName || 'zonder-naam'}-${exportedAt.slice(0, 10)}.json`,
      };
    },

    parseTournament(text) {
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        return {
          ok: false,
          reason: 'invalidJson',
          message: 'Dit bestand is geen geldige JSON.',
        };
      }

      const envelope = raw as { format?: unknown; version?: unknown };
      if (envelope?.format !== TOURNAMENT_EXPORT_FORMAT) {
        return {
          ok: false,
          reason: 'unknownFormat',
          message: 'Dit is geen Canasta-toernooibestand.',
        };
      }

      const parsed = tournamentExportV1Schema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          reason: 'invalidShape',
          message: 'Dit toernooibestand mist gegevens of is beschadigd.',
        };
      }

      // The schema checks the shape this app depends on; the rule sets inside
      // are then handed to the ordinary game import, which validates them.
      return { ok: true, document: parsed.data as unknown as CanastaTournamentExportV1 };
    },

    async importTournament(document) {
      // Every game is imported through the ordinary path, which mints fresh ids
      // and replays the scores from the inputs. The tournament's tables are
      // then pointed at the new ids, so nothing refers to the source database.
      const gameIdBySource = new Map<string, GameId>();
      let imported = 0;

      for (const game of document.games) {
        const outcome = await importDocument(
          { repositories: deps.repositories, clock: deps.clock },
          game,
        );
        if (!outcome.ok) {
          return {
            ok: false,
            reason: 'storage',
            message: 'Een partij van dit toernooi kon niet worden geïmporteerd.',
          };
        }
        gameIdBySource.set(game.game.sourceId, outcome.game.id);
        imported += 1;
      }

      const source = document.tournament;
      const now = deps.clock.now();
      const tournament: Tournament = {
        ...structuredClone(source),
        id: newId(),
        updatedAt: now,
        rounds: source.rounds.map((round) => ({
          ...round,
          matches: round.matches.map((match) => ({
            ...match,
            gameId: match.gameId ? gameIdBySource.get(match.gameId) : undefined,
          })),
        })),
      };

      try {
        await deps.repositories.tournaments.create(tournament);
      } catch (error) {
        return {
          ok: false,
          reason: 'storage',
          message: (error as Error).message,
        };
      }

      return { ok: true, tournament, importedGames: imported };
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
