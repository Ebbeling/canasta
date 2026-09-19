import { Link } from 'react-router';
import { useGameList } from '@/hooks/useGameData';
import { EmptyState, LinkButton, LoadingState, PageTitle } from '@/ui/common/primitives';
import { GameSummaryRow } from './GameSummaryRow';

export function GameListRoute() {
  const games = useGameList();

  return (
    <div className="space-y-4">
      <PageTitle>Partijen</PageTitle>

      {games.status === 'loading' ? <LoadingState label="Partijen laden…" /> : null}

      {games.status === 'ready' && games.data.length === 0 ? (
        <EmptyState
          title="Nog geen partijen"
          action={
            <LinkButton to="/new" variant="primary">
              Nieuwe partij
            </LinkButton>
          }
        />
      ) : null}

      {games.status === 'ready' && games.data.length > 0 ? (
        <ul className="space-y-2">
          {games.data.map((summary) => (
            <li key={summary.id}>
              <Link
                to={`/games/${summary.id}`}
                className="block rounded-2xl border border-[--color-border] bg-[--color-panel] p-4 hover:bg-[--color-panel-muted]"
              >
                <GameSummaryRow summary={summary} />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
