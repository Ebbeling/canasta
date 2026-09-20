import { useParams } from 'react-router';
import { useTournamentDays } from '@/hooks/useTournamentData';
import { AppBar } from '@/ui/app/AppBar';
import { PageBody } from '@/ui/app/Page';
import { Block, EmptyState, LinkButton, LoadingState, SectionLabel } from '@/ui/common/primitives';
import { StatusPill, TableGrid, TournamentNav } from '@/ui/tournament/pieces';
import { TournamentNotFound } from './TournamentNotFound';

/**
 * Every round, grouped by the day it was played on.
 *
 * A tournament can run over several days with a different number of rounds
 * each, so the day is the heading and the rounds sit under it — which is also
 * the only place the difference between an open and a fixed tournament shows.
 */
export function TournamentRoundsRoute() {
  const { tournamentId } = useParams();
  const days = useTournamentDays(tournamentId);

  if (days.status === 'loading') return <LoadingState label="Rondes laden…" />;
  if (days.status === 'missing') return <TournamentNotFound />;

  const total = days.data.reduce((count, day) => count + day.rounds.length, 0);

  return (
    <PageBody width="wide">
      <div className="flex flex-1 flex-col">
        <AppBar
          title="Rondes"
          subtitle={`${total} ${total === 1 ? 'ronde' : 'rondes'} · ${days.data.length} ${
            days.data.length === 1 ? 'speeldag' : 'speeldagen'
          }`}
          back={`/tournaments/${tournamentId}`}
        />

        <div className="flex flex-1 flex-col gap-4.5 pt-1">
          {days.data.length === 0 ? (
            <Block className="px-4 py-5">
              <EmptyState
                title="Nog geen rondes"
                description="Zodra de eerste ronde is ingedeeld, verschijnt hier het verloop van het toernooi."
                action={
                  <LinkButton to={`/tournaments/${tournamentId}`} variant="primary" size="lg" block>
                    Naar het overzicht
                  </LinkButton>
                }
              />
            </Block>
          ) : null}

          {days.data.map((day) => (
            <section key={day.id} className="flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between gap-3 px-1">
                <SectionLabel as="h2">{day.title}</SectionLabel>
                <div className="flex items-center gap-2">
                  <span className="text-caption text-muted">{day.subtitle}</span>
                  <StatusPill status={day.status} />
                </div>
              </div>

              {day.rounds.map((round) => (
                <div key={round.id} className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-3 px-1">
                    <p className="text-body font-semibold">{round.title}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-caption text-muted">{round.tableSummary}</span>
                      <StatusPill status={round.status} />
                    </div>
                  </div>
                  <TableGrid round={round} tournamentId={tournamentId ?? ''} />
                </div>
              ))}
            </section>
          ))}
        </div>

        <TournamentNav tournamentId={tournamentId ?? ''} />
      </div>
    </PageBody>
  );
}
