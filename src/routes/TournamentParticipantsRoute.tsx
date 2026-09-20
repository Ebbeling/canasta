import { useParams } from 'react-router';
import { useCommand } from '@/hooks/useCommand';
import { useTournamentParticipants } from '@/hooks/useTournamentData';
import { useServices } from '@/app/servicesContext';
import { AppBar } from '@/ui/app/AppBar';
import { PageBody } from '@/ui/app/Page';
import { Block, Button, ErrorPanel, LoadingState, Note, Score } from '@/ui/common/primitives';
import { StatusPill, TournamentNav } from '@/ui/tournament/pieces';
import { TournamentNotFound } from './TournamentNotFound';

/**
 * Who is taking part, and how they are doing.
 *
 * A participant who stops is withdrawn rather than deleted: the rounds they
 * did play stay in the history, and the pairing engine simply leaves them out
 * of every round after that.
 */
export function TournamentParticipantsRoute() {
  const { tournamentId } = useParams();
  const services = useServices();
  const participants = useTournamentParticipants(tournamentId);

  const withdraw = useCommand(async (participantId: string) =>
    tournamentId ? services.tournaments.withdraw(tournamentId, participantId) : undefined,
  );
  const reinstate = useCommand(async (participantId: string) =>
    tournamentId ? services.tournaments.reinstate(tournamentId, participantId) : undefined,
  );

  if (participants.status === 'loading') return <LoadingState label="Deelnemers laden…" />;
  if (participants.status === 'missing') return <TournamentNotFound />;

  const { data } = participants;
  const failure = [withdraw.result, reinstate.result].find(
    (result) => result && !result.ok && result.reason === 'validation',
  );

  return (
    <PageBody width="wide">
      <div className="flex flex-1 flex-col">
        <AppBar
          title={data.title}
          subtitle={data.subtitle}
          back={`/tournaments/${tournamentId}`}
        />

        <div className="flex flex-1 flex-col gap-3 pt-1">
          {failure && !failure.ok && failure.reason === 'validation' ? (
            <ErrorPanel title="Dat kan nu niet.">
              {failure.issues.map((issue) => (
                <p key={issue.code}>{issue.message}</p>
              ))}
            </ErrorPanel>
          ) : null}

          <Note lead={data.note.lead} tone="info">
            {data.note.body}
          </Note>

          <Block as="ul" className="overflow-hidden">
            {data.rows.map((row) => (
              <li
                key={row.id}
                className="flex min-h-15 flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-4 py-3 first:border-t-0 md:px-5.5"
              >
                <Score tight={false} className="w-6 shrink-0 text-note text-muted">
                  {row.rankText}
                </Score>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-semibold">{row.name}</p>
                  <p className="truncate text-caption text-muted">
                    {row.kindLabel}
                    {row.memberLine ? ` · ${row.memberLine}` : ''} · {row.recordLine}
                  </p>
                </div>
                <StatusPill status={row.status} />
                <Button
                  size="sm"
                  variant={row.withdrawn ? 'secondary' : 'dangerSoft'}
                  onClick={() =>
                    void (row.withdrawn ? reinstate.run(row.id) : withdraw.run(row.id))
                  }
                >
                  {row.withdrawn ? 'Weer meedoen' : 'Stopt'}
                </Button>
              </li>
            ))}
          </Block>
        </div>

        <TournamentNav tournamentId={tournamentId ?? ''} />
      </div>
    </PageBody>
  );
}
