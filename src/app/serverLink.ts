import { createServerLink, type LinkStatus, type ServerLink } from '@/net/serverLink';

/**
 * The application's one link to a tournament server.
 *
 * A singleton for the same reason the database is: there is one origin, one
 * server behind it or none, and one connection status the whole app agrees on.
 *
 * The probe runs once at start-up and costs a single request that fails
 * immediately on GitHub Pages, where there is nothing to find. Nothing waits
 * for it: the app renders local-first and switches the moment an answer
 * arrives.
 */

let shared: ServerLink | undefined;

export function getServerLink(): ServerLink {
  shared ??= createServerLink();
  return shared;
}

/** True when a compatible server answered and the connection is believed up. */
export function serverIsUsable(status: LinkStatus): boolean {
  return status.kind === 'online' || status.kind === 'offline';
}

/** Starts the probe. Safe to call more than once. */
export function probeServer(): Promise<LinkStatus> {
  return getServerLink().probe();
}
