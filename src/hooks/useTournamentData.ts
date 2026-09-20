import type { TournamentId } from '@/domain/tournament';
import type { TournamentListFilter, TournamentSummary } from '@/application/ports';
import type { LoadedTournament } from '@/application/services';
import {
  buildDashboard,
  buildDays,
  buildParticipants,
  buildStandingsView,
  buildTournamentRow,
  type TournamentDashboardVM,
  type TournamentDayVM,
  type TournamentParticipantsVM,
  type TournamentRoundVM,
  type TournamentRowVM,
  type TournamentStandingsVM,
} from '@/application/viewmodels/tournamentView';
import { buildRound } from '@/application/viewmodels/tournamentView';
import { useServices } from '@/app/servicesContext';
import { useServerTick } from '@/app/serverLinkContext';
import { useLiveResult, type AsyncState } from './useLiveResult';

/**
 * Tournament data, as view models.
 *
 * Same shape as the game hooks: the view model is built inside the querier, so
 * Dexie memoises it and React never sees a tournament, a match or a game.
 *
 * Every querier also depends on `tick`. Locally that number never moves and
 * Dexie's own change tracking does the work, exactly as before. With a
 * tournament server it is the other half of the story: the server pushes
 * "something changed", the tick moves, and these queries run again — which is
 * why a round entered at table 3 appears on the organiser's dashboard without a
 * single screen knowing that a network exists.
 */

export function useTournamentList(
  filter?: TournamentListFilter,
): AsyncState<TournamentRowVM[]> {
  const services = useServices();
  const tick = useServerTick();
  const key = JSON.stringify(filter ?? {});

  return useLiveResult(async () => {
    const summaries: TournamentSummary[] = await services.tournaments.list(filter);
    return summaries.map(buildTournamentRow);
  }, [key, tick]);
}

export function useTournament(id: TournamentId | undefined): AsyncState<LoadedTournament> {
  const services = useServices();
  const tick = useServerTick();
  return useLiveResult(id ? () => services.tournaments.load(id) : null, [id, tick]);
}

export function useTournamentDashboard(
  id: TournamentId | undefined,
): AsyncState<TournamentDashboardVM> {
  const services = useServices();
  const tick = useServerTick();
  return useLiveResult(
    id
      ? async () => {
          const loaded = await services.tournaments.load(id);
          return loaded ? buildDashboard(loaded) : undefined;
        }
      : null,
    [id, tick],
  );
}

export function useTournamentStandings(
  id: TournamentId | undefined,
): AsyncState<TournamentStandingsVM> {
  const services = useServices();
  const tick = useServerTick();
  return useLiveResult(
    id
      ? async () => {
          const loaded = await services.tournaments.load(id);
          return loaded ? buildStandingsView(loaded) : undefined;
        }
      : null,
    [id, tick],
  );
}

export function useTournamentDays(id: TournamentId | undefined): AsyncState<TournamentDayVM[]> {
  const services = useServices();
  const tick = useServerTick();
  return useLiveResult(
    id
      ? async () => {
          const loaded = await services.tournaments.load(id);
          return loaded ? buildDays(loaded) : undefined;
        }
      : null,
    [id, tick],
  );
}

export function useTournamentParticipants(
  id: TournamentId | undefined,
): AsyncState<TournamentParticipantsVM> {
  const services = useServices();
  const tick = useServerTick();
  return useLiveResult(
    id
      ? async () => {
          const loaded = await services.tournaments.load(id);
          return loaded ? buildParticipants(loaded) : undefined;
        }
      : null,
    [id, tick],
  );
}

/** One round, by its number in the tournament. */
export function useTournamentRound(
  id: TournamentId | undefined,
  sequence: number | undefined,
): AsyncState<TournamentRoundVM> {
  const services = useServices();
  const tick = useServerTick();
  return useLiveResult(
    id && sequence !== undefined
      ? async () => {
          const loaded = await services.tournaments.load(id);
          if (!loaded) return undefined;
          const round = loaded.tournament.rounds.find((entry) => entry.sequence === sequence);
          return round ? buildRound(loaded.tournament, round, loaded.games) : undefined;
        }
      : null,
    [id, sequence, tick],
  );
}

/** The tournament to put at the top of Home, if one is running. */
export function useRunningTournament(): AsyncState<TournamentRowVM> {
  const services = useServices();
  const tick = useServerTick();
  return useLiveResult(async () => {
    const summary = await services.tournaments.lastActive();
    return summary ? buildTournamentRow(summary) : undefined;
  }, [tick]);
}
