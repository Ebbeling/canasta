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
import { useLiveResult, type AsyncState } from './useLiveResult';

/**
 * Tournament data, as view models.
 *
 * Same shape as the game hooks: the view model is built inside the querier, so
 * Dexie memoises it and React never sees a tournament, a match or a game.
 */

export function useTournamentList(
  filter?: TournamentListFilter,
): AsyncState<TournamentRowVM[]> {
  const services = useServices();
  const key = JSON.stringify(filter ?? {});

  return useLiveResult(async () => {
    const summaries: TournamentSummary[] = await services.tournaments.list(filter);
    return summaries.map(buildTournamentRow);
  }, [key]);
}

export function useTournament(id: TournamentId | undefined): AsyncState<LoadedTournament> {
  const services = useServices();
  return useLiveResult(id ? () => services.tournaments.load(id) : null, [id]);
}

export function useTournamentDashboard(
  id: TournamentId | undefined,
): AsyncState<TournamentDashboardVM> {
  const services = useServices();
  return useLiveResult(
    id
      ? async () => {
          const loaded = await services.tournaments.load(id);
          return loaded ? buildDashboard(loaded) : undefined;
        }
      : null,
    [id],
  );
}

export function useTournamentStandings(
  id: TournamentId | undefined,
): AsyncState<TournamentStandingsVM> {
  const services = useServices();
  return useLiveResult(
    id
      ? async () => {
          const loaded = await services.tournaments.load(id);
          return loaded ? buildStandingsView(loaded) : undefined;
        }
      : null,
    [id],
  );
}

export function useTournamentDays(id: TournamentId | undefined): AsyncState<TournamentDayVM[]> {
  const services = useServices();
  return useLiveResult(
    id
      ? async () => {
          const loaded = await services.tournaments.load(id);
          return loaded ? buildDays(loaded) : undefined;
        }
      : null,
    [id],
  );
}

export function useTournamentParticipants(
  id: TournamentId | undefined,
): AsyncState<TournamentParticipantsVM> {
  const services = useServices();
  return useLiveResult(
    id
      ? async () => {
          const loaded = await services.tournaments.load(id);
          return loaded ? buildParticipants(loaded) : undefined;
        }
      : null,
    [id],
  );
}

/** One round, by its number in the tournament. */
export function useTournamentRound(
  id: TournamentId | undefined,
  sequence: number | undefined,
): AsyncState<TournamentRoundVM> {
  const services = useServices();
  return useLiveResult(
    id && sequence !== undefined
      ? async () => {
          const loaded = await services.tournaments.load(id);
          if (!loaded) return undefined;
          const round = loaded.tournament.rounds.find((entry) => entry.sequence === sequence);
          return round ? buildRound(loaded.tournament, round, loaded.games) : undefined;
        }
      : null,
    [id, sequence],
  );
}

/** The tournament to put at the top of Home, if one is running. */
export function useRunningTournament(): AsyncState<TournamentRowVM> {
  const services = useServices();
  return useLiveResult(async () => {
    const summary = await services.tournaments.lastActive();
    return summary ? buildTournamentRow(summary) : undefined;
  }, []);
}
