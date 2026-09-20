import { useParams } from 'react-router';
import { useTournamentStandings } from '@/hooks/useTournamentData';
import { AppBar } from '@/ui/app/AppBar';
import { PageBody } from '@/ui/app/Page';
import { Block, EmptyState, LoadingState, Note, Score } from '@/ui/common/primitives';
import { TournamentNav } from '@/ui/tournament/pieces';
import { TournamentNotFound } from './TournamentNotFound';

/**
 * The standings.
 *
 * Which figure the table is ordered by depends on the tournament's own scoring
 * mode, and the view model says so in a sentence rather than leaving the reader
 * to guess what the column means.
 */
export function TournamentStandingsRoute() {
  const { tournamentId } = useParams();
  const standings = useTournamentStandings(tournamentId);

  if (standings.status === 'loading') return <LoadingState label="Stand laden…" />;
  if (standings.status === 'missing') return <TournamentNotFound />;

  const { data } = standings;
  const columns = { gridTemplateColumns: '2rem minmax(0,1fr) auto' };

  return (
    <PageBody width="wide">
      <div className="flex flex-1 flex-col">
        <AppBar title={data.title} subtitle={data.subtitle} back={`/tournaments/${tournamentId}`} />

        <div className="flex flex-1 flex-col gap-3 pt-1">
          <Note lead="Zo wordt geteld" tone="info">
            {data.explanation}
          </Note>

          {data.unresolvedNote ? (
            <Note lead="Let op" tone="warn">
              {data.unresolvedNote}
            </Note>
          ) : null}

          {data.provisional ? (
            <Note lead="Voorlopig" tone="info">
              Niet elke tafel van de gespeelde rondes heeft een uitslag. De stand loopt mee zodra
              de partijen zijn afgerond.
            </Note>
          ) : null}

          {data.rows.length === 0 ? (
            <Block className="px-4 py-5">
              <EmptyState
                title="Nog geen stand"
                description="Zodra de eerste partij is afgerond, verschijnt hier de stand."
              />
            </Block>
          ) : (
            <Block className="overflow-hidden py-1.5 lg:rounded-card">
              <div
                style={columns}
                className="grid items-center gap-x-3 px-4 pb-1.5 pt-2 text-micro font-semibold uppercase tracking-label text-muted md:px-6"
              >
                <span>#</span>
                <span>Deelnemer</span>
                <span className="text-right">{data.pointsHeader}</span>
              </div>

              <ul>
                {data.rows.map((row) => (
                  <li key={row.participantId} className="border-t border-border">
                    <div
                      style={columns}
                      className="grid min-h-15 items-center gap-x-3 px-4 py-2.5 md:px-6"
                    >
                      <Score tight={false} className="text-lg text-muted">
                        {row.rankText}
                      </Score>
                      <div className="min-w-0">
                        <p className="truncate text-body font-semibold">
                          {row.name}
                          {row.withdrawn ? (
                            <span className="ml-2 text-caption font-medium text-muted">
                              gestopt
                            </span>
                          ) : null}
                        </p>
                        <p className="truncate text-caption text-muted">
                          {row.memberLine ? `${row.memberLine} · ` : ''}
                          {row.recordLine}
                        </p>
                      </div>
                      <div className="text-right">
                        <Score className="block text-2xl">{row.pointsText}</Score>
                        <span className="block text-xs tabular text-muted">
                          {row.canastaScoreText}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Block>
          )}
        </div>

        <TournamentNav tournamentId={tournamentId ?? ''} />
      </div>
    </PageBody>
  );
}
