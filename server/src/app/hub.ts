import type { ServerEvent, ServerEventKind } from '@/net/protocol';
import type { Clock } from '@/application/ports';

/**
 * Who is listening, and what to tell them.
 *
 * Transport-agnostic on purpose: a subscriber is a function that takes an
 * event. The HTTP layer turns that into Server-Sent Events; a test just pushes
 * into an array. Nothing in here knows what a socket is.
 *
 * Presence is a side effect of subscribing. A table device holding an open
 * stream *is* a connected table — there is no separate heartbeat to get out of
 * step with reality, and a closed laptop stops counting the moment its stream
 * dies.
 */

export type Subscriber = (event: ServerEvent) => void;

export interface Subscription {
  close(): void;
}

export interface Hub {
  /** Listens to one tournament. `tableId` marks the subscriber as a table. */
  subscribe(options: {
    tournamentId: string;
    tableId?: string;
    send: Subscriber;
  }): Subscription;
  /** Tells everyone watching this tournament that something changed. */
  publish(kind: ServerEventKind, tournamentId: string, revision?: number): void;
  /** The tables of this tournament that are holding a stream open. */
  connectedTables(tournamentId: string): Set<string>;
  /** Keeps intermediaries from closing an idle stream. */
  heartbeat(): void;
  /** How many streams are open in total. */
  size(): number;
  closeAll(): void;
}

interface Entry {
  tournamentId: string;
  tableId?: string;
  send: Subscriber;
}

export function createHub(clock: Clock): Hub {
  const entries = new Set<Entry>();

  function event(kind: ServerEventKind, tournamentId?: string, revision?: number): ServerEvent {
    return { kind, tournamentId, revision, at: clock.now() };
  }

  function deliver(entry: Entry, payload: ServerEvent): void {
    try {
      entry.send(payload);
    } catch {
      // A dead stream is not an error worth failing a command over; it will be
      // reaped when its request closes.
      entries.delete(entry);
    }
  }

  return {
    subscribe({ tournamentId, tableId, send }) {
      const entry: Entry = { tournamentId, tableId, send };
      entries.add(entry);

      send(event('hello', tournamentId));
      // A table appearing or vanishing changes what the organiser sees, so
      // presence is published rather than polled.
      if (tableId) {
        for (const other of entries) {
          if (other !== entry && other.tournamentId === tournamentId) {
            deliver(other, event('presence', tournamentId));
          }
        }
      }

      return {
        close() {
          if (!entries.delete(entry)) return;
          if (!tableId) return;

          for (const other of entries) {
            if (other.tournamentId === tournamentId) {
              deliver(other, event('presence', tournamentId));
            }
          }
        },
      };
    },

    publish(kind, tournamentId, revision) {
      const payload = event(kind, tournamentId, revision);
      for (const entry of [...entries]) {
        if (entry.tournamentId === tournamentId) deliver(entry, payload);
      }
    },

    connectedTables(tournamentId) {
      const tables = new Set<string>();
      for (const entry of entries) {
        if (entry.tournamentId === tournamentId && entry.tableId) tables.add(entry.tableId);
      }
      return tables;
    },

    heartbeat() {
      const payload = event('ping');
      for (const entry of [...entries]) deliver(entry, payload);
    },

    size() {
      return entries.size;
    },

    closeAll() {
      entries.clear();
    },
  };
}
