import type { TeamRoundInput } from '@/domain/round';
import { API_PREFIX, type TableState } from './protocol';
import { OfflineError, ServerError, type ServerLink } from './serverLink';

/**
 * One table's end of the wire.
 *
 * Deliberately a much smaller thing than the organiser's client: a table can
 * read its own state, start its own game and hand in its own round. There is no
 * method here for anything else, which is the first half of keeping a table
 * device from being an organiser. The server enforces the second half, because
 * a client is never the place a permission is decided.
 *
 * The queue is the other half of the job. A phone at a table loses the WiFi for
 * ten seconds at a time, and a round that has been typed in must not depend on
 * the moment it was typed. So a submission is written down first, sent second,
 * and only called confirmed when the server says so.
 */

export type PendingKind = 'result' | 'complete' | 'start';

export interface PendingSubmission {
  /** Also the idempotency key, so a retry is answered rather than replayed. */
  id: string;
  kind: PendingKind;
  matchId: string;
  expectedRevision: number;
  inputs?: TeamRoundInput[];
  createdAt: string;
  /** Counted so a permanently rejected item can be reported rather than looped. */
  attempts: number;
  /** Set when the server refused it for good. */
  rejected?: { code: string; message: string };
}

export type QueueListener = (pending: PendingSubmission[]) => void;

/** Where a queue survives a reload. Browser storage, injected for testing. */
export interface QueueStorage {
  read(key: string): string | null;
  write(key: string, value: string): void;
}

export const browserQueueStorage: QueueStorage = {
  read(key) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      // Private mode, blocked storage: a queue that cannot persist is still a
      // queue for as long as the page is open.
      return null;
    }
  },
  write(key, value) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* nothing to do; the in-memory copy still works */
    }
  },
};

export interface TableClient {
  readonly token: string;
  /** Fetches the current state and remembers it on the device. */
  state(): Promise<TableState>;
  /**
   * The last state this device saw, from its own storage.
   *
   * What makes the table view work on a cold start with no network: the game
   * and its frozen rule set are already here, so the round form can be opened
   * and filled in, and the submission joins the queue like any other. Without
   * it a phone that lost the WiFi before somebody reopened the app would have
   * nothing to show at all.
   */
  remembered(): TableState | undefined;
  /** Queues a start and tries to send it now. */
  startMatch(matchId: string): Promise<TableState | undefined>;
  /** Queues a round and tries to send it now. */
  submitResult(args: {
    matchId: string;
    expectedRevision: number;
    inputs: TeamRoundInput[];
  }): Promise<TableState | undefined>;
  completeMatch(args: { matchId: string; expectedRevision: number }): Promise<TableState | undefined>;

  /** What is written down but not yet acknowledged. */
  pending(): PendingSubmission[];
  onPending(listener: QueueListener): () => void;
  /** Tries to hand in everything queued. Safe to call as often as you like. */
  flush(): Promise<void>;
  /** Forgets a submission the server will never accept. */
  discard(id: string): void;
  subscribe(onEvent: () => void): () => void;
}

export interface TableClientOptions {
  link: ServerLink;
  token: string;
  storage?: QueueStorage;
  newId?: () => string;
}

export function createTableClient({
  link,
  token,
  storage = browserQueueStorage,
  newId = () => crypto.randomUUID(),
}: TableClientOptions): TableClient {
  // Keyed by token so two tables sharing a device — a tablet that was moved —
  // never inherit each other's queue.
  const key = `canasta.table.queue.${token.slice(0, 12)}`;
  const stateKey = `canasta.table.state.${token.slice(0, 12)}`;

  let queue: PendingSubmission[] = read();
  const listeners = new Set<QueueListener>();

  function read(): PendingSubmission[] {
    const raw = storage.read(key);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as PendingSubmission[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function save(): void {
    storage.write(key, JSON.stringify(queue));
    for (const listener of listeners) listener([...queue]);
  }

  function enqueue(entry: Omit<PendingSubmission, 'id' | 'createdAt' | 'attempts'>): PendingSubmission {
    const pending: PendingSubmission = {
      ...entry,
      // The id doubles as the idempotency key: written down once, so however
      // many times it is sent the server only ever acts on it once.
      id: newId(),
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
    queue = [...queue, pending];
    save();
    return pending;
  }

  function remove(id: string): void {
    queue = queue.filter((entry) => entry.id !== id);
    save();
  }

  function reject(id: string, code: string, message: string): void {
    queue = queue.map((entry) => (entry.id === id ? { ...entry, rejected: { code, message } } : entry));
    save();
  }

  async function deliver(entry: PendingSubmission): Promise<TableState | undefined> {
    const base = `${API_PREFIX}/table/session/${token}/match`;

    const body =
      entry.kind === 'result'
        ? {
            matchId: entry.matchId,
            expectedRevision: entry.expectedRevision,
            idempotencyKey: entry.id,
            inputs: entry.inputs ?? [],
          }
        : entry.kind === 'complete'
          ? {
              matchId: entry.matchId,
              expectedRevision: entry.expectedRevision,
              idempotencyKey: entry.id,
            }
          : { matchId: entry.matchId, idempotencyKey: entry.id };

    const path = entry.kind === 'result' ? `${base}/result` : entry.kind === 'complete' ? `${base}/complete` : `${base}/start`;

    try {
      const state = remember(await link.post<TableState>(path, body));
      remove(entry.id);
      return state;
    } catch (error) {
      if (error instanceof OfflineError) {
        // Still ours to send. Leave it exactly where it is.
        queue = queue.map((one) =>
          one.id === entry.id ? { ...one, attempts: one.attempts + 1 } : one,
        );
        save();
        return undefined;
      }

      if (error instanceof ServerError) {
        if (error.retryable) {
          queue = queue.map((one) =>
            one.id === entry.id ? { ...one, attempts: one.attempts + 1 } : one,
          );
          save();
          return undefined;
        }
        // A refusal is final: retrying a stale or out-of-scope submission would
        // only fail again, and silently dropping it would lose what was typed.
        reject(entry.id, error.code, error.message);
        return undefined;
      }

      throw error;
    }
  }

  function remember(state: TableState): TableState {
    storage.write(stateKey, JSON.stringify(state));
    return state;
  }

  return {
    token,

    async state() {
      return remember(await link.get<TableState>(`${API_PREFIX}/table/session/${token}/state`));
    },

    remembered() {
      const raw = storage.read(stateKey);
      if (!raw) return undefined;
      try {
        return JSON.parse(raw) as TableState;
      } catch {
        return undefined;
      }
    },

    async startMatch(matchId) {
      const entry = enqueue({ kind: 'start', matchId, expectedRevision: 0 });
      return deliver(entry);
    },

    async submitResult({ matchId, expectedRevision, inputs }) {
      const entry = enqueue({ kind: 'result', matchId, expectedRevision, inputs });
      return deliver(entry);
    },

    async completeMatch({ matchId, expectedRevision }) {
      const entry = enqueue({ kind: 'complete', matchId, expectedRevision });
      return deliver(entry);
    },

    pending: () => [...queue],

    onPending(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async flush() {
      // In order: a round entered before another must reach the server first,
      // or the second would be judged against a revision that never existed.
      for (const entry of [...queue]) {
        if (entry.rejected) continue;
        const state = await deliver(entry);
        if (!state && !queue.find((one) => one.id === entry.id)?.rejected) break;
      }
    },

    discard: remove,

    subscribe(onEvent) {
      return link.subscribe(`${API_PREFIX}/table/session/${token}/events`, onEvent);
    },
  };
}
