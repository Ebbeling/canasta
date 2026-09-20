import { useCallback, useEffect, useState } from 'react';
import { API_PREFIX, type TableView } from '@/net/protocol';
import { useServerLink } from '@/app/serverLinkContext';

/**
 * The physical tables of a tournament, as the server sees them.
 *
 * Deliberately not part of `useTournamentData`: a table's *identity* is
 * tournament data and travels with the tournament, but whether a device is
 * holding a connection right now is not — it is a fact about this moment on
 * this network, it is never stored, and it has no meaning at all without a
 * server. Mixing the two would put a runtime fact into a document that gets
 * exported.
 */

export type ServerTablesState =
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; tables: TableView[] };

export interface ServerTables {
  state: ServerTablesState;
  /** Hands this table a fresh session, invalidating any earlier QR. */
  issue(tableId: string): Promise<void>;
  /** Takes the session away; the device is logged out at once. */
  revoke(tableId: string): Promise<void>;
  reload(): Promise<void>;
}

export function useServerTables(tournamentId: string | undefined): ServerTables {
  const server = useServerLink();
  const [state, setState] = useState<ServerTablesState>({ status: 'loading' });

  const present = server?.present ?? false;
  const link = server?.link;
  const tick = server?.tick ?? 0;

  const reload = useCallback(async () => {
    if (!present || !link || !tournamentId) {
      setState({ status: 'unavailable' });
      return;
    }

    try {
      const { tables } = await link.get<{ tables: TableView[] }>(
        `${API_PREFIX}/tournaments/${tournamentId}/tables`,
      );
      setState({ status: 'ready', tables });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'De tafels konden niet worden geladen.',
      });
    }
  }, [link, present, tournamentId]);

  // `tick` is in the dependencies so a table connecting or disconnecting
  // refreshes this list: presence is pushed, never polled.
  useEffect(() => {
    void reload();
  }, [reload, tick]);

  const issue = useCallback(
    async (tableId: string) => {
      if (!link || !tournamentId) return;
      await link.post(`${API_PREFIX}/tournaments/${tournamentId}/tables/${tableId}/session`);
      await reload();
    },
    [link, reload, tournamentId],
  );

  const revoke = useCallback(
    async (tableId: string) => {
      if (!link || !tournamentId) return;
      await link.remove(`${API_PREFIX}/tournaments/${tournamentId}/tables/${tableId}/session`);
      await reload();
    },
    [link, reload, tournamentId],
  );

  return { state, issue, revoke, reload };
}
