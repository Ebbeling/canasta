import { Link, useParams } from 'react-router';
import { useGameHistory } from '@/hooks/useGameData';
import { Card, EmptyState, LinkButton, LoadingState, PageTitle } from '@/ui/common/primitives';
import { GameNotFound } from './GameNotFound';

export function HistoryRoute() {
  const { gameId } = useParams();
  const history = useGameHistory(gameId);

  if (history.status === 'loading') return <LoadingState label="Geschiedenis laden…" />;
  if (history.status === 'missing') return <GameNotFound />;

  const { rows } = history.data;

  return (
    <div className="space-y-4">
      <PageTitle>Geschiedenis</PageTitle>

      {rows.length === 0 ? (
        <EmptyState
          title="Nog geen rondes gespeeld"
          action={
            <LinkButton to={`/games/${gameId}/round`} variant="primary">
              Ronde invoeren
            </LinkButton>
          }
        />
      ) : null}

      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.roundId}>
            <Card>
              <div className="flex items-baseline justify-between">
                <h2 className="font-medium">Ronde {row.displayNumber}</h2>
                <Link
                  to={`/games/${gameId}/rounds/${row.roundId}/edit`}
                  className="min-h-[var(--spacing-touch)] rounded-lg px-2 py-1 text-sm underline"
                >
                  Bewerken
                </Link>
              </div>

              <ul className="mt-2 space-y-1">
                {row.teams.map((team) => (
                  <li key={team.teamId} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm">{team.name}</span>
                    <span className="shrink-0 text-sm tabular">
                      <span className={team.delta < 0 ? 'text-[--color-negative]' : ''}>
                        {team.deltaText}
                      </span>
                      <span className="ml-3 text-[--color-ink-muted]">{team.runningTotalText}</span>
                    </span>
                  </li>
                ))}
              </ul>

              {row.issues.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-[--color-warning]">
                  {row.issues.map((issue) => (
                    <li key={`${issue.code}-${issue.teamId ?? 'round'}`}>
                      <span className="font-semibold">{issue.channelLabel}:</span> {issue.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>

      <LinkButton to={`/games/${gameId}`}>Terug naar het scorebord</LinkButton>
    </div>
  );
}
