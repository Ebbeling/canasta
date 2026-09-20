import { createBrowserRouter, Navigate } from 'react-router';
import { AppShell, NotFoundRoute, RouteError } from '@/routes/AppShell';
import { HomeRoute } from '@/routes/HomeRoute';
import { GameListRoute } from '@/routes/GameListRoute';
import { NewGameRoute } from '@/routes/NewGameRoute';
import { ScoreboardRoute } from '@/routes/ScoreboardRoute';
import { RoundEntryRoute } from '@/routes/RoundEntryRoute';
import { HistoryRoute } from '@/routes/HistoryRoute';
import { GameRulesRoute } from '@/routes/GameRulesRoute';
import { SettingsRoute } from '@/routes/SettingsRoute';
import { RuleSetsRoute } from '@/routes/RuleSetsRoute';
import { RuleSetEditorRoute } from '@/routes/RuleSetEditorRoute';
import { TournamentListRoute } from '@/routes/TournamentListRoute';
import { NewTournamentRoute } from '@/routes/NewTournamentRoute';
import { TournamentRoute } from '@/routes/TournamentRoute';
import { TournamentRoundsRoute } from '@/routes/TournamentRoundsRoute';
import { TournamentStandingsRoute } from '@/routes/TournamentStandingsRoute';
import { TournamentParticipantsRoute } from '@/routes/TournamentParticipantsRoute';
import { TournamentMatchRoute } from '@/routes/TournamentMatchRoute';
import { TournamentSettingsRoute } from '@/routes/TournamentSettingsRoute';

/**
 * A data router with no loaders.
 *
 * `useBlocker` — the only supported way to intercept in-app navigation, which
 * the round form needs — is exclusive to data routers. Loaders are deliberately
 * unused: the data source is IndexedDB, which changes from inside the same page
 * and from other tabs, and `useLiveQuery` is push-based where a loader would
 * need manual revalidation at every mutation site.
 */
export const routes = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomeRoute /> },
      { path: 'new', element: <NewGameRoute /> },
      { path: 'games', element: <GameListRoute /> },
      {
        path: 'games/:gameId',
        errorElement: <RouteError />,
        children: [
          { index: true, element: <ScoreboardRoute /> },
          { path: 'round', element: <RoundEntryRoute mode="create" /> },
          { path: 'rounds/:roundId/edit', element: <RoundEntryRoute mode="correct" /> },
          { path: 'rounds/:roundId', element: <Navigate to="../edit" replace /> },
          { path: 'history', element: <HistoryRoute /> },
          { path: 'rules', element: <GameRulesRoute /> },
        ],
      },
      { path: 'tournaments', element: <TournamentListRoute /> },
      { path: 'tournaments/new', element: <NewTournamentRoute /> },
      {
        path: 'tournaments/:tournamentId',
        errorElement: <RouteError />,
        children: [
          { index: true, element: <TournamentRoute /> },
          { path: 'rounds', element: <TournamentRoundsRoute /> },
          { path: 'standings', element: <TournamentStandingsRoute /> },
          { path: 'participants', element: <TournamentParticipantsRoute /> },
          { path: 'tables/:matchId', element: <TournamentMatchRoute /> },
          { path: 'settings', element: <TournamentSettingsRoute /> },
        ],
      },
      { path: 'settings', element: <SettingsRoute /> },
      { path: 'rulesets', element: <RuleSetsRoute /> },
      { path: 'rulesets/:presetId', element: <RuleSetEditorRoute /> },
      { path: '*', element: <NotFoundRoute /> },
    ],
  },
];

export function createAppRouter() {
  // BASE_URL is '/canasta/' in a build: the third of the three settings that
  // must agree (Vite base, service-worker scope, router basename).
  return createBrowserRouter(routes, { basename: import.meta.env.BASE_URL });
}
