import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { API_PREFIX } from '@/net/protocol';
import type { LinkStatus } from '@/net/serverLink';
import { getServerLink, serverIsUsable } from './serverLink';
import { ServerLinkContext, type ServerLinkValue } from './serverLinkContext';

/**
 * Finds the tournament server, if there is one, and keeps everybody posted.
 *
 * Mounted above the router so the probe starts with the app rather than with
 * the first tournament screen. On GitHub Pages it finds nothing within a few
 * milliseconds and the app is exactly what it was before this feature existed.
 */
export function ServerLinkProvider({ children }: { children: ReactNode }) {
  const link = useMemo(() => getServerLink(), []);
  const [status, setStatus] = useState<LinkStatus>(() => link.status());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;

    void link.probe().then((found) => {
      if (alive) setStatus(found);
    });

    const stop = link.onStatus((next) => {
      if (alive) setStatus(next);
    });

    return () => {
      alive = false;
      stop();
    };
  }, [link]);

  const bump = useCallback(() => setTick((value) => value + 1), []);

  const value = useMemo<ServerLinkValue>(
    () => ({
      link,
      status,
      tick,
      present: serverIsUsable(status),
      connected: status.kind === 'online',
    }),
    [link, status, tick],
  );

  return (
    <ServerLinkContext.Provider value={value}>
      <TournamentStream present={value.present} onEvent={bump} />
      {children}
    </ServerLinkContext.Provider>
  );
}

/**
 * Holds the event stream for whichever tournament is on screen.
 *
 * Lives here rather than in every tournament screen so there is one stream per
 * device, not one per open component — and so a screen never has to remember to
 * subscribe in order to stay up to date.
 */
function TournamentStream({ present, onEvent }: { present: boolean; onEvent: () => void }) {
  const { tournamentId } = useParams();
  const link = getServerLink();
  const notify = useRef(onEvent);
  notify.current = onEvent;

  useEffect(() => {
    if (!present || !tournamentId) return;

    return link.subscribe(`${API_PREFIX}/events?tournamentId=${tournamentId}`, (event) => {
      // A heartbeat proves the stream is alive but changes nothing; re-running
      // every query on it would be a needless render every twenty seconds.
      if (event.kind === 'ping') return;
      notify.current();
    });
  }, [link, present, tournamentId]);

  return null;
}
