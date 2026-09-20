import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  buildPairingView,
  type PairingProposalVM,
} from '@/application/viewmodels/tournamentView';
import { useCommand } from '@/hooks/useCommand';
import { useTournamentDashboard } from '@/hooks/useTournamentData';
import { useServices } from '@/app/servicesContext';
import { AppBar } from '@/ui/app/AppBar';
import { PageBody } from '@/ui/app/Page';
import { Check, ChevronRight, Plus } from '@/ui/common/icons';
import { ConfirmDialog } from '@/ui/common/ConfirmDialog';
import {
  Block,
  Button,
  Card,
  EmptyState,
  ErrorPanel,
  LinkButton,
  LoadingState,
  Note,
  Score,
  SectionLabel,
} from '@/ui/common/primitives';
import { PairingReview } from '@/ui/tournament/PairingReview';
import { StandingsPreview, StatusPill, TableGrid, TournamentNav } from '@/ui/tournament/pieces';
import { TournamentNotFound } from './TournamentNotFound';

/**
 * The tournament dashboard: what is being played right now.
 *
 * Everything an organiser walking between tables needs on one screen — which
 * round, which tables, which of them are still going, what to do next. The
 * games themselves live behind the tables, in the ordinary game screens.
 */
export function TournamentRoute() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();
  const services = useServices();
  const dashboard = useTournamentDashboard(tournamentId);

  // The arrangement being reviewed, with the heading it was made under. Held
  // here rather than derived, so a write somewhere else in the app — another
  // tab finishing a game — cannot throw away what the organiser is looking at.
  const [review, setReview] = useState<
    { proposal: PairingProposalVM; title: string } | undefined
  >();
  const [confirmEnd, setConfirmEnd] = useState<'day' | 'tournament' | undefined>();

  const [manualAllowed, setManualAllowed] = useState(true);

  const propose = useCommand(async () => {
    if (!tournamentId) return undefined;
    const tournament = await services.tournaments.get(tournamentId);
    if (tournament) setManualAllowed(tournament.settings.manualPairingAllowed);
    const outcome = await services.tournaments.propose(tournamentId);
    if (!outcome.ok || !tournament) return outcome;

    setReview({
      proposal: buildPairingView(
        {
          participants: tournament.participants,
          teamsPerMatch: tournament.gameSettings.teamsPerMatch,
        },
        outcome.proposal,
      ),
      title: `Ronde ${tournament.rounds.length + 1} indelen`,
    });
    return outcome;
  });

  const completeRound = useCommand(async (roundId: string) =>
    tournamentId ? services.tournaments.completeRound(tournamentId, roundId) : undefined,
  );
  const endDay = useCommand(async () =>
    tournamentId ? services.tournaments.endDay(tournamentId) : undefined,
  );
  const finish = useCommand(async () =>
    tournamentId ? services.tournaments.finish(tournamentId) : undefined,
  );

  // The review comes first: it is what the organiser is doing right now.
  if (review && tournamentId) {
    return (
      <PairingReview
        tournamentId={tournamentId}
        proposal={review.proposal}
        manualAllowed={manualAllowed}
        onProposalChange={(proposal) => setReview({ ...review, proposal })}
        onCancel={() => setReview(undefined)}
        onConfirmed={() => setReview(undefined)}
        title={review.title}
      />
    );
  }

  if (dashboard.status === 'loading') return <LoadingState label="Toernooi laden…" />;
  if (dashboard.status === 'missing') return <TournamentNotFound />;

  const { data } = dashboard;
  const round = data.round;

  return (
    <PageBody width="wide">
      <div className="flex flex-1 flex-col">
        <AppBar
          title={data.name}
          subtitle={data.subtitle}
          back="/tournaments"
          action={
            <LinkButton to={`/tournaments/${tournamentId}/settings`} size="sm" className="shrink-0">
              Instellingen
            </LinkButton>
          }
        />

        <div className="flex flex-1 flex-col gap-3.5 pt-1 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:content-start lg:items-start lg:gap-6">
          {/* What is happening, in one card. */}
          <Card className="flex flex-col gap-3 px-4.5 py-4 lg:order-1">
            <div className="flex items-center justify-between gap-3">
              <StatusPill status={data.status} />
              <span className="truncate text-caption text-muted">
                {data.modeLabel} · {data.scoringLabel}
              </span>
            </div>

            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <SectionLabel as="h2">Nu</SectionLabel>
                <p className="font-display text-[2.125rem] font-semibold leading-none tracking-display">
                  {round ? `Ronde ${round.sequence}` : 'Nog geen ronde'}
                  {data.progress ? (
                    <span className="font-medium text-muted"> van {data.progress.total}</span>
                  ) : null}
                </p>
              </div>
              <p className="shrink-0 text-right text-caption text-muted">
                {data.participantCount} deelnemers
                <br />
                {data.dayCount} {data.dayCount === 1 ? 'speeldag' : 'speeldagen'}
              </p>
            </div>

            {data.progress ? (
              <div className="flex gap-1" aria-hidden="true">
                {Array.from({ length: data.progress.total }, (_unused, index) => (
                  <span
                    key={index}
                    className={`h-1.5 flex-1 rounded-full ${
                      index < data.progress!.completed ? 'bg-accent' : 'bg-panel2'
                    }`}
                  />
                ))}
              </div>
            ) : null}

            {round ? <p className="text-caption text-muted">{round.tableSummary}</p> : null}
          </Card>

          {data.attention.map((message) => (
            <Note key={message} lead="Aandacht" tone="warn" className="lg:order-2">
              {message}
            </Note>
          ))}

          {propose.result && !propose.result.ok ? (
            <ErrorPanel title="De indeling kon niet worden gemaakt.">
              <ul className="list-disc pl-5">
                {propose.result.issues.map((issue) => (
                  <li key={issue.code}>{issue.message}</li>
                ))}
              </ul>
            </ErrorPanel>
          ) : null}

          {completeRound.result && !completeRound.result.ok ? (
            <ErrorPanel title="De ronde kon niet worden afgesloten.">
              {completeRound.result.reason === 'validation'
                ? completeRound.result.issues.map((issue) => <p key={issue.code}>{issue.message}</p>)
                : null}
            </ErrorPanel>
          ) : null}

          {/* The tables. */}
          <div className="flex flex-col gap-2.5 lg:order-3">
            <div className="flex items-baseline justify-between gap-3">
              <SectionLabel as="h2">
                {round ? `Tafels · ronde ${round.sequence}` : 'Tafels'}
              </SectionLabel>
              <LinkButton to={`/tournaments/${tournamentId}/rounds`} variant="ghost" size="sm">
                Alle rondes
              </LinkButton>
            </div>

            {round && round.matches.length > 0 ? (
              <TableGrid round={round} tournamentId={tournamentId ?? ''} />
            ) : (
              <Block className="px-4 py-5">
                <EmptyState
                  title="Nog geen ronde ingedeeld"
                  description="Deel de eerste ronde in om de tafels te maken."
                />
              </Block>
            )}
          </div>

          {/* What to do next. */}
          <Card className="flex flex-col gap-3 px-4.5 py-4 lg:order-4 lg:col-start-2 lg:row-start-2">
            <div>
              <SectionLabel as="h2">Volgende</SectionLabel>
              <p className="mt-1 text-body font-medium">{data.nextAction.label}</p>
              <p className="mt-0.5 text-caption leading-snug text-muted">{data.nextAction.hint}</p>
            </div>

            <div className="flex flex-col gap-2">
              {data.nextAction.kind === 'planRound' ? (
                <Button
                  variant="primary"
                  size="lg"
                  block
                  disabled={propose.state === 'running'}
                  onClick={() => void propose.run(undefined)}
                >
                  <Plus />
                  Ronde indelen
                </Button>
              ) : null}

              {round && (data.nextAction.kind === 'completeRound' || data.nextAction.kind === 'playRound') ? (
                <Button
                  variant="primary"
                  size="lg"
                  block
                  disabled={!round.canComplete || completeRound.state === 'running'}
                  onClick={() => void completeRound.run(round.id)}
                >
                  <Check size={18} />
                  Ronde {round.sequence} afsluiten
                </Button>
              ) : null}

              {data.nextAction.kind === 'addParticipants' ? (
                <LinkButton
                  to={`/tournaments/${tournamentId}/participants`}
                  variant="primary"
                  size="lg"
                  block
                >
                  Naar de deelnemers
                  <ChevronRight />
                </LinkButton>
              ) : null}

              {data.status.kind !== 'done' ? (
                <div className="flex gap-2">
                  <Button size="md" block onClick={() => setConfirmEnd('day')}>
                    Speeldag beëindigen
                  </Button>
                  <Button variant="contrast" size="md" block onClick={() => setConfirmEnd('tournament')}>
                    Toernooi afronden
                  </Button>
                </div>
              ) : (
                <LinkButton
                  to={`/tournaments/${tournamentId}/standings`}
                  variant="primary"
                  size="lg"
                  block
                >
                  Naar de eindstand
                  <ChevronRight />
                </LinkButton>
              )}
            </div>
          </Card>

          <div className="lg:order-5 lg:col-start-2">
            <StandingsPreview
              rows={data.top}
              to={`/tournaments/${tournamentId}/standings`}
              pointsHeader={data.scoringLabel}
            />
          </div>

          {data.status.kind === 'done' ? (
            <Card tone="accent" className="px-5 py-4 lg:order-0 lg:col-span-2">
              <SectionLabel as="h2" tone="inherit">
                Afgerond
              </SectionLabel>
              <p className="mt-1 font-display text-2xl font-semibold tracking-title">
                {data.top[0]?.name ?? 'Geen winnaar'}
              </p>
              <p className="mt-0.5 text-sm opacity-90">
                {data.roundCount} rondes · {data.finishedGames} partijen ·{' '}
                {data.participantCount} deelnemers
              </p>
              <Score className="sr-only">{data.top[0]?.pointsText ?? ''}</Score>
            </Card>
          ) : null}
        </div>

        <TournamentNav tournamentId={tournamentId ?? ''} />
      </div>

      <ConfirmDialog
        open={confirmEnd === 'day'}
        title="Speeldag beëindigen?"
        description="Het toernooi blijft staan. Je kunt later een volgende speeldag beginnen."
        confirmLabel="Speeldag beëindigen"
        onConfirm={() => {
          void endDay.run(undefined);
          setConfirmEnd(undefined);
        }}
        onCancel={() => setConfirmEnd(undefined)}
      />

      <ConfirmDialog
        open={confirmEnd === 'tournament'}
        title="Toernooi afronden?"
        description="De stand van dit moment wordt de eindstand. Dit kan niet ongedaan worden gemaakt."
        confirmLabel="Toernooi afronden"
        tone="danger"
        onConfirm={() => {
          void finish.run(undefined);
          setConfirmEnd(undefined);
          navigate(`/tournaments/${tournamentId}`);
        }}
        onCancel={() => setConfirmEnd(undefined)}
      />
    </PageBody>
  );
}
