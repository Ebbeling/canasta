import { beforeEach, describe, expect, it } from 'vitest';
import type { TeamRoundInput } from '@/domain/round';
import { createTableClient, type QueueStorage } from './tableClient';
import { OfflineError, ServerError, type ServerLink } from './serverLink';

/**
 * A table device that keeps losing the WiFi.
 *
 * The behaviour under test is the promise the table screen makes to whoever is
 * typing: what you entered is on this device, and it is not gone because the
 * network is. So a submission is written down before it is sent, kept when the
 * send fails, retried in order, and only dropped when the server has actually
 * taken it — or has refused it for a reason retrying cannot fix.
 */

/** Browser storage, in a variable. */
function memoryStorage(): QueueStorage & { dump(): Record<string, string> } {
  const store: Record<string, string> = {};
  return {
    read: (key) => store[key] ?? null,
    write: (key, value) => {
      store[key] = value;
    },
    dump: () => ({ ...store }),
  };
}

interface Call {
  path: string;
  body: unknown;
}

/** A link whose connectivity the test decides. */
function fakeLink() {
  const calls: Call[] = [];
  let online = true;
  let failWith: ServerError | undefined;

  const link = {
    origin: 'http://server',
    status: () => ({ kind: 'online' }) as never,
    probe: async () => ({ kind: 'online' }) as never,
    onStatus: () => () => undefined,
    get: async () => ({}) as never,
    remove: async () => ({}) as never,
    subscribe: () => () => undefined,

    async post<T>(path: string, body?: unknown): Promise<T> {
      calls.push({ path, body });
      if (!online) throw new OfflineError();
      if (failWith) throw failWith;
      return { accepted: true, path } as T;
    },
  } satisfies ServerLink;

  return {
    link,
    calls,
    goOffline: () => {
      online = false;
    },
    goOnline: () => {
      online = true;
    },
    refuseWith: (error: ServerError | undefined) => {
      failWith = error;
    },
  };
}

const input = (teamId: string, cardPoints: number): TeamRoundInput => ({
  teamId,
  cardPoints,
  cardsInHand: 0,
  naturalCanastas: 0,
  mixedCanastas: 0,
  redThrees: 0,
  opened: true,
  wentOut: false,
  concealedGoingOut: false,
  extra: {},
});

let ids = 0;
const newId = () => `key-${(ids += 1)}`.padEnd(12, '0');

beforeEach(() => {
  ids = 0;
});

describe('a table that is online', () => {
  it('sends a round and keeps nothing', async () => {
    const wire = fakeLink();
    const client = createTableClient({
      link: wire.link,
      token: 'token-for-table-one',
      storage: memoryStorage(),
      newId,
    });

    const state = await client.submitResult({
      matchId: 'm1',
      expectedRevision: 3,
      inputs: [input('t1', 900)],
    });

    expect(state).toBeDefined();
    expect(client.pending()).toEqual([]);
    expect(wire.calls).toHaveLength(1);
    expect(wire.calls[0]!.path).toContain('/match/result');
    expect((wire.calls[0]!.body as { expectedRevision: number }).expectedRevision).toBe(3);
  });

  it('sends the same key it wrote down, so a retry is recognised', async () => {
    const wire = fakeLink();
    const storage = memoryStorage();
    const client = createTableClient({
      link: wire.link,
      token: 'token-for-table-one',
      storage,
      newId,
    });

    await client.submitResult({ matchId: 'm1', expectedRevision: 0, inputs: [input('t1', 1)] });

    const sent = wire.calls[0]!.body as { idempotencyKey: string };
    expect(sent.idempotencyKey).toBe('key-10000000');
  });
});

