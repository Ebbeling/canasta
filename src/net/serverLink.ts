import {
  API_PREFIX,
  healthSchema,
  protocolIsCompatible,
  TOURNAMENT_PROTOCOL_VERSION,
  type ApiError,
  type ApiErrorCode,
  type Health,
  type ServerEvent,
} from './protocol';

/**
 * The PWA's end of the wire.
 *
 * One object that knows the origin, whether a server is there, whether it
 * speaks our protocol, and whether the connection is up right now. Everything
 * else in the client asks this; nothing else calls `fetch` at a tournament
 * server.
 *
 * There is no configured address anywhere. The server serves the app, so the
 * app's own origin *is* the server — which is what lets the same build run on
 * GitHub Pages, where the probe simply finds nothing, and on a laptop on the
 * WiFi, where it does.
 */

export type LinkStatus =
  | { kind: 'unknown' }
  | { kind: 'absent' }
  | { kind: 'incompatible'; serverProtocol: number }
  | { kind: 'online'; health: Health }
  | { kind: 'offline'; health: Health };

export class ServerError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly issues?: ApiError['issues'];
  readonly currentRevision?: number;

  constructor(status: number, body: ApiError) {
    super(body.message);
    this.name = 'ServerError';
    this.status = status;
    this.code = body.error;
    this.issues = body.issues;
    this.currentRevision = body.currentRevision;
  }

  /** True when retrying the very same request could succeed. */
  get retryable(): boolean {
    return this.code === 'serverError' || this.status >= 500;
  }
}

/** Thrown when the request never reached a server at all. */
export class OfflineError extends Error {
  constructor(message = 'Geen verbinding met de server.') {
    super(message);
    this.name = 'OfflineError';
  }
}

export interface ServerLink {
  readonly origin: string;
  status(): LinkStatus;
  /** Looks for a server and remembers what it found. */
  probe(): Promise<LinkStatus>;
  /** Called whenever the status changes. Returns an unsubscribe. */
  onStatus(listener: (status: LinkStatus) => void): () => void;

  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  remove<T>(path: string): Promise<T>;

  /**
   * Subscribes to the server's event stream.
   *
   * `EventSource` reconnects by itself when the WiFi comes back, which is the
   * behaviour a tournament hall needs and the reason this is not a socket.
   */
  subscribe(path: string, onEvent: (event: ServerEvent) => void): () => void;
}

export interface ServerLinkOptions {
  origin?: string;
  fetcher?: typeof fetch;
  /** Injected so tests need no `EventSource`. */
  eventSourceFactory?: (url: string) => EventSourceLike;
}

/** The slice of `EventSource` this client uses. */
export interface EventSourceLike {
  addEventListener(type: string, listener: (event: { data?: string }) => void): void;
  close(): void;
}

export function createServerLink(options: ServerLinkOptions = {}): ServerLink {
  const origin = (options.origin ?? globalThis.location?.origin ?? '').replace(/\/$/, '');
  const call = options.fetcher ?? globalThis.fetch?.bind(globalThis);

  let current: LinkStatus = { kind: 'unknown' };
  const listeners = new Set<(status: LinkStatus) => void>();

  function set(next: LinkStatus): LinkStatus {
    const changed = next.kind !== current.kind;
    current = next;
    if (changed) for (const listener of listeners) listener(next);
    return next;
  }

  /** Marks the link down without forgetting which server we were talking to. */
  function markOffline(): void {
    if (current.kind === 'online') set({ kind: 'offline', health: current.health });
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!call) throw new OfflineError('Deze omgeving kan geen verzoeken doen.');

    let response: Response;
    try {
      response = await call(`${origin}${path}`, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      // A network failure is not the server refusing; it is the server not
      // being there. The difference decides whether a client may retry.
      markOffline();
      throw new OfflineError();
    }

    if (current.kind === 'offline') set({ kind: 'online', health: current.health });

    const text = await response.text();
    const payload = text.length > 0 ? (JSON.parse(text) as unknown) : undefined;

    if (!response.ok) {
      throw new ServerError(response.status, payload as ApiError);
    }

    return payload as T;
  }

  return {
    origin,

    status: () => current,

    async probe() {
      if (!call) return set({ kind: 'absent' });

      try {
        const response = await call(`${origin}${API_PREFIX}/health`, {
          headers: { accept: 'application/json' },
        });
        if (!response.ok) return set({ kind: 'absent' });

        const parsed = healthSchema.safeParse(await response.json());
        if (!parsed.success) return set({ kind: 'absent' });

        return protocolIsCompatible(parsed.data.protocolVersion)
          ? set({ kind: 'online', health: parsed.data })
          : set({ kind: 'incompatible', serverProtocol: parsed.data.protocolVersion });
      } catch {
        // On GitHub Pages this is the ordinary answer: there is no server, and
        // the app carries on exactly as it always has.
        return set({ kind: 'absent' });
      }
    },

    onStatus(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    remove: (path) => request('DELETE', path),

    subscribe(path, onEvent) {
      const factory =
        options.eventSourceFactory ??
        ((url: string) => new EventSource(url) as unknown as EventSourceLike);

      let source: EventSourceLike | undefined;
      try {
        source = factory(`${origin}${path}`);
      } catch {
        return () => undefined;
      }

      const handle = (event: { data?: string }) => {
        if (!event.data) return;
        try {
          onEvent(JSON.parse(event.data) as ServerEvent);
        } catch {
          /* a malformed frame is not worth tearing the stream down for */
        }
      };

      for (const kind of ['hello', 'tournament', 'tables', 'presence', 'ping']) {
        source.addEventListener(kind, handle);
      }

      source.addEventListener('open', () => {
        if (current.kind === 'offline') set({ kind: 'online', health: current.health });
      });
      source.addEventListener('error', () => markOffline());

      return () => source?.close();
    },
  };
}

export { TOURNAMENT_PROTOCOL_VERSION };
