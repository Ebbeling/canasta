import { createContext, useContext } from 'react';
import type { LinkStatus, ServerLink } from '@/net/serverLink';

/**
 * What the app knows about the tournament server, for anything that renders.
 *
 * `tick` is the whole synchronisation mechanism on the client: the server
 * pushes "something changed", this counter moves, and every query that includes
 * it in its dependencies runs again. No screen subscribes to anything, no view
 * model is patched by hand, and a push cannot forget to refresh a screen
 * somebody happened to open.
 */
export interface ServerLinkValue {
  link: ServerLink;
  status: LinkStatus;
  /** Increments on every event from the server. */
  tick: number;
  /** True when a compatible server is serving this app. */
  present: boolean;
  /** True when that server is reachable right now. */
  connected: boolean;
}

export const ServerLinkContext = createContext<ServerLinkValue | undefined>(undefined);

export function useServerLink(): ServerLinkValue | undefined {
  return useContext(ServerLinkContext);
}

/** The counter to hang a live query on. Zero when there is no server. */
export function useServerTick(): number {
  return useContext(ServerLinkContext)?.tick ?? 0;
}
