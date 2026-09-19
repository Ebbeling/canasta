import { Link } from 'react-router';
import { useGameList, useLastActiveGame } from '@/hooks/useGameData';
import {
  Card,
  EmptyState,
  LinkButton,
  LoadingState,
  Muted,
  PageTitle,
  SectionTitle,
} from '@/ui/common/primitives';
import { GameSummaryRow } from './GameSummaryRow';

export function HomeRoute() {
  const resume = useLastActiveGame();
  const recent = useGameList({ limit: 5 });

  return (
    <div className="space-y-6">
      <PageTitle>Canasta</PageTitle>

      {resume.status === 'ready' ? (
        <Card>
          <SectionTitle>Verder spelen</SectionTitle>
          <div className="mt-2">
            <GameSummaryRow summary={resume.data} />
          </div>
          <div className="mt-3">
            <LinkButton to={`/games/${resume.data.id}`} variant="primary">
              Verder spelen
            </LinkButton>
          </div>
        </Card>
      ) : null}

      <LinkButton to="/new" variant="primary" className="w-full">
        Nieuwe partij
      </LinkButton>

      <section className="space-y-2">
        <SectionTitle>Recente partijen</SectionTitle>

        {recent.status === 'loading' ? <LoadingState /> : null}

        {recent.status === 'ready' && recent.data.length === 0 ? (
          <EmptyState
            title="Nog geen partijen"
            description="Start een nieuwe partij om te beginnen met tellen."
            action={
              <LinkButton to="/new" variant="primary">
                Nieuwe partij
              </LinkButton>
            }
          />
        ) : null}

        {recent.status === 'ready' && recent.data.length > 0 ? (
          <ul className="space-y-2">
            {recent.data.map((summary) => (
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

        {recent.status === 'ready' && recent.data.length > 0 ? (
          <Muted>
            <Link to="/games" className="underline">
              Alle partijen bekijken
            </Link>
          </Muted>
        ) : null}
      </section>
    </div>
  );
}
