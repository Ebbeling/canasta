import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TeamRoundInput } from '@/domain/round';
import { protocolIsCompatible, type TableState } from '@/net/protocol';
import { OfflineError, ServerError } from '@/net/serverLink';
import { createTableClient, type PendingSubmission } from '@/net/tableClient';
import { getServerLink } from '@/app/serverLink';

/**
 * One table device's whole world.
 *
 * Holds the last state the server gave us, the queue of things typed but not
 * yet acknowledged, and whether the wire is up. Those three are kept apart on
 * purpose, because the table operator has to be able to tell "the server has
 * this" from "this phone has this" — the difference between a round that is
 * safe and a round that would be lost by closing the browser.
 */

export type TableSessionState =
  | { status: 'loading' }
  | { status: 'invalid'; message: string }
  | { status: 'incompatible'; serverProtocol: number }
  | { status: 'unreachable'; state?: TableState }
  | { status: 'ready'; state: TableState };

export interface TableSession {
  view: TableSessionState;
  /** True while the last request could not reach the server. */
  offline: boolean;
  /** Written down here, not yet confirmed by the server. */
  pending: PendingSubmission[];
  refresh(): Promise<void>;
  startMatch(): Promise<void>;
  submitRound(inputs: TeamRoundInput[]): Promise<boolean>;
  completeMatch(): Promise<void>;
  discard(id: string): void;
  retry(): Promise<void>;
}

export function useTableSession(token: string | undefined): TableSession {
  const link = useMemo(() => getServerLink(), []);
  const client = useMemo(
    () => (token ? createTableClient({ link, token }) : undefined),
    [link, token],
  );

  // Start from whatever this device already knows. A table that is reopened on
  // a dead network then still shows its match, its people and its game instead
  // of an empty screen — and the round form has the rule set it needs.
  const [view, setView] = useState<TableSessionState>(() => {
    const remembered = client?.remembered();
    return remembered ? { status: 'unreachable', state: remembered } : { status: 'loading' };
  });
  const [pending, setPending] = useState<PendingSubmission[]>(() => client?.pending() ?? []);
  const [offline, setOffline] = useState(false);
  const last = useRef<TableState | undefined>(client?.remembered());

  const refresh = useCallback(async () => {
    if (!client) {
      setView({ status: 'invalid', message: 'Deze koppeling is niet geldig.' });
      return;
    }

    try {
      const state = await client.state();

      if (!protocolIsCompatible(state.session.protocolVersion)) {
        setView({ status: 'incompatible', serverProtocol: state.session.protocolVersion });
        return;
      }

      last.current = state;
      setOffline(false);
      setView({ status: 'ready', state });
    } catch (error) {
      if (error instanceof OfflineError) {
        // Keep showing what we had. A table that loses the WiFi mid-round must
        // not lose the round, and must not pretend everything is fine either.
        setOffline(true);
        setView({ status: 'unreachable', state: last.current });
        return;
      }

      if (error instanceof ServerError) {
        setView({
          status: 'invalid',
          message:
            error.code === 'sessionInvalid'
              ? 'Deze koppeling is ingetrokken of verlopen. Vraag de organisator om een nieuwe QR-code.'
              : error.message,
        });
        return;
      }

      setView({ status: 'invalid', message: 'Er ging iets mis bij het ophalen.' });
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The queue lives in the client; the component only mirrors it.
  useEffect(() => client?.onPending(setPending), [client]);

  // The server pushes; the device re-reads. Also how a new round arrives at a
  // table without anybody touching the device.
  useEffect(() => {
    if (!client) return;
    return client.subscribe(() => {
      void refresh();
    });
  }, [client, refresh]);

  // Anything written down while the wire was down goes out the moment the
  // browser says the network is back.
  useEffect(() => {
    if (!client) return;

    const retry = () => {
      void client.flush().then(() => refresh());
    };

    globalThis.addEventListener?.('online', retry);
    const timer = setInterval(() => {
      if (client.pending().some((entry) => !entry.rejected)) retry();
    }, 10_000);

    return () => {
      globalThis.removeEventListener?.('online', retry);
      clearInterval(timer);
    };
  }, [client, refresh]);

  const apply = useCallback(
    (state: TableState | undefined) => {
      if (!state) {
        setOffline(true);
        setView({ status: 'unreachable', state: last.current });
        return false;
      }
      last.current = state;
      setOffline(false);
      setView({ status: 'ready', state });
      return true;
    },
    [],
  );

  return {
    view,
    offline,
    pending,

    refresh,

    async startMatch() {
      const state = view.status === 'ready' ? view.state : last.current;
      if (!client || !state?.match) return;
      apply(await client.startMatch(state.match.id));
    },

    async submitRound(inputs) {
      const state = view.status === 'ready' ? view.state : last.current;
      if (!client || !state?.match) return false;

      const accepted = await client.submitResult({
        matchId: state.match.id,
        expectedRevision: state.match.revision,
        inputs,
      });

      return apply(accepted);
    },

    async completeMatch() {
      const state = view.status === 'ready' ? view.state : last.current;
      if (!client || !state?.match) return;
      apply(
        await client.completeMatch({
          matchId: state.match.id,
          expectedRevision: state.match.revision,
        }),
      );
    },

    discard(id) {
      client?.discard(id);
    },

    async retry() {
      if (!client) return;
      await client.flush();
      await refresh();
    },
  };
}