describe('a table that loses the network', () => {
  it('keeps what was entered instead of losing it', async () => {
    const wire = fakeLink();
    const client = createTableClient({
      link: wire.link,
      token: 'token-for-table-one',
      storage: memoryStorage(),
      newId,
    });

    wire.goOffline();
    const state = await client.submitResult({
      matchId: 'm1',
      expectedRevision: 2,
      inputs: [input('t1', 750)],
    });

    // Nothing is claimed to be accepted…
    expect(state).toBeUndefined();
    // …and the round is still here.
    expect(client.pending()).toHaveLength(1);
    expect(client.pending()[0]!.inputs?.[0]?.cardPoints).toBe(750);
    expect(client.pending()[0]!.rejected).toBeUndefined();
  });

  it('survives a reload of the page', async () => {
    const wire = fakeLink();
    const storage = memoryStorage();

    const first = createTableClient({
      link: wire.link,
      token: 'token-for-table-one',
      storage,
      newId,
    });

    wire.goOffline();
    await first.submitResult({ matchId: 'm1', expectedRevision: 1, inputs: [input('t1', 640)] });

    // A new client on the same device, as after a refresh.
    const second = createTableClient({
      link: wire.link,
      token: 'token-for-table-one',
      storage,
      newId,
    });

    expect(second.pending()).toHaveLength(1);
    expect(second.pending()[0]!.inputs?.[0]?.cardPoints).toBe(640);
  });

  it('hands everything in, in order, once the network is back', async () => {
    const wire = fakeLink();
    const client = createTableClient({
      link: wire.link,
      token: 'token-for-table-one',
      storage: memoryStorage(),
      newId,
    });

    wire.goOffline();
    await client.submitResult({ matchId: 'm1', expectedRevision: 1, inputs: [input('t1', 100)] });
    await client.submitResult({ matchId: 'm1', expectedRevision: 2, inputs: [input('t1', 200)] });
    expect(client.pending()).toHaveLength(2);

    const before = wire.calls.length;
    wire.goOnline();
    await client.flush();

    expect(client.pending()).toEqual([]);
    const sent = wire.calls.slice(before).map((call) => (call.body as { expectedRevision: number }).expectedRevision);
    // Order matters: the second was written against the state the first creates.
    expect(sent).toEqual([1, 2]);
  });

  it('does not keep a device that never reconnects sending forever', async () => {
    const wire = fakeLink();
    const client = createTableClient({
      link: wire.link,
      token: 'token-for-table-one',
      storage: memoryStorage(),
      newId,
    });

    wire.goOffline();
    await client.submitResult({ matchId: 'm1', expectedRevision: 1, inputs: [input('t1', 100)] });
    await client.submitResult({ matchId: 'm1', expectedRevision: 2, inputs: [input('t1', 200)] });

    const before = wire.calls.length;
    await client.flush();

    // One attempt, then it stops: the rest would fail for the same reason, and
    // sending the second before the first is accepted would be wrong anyway.
    expect(wire.calls.length - before).toBe(1);
    expect(client.pending()).toHaveLength(2);
  });
});

describe('a table the server refuses', () => {
  it('marks a stale submission as rejected instead of retrying it forever', async () => {
    const wire = fakeLink();
    const client = createTableClient({
      link: wire.link,
      token: 'token-for-table-one',
      storage: memoryStorage(),
      newId,
    });

    wire.refuseWith(
      new ServerError(409, {
        error: 'conflict',
        message: 'Iemand anders was je voor.',
        currentRevision: 7,
      }),
    );

    await client.submitResult({ matchId: 'm1', expectedRevision: 1, inputs: [input('t1', 100)] });

    const pending = client.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.rejected?.code).toBe('conflict');

    // A flush leaves it alone rather than hammering the server.
    const before = wire.calls.length;
    await client.flush();
    expect(wire.calls.length).toBe(before);
  });

  it('lets the table throw away what will never be accepted', async () => {
    const wire = fakeLink();
    const client = createTableClient({
      link: wire.link,
      token: 'token-for-table-one',
      storage: memoryStorage(),
      newId,
    });

    wire.refuseWith(
      new ServerError(409, { error: 'outOfScope', message: 'Niet jouw tafel.' }),
    );
    await client.submitResult({ matchId: 'm1', expectedRevision: 1, inputs: [input('t1', 100)] });

    const [entry] = client.pending();
    client.discard(entry!.id);

    expect(client.pending()).toEqual([]);
  });

  it('keeps retrying something that was only a server hiccup', async () => {
    const wire = fakeLink();
    const client = createTableClient({
      link: wire.link,
      token: 'token-for-table-one',
      storage: memoryStorage(),
      newId,
    });

    wire.refuseWith(new ServerError(500, { error: 'serverError', message: 'Oeps.' }));
    await client.submitResult({ matchId: 'm1', expectedRevision: 1, inputs: [input('t1', 100)] });

    expect(client.pending()[0]!.rejected).toBeUndefined();
    expect(client.pending()[0]!.attempts).toBe(1);

    wire.refuseWith(undefined);
    await client.flush();
    expect(client.pending()).toEqual([]);
  });
});

describe('two tables sharing one device', () => {
  it('never inherit each other’s queue', async () => {
    const wire = fakeLink();
    const storage = memoryStorage();

    const one = createTableClient({
      link: wire.link,
      token: 'aaaaaaaaaaaaaaaa-table-one',
      storage,
      newId,
    });
    wire.goOffline();
    await one.submitResult({ matchId: 'm1', expectedRevision: 1, inputs: [input('t1', 100)] });

    const two = createTableClient({
      link: wire.link,
      token: 'bbbbbbbbbbbbbbbb-table-two',
      storage,
      newId,
    });

    expect(one.pending()).toHaveLength(1);
    expect(two.pending()).toEqual([]);
    expect(Object.keys(storage.dump())).toHaveLength(1);
  });
});
