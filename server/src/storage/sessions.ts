import { randomBytes } from 'node:crypto';
import type { Clock } from '@/application/ports';
import type { TournamentId, TournamentTableId } from '@/domain/tournament';
import type { Database } from './sqlite';

/**
 * A device's claim on one physical table.
 *
 * Deliberately server infrastructure rather than tournament domain. A token
 * says nothing about who won anything; it says which device may speak for table
 * 3. Keeping it out of the domain is what guarantees it can never appear in an
 * export, and that revoking a device cannot alter a single result.
 *
 * The token is the only secret in the system. It is 256 bits from the platform
 * CSPRNG, base64url so it survives a QR code and a URL bar unharmed.
 */

export interface TableSession {
  token: string;
  tournamentId: TournamentId;
  tableId: TournamentTableId;
  createdAt: string;
  lastSeenAt?: string;
  revokedAt?: string;
}

interface SessionRow {
  token: string;
  tournament_id: string;
  table_id: string;
  created_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
}

function toSession(row: SessionRow): TableSession {
  return {
    token: row.token,
    tournamentId: row.tournament_id,
    tableId: row.table_id,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at ?? undefined,
    revokedAt: row.revoked_at ?? undefined,
  };
}

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export interface SessionStore {
  /**
   * Hands this table a session, replacing whatever it had.
   *
   * Regenerating is how a lost or wrongly scanned device is dealt with: the old
   * token stops working the moment the new one exists, so a printed QR that
   * walked off with somebody cannot be used afterwards.
   */
  issue(tournamentId: TournamentId, tableId: TournamentTableId): TableSession;
  /** The live session for a table, if it has one. */
  forTable(tournamentId: TournamentId, tableId: TournamentTableId): TableSession | undefined;
  /** Resolves a token. Returns nothing for unknown *and* for revoked. */
  resolve(token: string): TableSession | undefined;
  /** Records that this device is still there. */
  touch(token: string): void;
  revoke(tournamentId: TournamentId, tableId: TournamentTableId): void;
  listFor(tournamentId: TournamentId): TableSession[];
}

export function createSessionStore(db: Database, clock: Clock): SessionStore {
  return {
    issue(tournamentId, tableId) {
      const now = clock.now();
      // One live session per table: the previous one is dropped, not kept
      // alongside, so "regenerate" really does invalidate the old QR.
      db.prepare('DELETE FROM table_sessions WHERE tournament_id = ? AND table_id = ?').run(
        tournamentId,
        tableId,
      );

      const session: TableSession = {
        token: newSessionToken(),
        tournamentId,
        tableId,
        createdAt: now,
      };

      db.prepare(
        'INSERT INTO table_sessions (token, tournament_id, table_id, created_at) VALUES (?, ?, ?, ?)',
      ).run(session.token, session.tournamentId, session.tableId, session.createdAt);

      return session;
    },

    forTable(tournamentId, tableId) {
      const row = db
        .prepare(
          'SELECT * FROM table_sessions WHERE tournament_id = ? AND table_id = ? AND revoked_at IS NULL',
        )
        .get(tournamentId, tableId) as unknown as SessionRow | undefined;
      return row ? toSession(row) : undefined;
    },

    resolve(token) {
      if (typeof token !== 'string' || token.length < 16) return undefined;

      const row = db
        .prepare('SELECT * FROM table_sessions WHERE token = ? AND revoked_at IS NULL')
        .get(token) as unknown as SessionRow | undefined;
      return row ? toSession(row) : undefined;
    },

    touch(token) {
      db.prepare('UPDATE table_sessions SET last_seen_at = ? WHERE token = ?').run(
        clock.now(),
        token,
      );
    },

    revoke(tournamentId, tableId) {
      db.prepare(
        'UPDATE table_sessions SET revoked_at = ? WHERE tournament_id = ? AND table_id = ? AND revoked_at IS NULL',
      ).run(clock.now(), tournamentId, tableId);
    },

    listFor(tournamentId) {
      const rows = db
        .prepare('SELECT * FROM table_sessions WHERE tournament_id = ? AND revoked_at IS NULL')
        .all(tournamentId) as unknown as SessionRow[];
      return rows.map(toSession);
    },
  };
}
