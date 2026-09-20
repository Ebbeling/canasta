import { useNavigate, useParams } from 'react-router';
import { useCommand } from '@/hooks/useCommand';
import { useTournamentDays } from '@/hooks/useTournamentData';
import { useServices } from '@/app/servicesContext';
import { AppBar } from '@/ui/app/AppBar';
import { PageBody } from '@/ui/app/Page';
import { ChevronRight } from '@/ui/common/icons';
import {
  Block,
  Button,
  Card,
  ErrorPanel,
  LinkButton,
  LoadingState,
  Note,
  Score,
  SectionLabel,
} from '@/ui/common/primitives';
import { StatusPill, TournamentNav } from '@/ui/tournament/pieces';
import { TournamentNotFound } from './TournamentNotFound';

/**
 * One table.
 *
 * The only thing this screen does with a game is create it and then get out of
 * the way: "Open partij" goes to the ordinary scoreboard, where the round is
 * entered exactly as it would be outside a tournament. Nothing about scoring
 * is repeated here.
 */
export function TournamentMatchRoute() {
  const { tournamentId, matchId } = useParams();
  const navigate = useNavigate();
  const services = useServices();
  const days = useTournamentDays(tournamentId);

  const start = useCommand(async () => {
    if (!tournamentId || !matchId) return undefined;
    const outcome = await services.tournaments.startMatch(tournamentId, matchId);
    if (outcome.ok) navigate(`/games/${outcome.game.id}`);
    return outcome;
  });

  const replay = useCommand(async () => {
    if (!tournamentId || !matchId) return undefined;
    const outcome = await services.tournaments.replayMatch(tournamentId, matchId);
    if (outcome.ok) navigate(`/games/${outcome.game.id}`);
    return outcome;
  });

  if (days.status === 'loading') return <LoadingState label="Tafel laden…" />;
  if (days.status === 'missing') return <TournamentNotFound />;

  const rounds = days.data.flatMap((day) => day.rounds);
  const round = rounds.find((entry) => entry.matches.some((match) => match.id === matchId));
  const match = round?.matches.find((entry) => entry.id === matchId);

  if (!round || !match) return <TournamentNotFound />;

  return (
    <PageBody>
      <div className="flex flex-1 flex-col">
        <AppBar
          title={match.title}
          subtitle={`${round.title} · ${round.subtitle}`}
          back={`/tournaments/${tournamentId}`}
        />

        <div className="flex flex-1 flex-col gap-3 pt-1">
          <Card className="flex flex-col gap-3.5 px-4.5 py-4">
            <div className="flex items-center justify-between gap-3">
              <SectionLabel as="h2">Aan deze tafel</SectionLabel>
              <StatusPill status={match.status} />
            </div>

            <div className="flex flex-col gap-1.5">
              {match.sideLines.map((line, index) => (
                <p key={line + index} className="text-body font-medium">
                  {line}
                </p>
              ))}
            </div>

            {match.resultLines.length > 0 ? (
              <div className="flex flex-col gap-1 border-t border-border pt-3">
                <SectionLabel as="h3">Uitslag</SectionLabel>
                {match.resultLines.map((line) => (
                  <p key={line} className="text-sm">
                    {line}
                  </p>
                ))}
              </div>
            ) : null}
          </Card>

          {match.missingGame ? (
            <Note lead="Aandacht" tone="warn">
              De partij van deze tafel is niet meer te vinden — mogelijk is hij verwijderd. Start
              een nieuwe partij om verder te kunnen.
            </Note>
          ) : null}

          {match.needsDecision ? (
            <Note lead="Gelijk geëindigd" tone="warn">
              Deze partij eindigde in een gedeelde winst, en dit toernooi kent geen gelijkspel. De
              tafel levert daarom nog niets op voor de stand, en de ronde kan pas worden afgesloten
              als hij opnieuw is gespeeld. De gespeelde partij blijft ongewijzigd onder Partijen
              staan.
            </Note>
          ) : null}

          {[start.result, replay.result].map((outcome, index) =>
            outcome && !outcome.ok && outcome.reason === 'validation' ? (
              <ErrorPanel key={index} title="De partij kon niet worden gestart.">
                <ul className="list-disc pl-5">
                  {outcome.issues.map((issue) => (
                    <li key={issue.code}>{issue.message}</li>
                  ))}
                </ul>
              </ErrorPanel>
            ) : null,
          )}

          {match.isBye ? (
            <Block className="px-4 py-4">
              <p className="text-body font-medium">Deze deelnemer is deze ronde vrij.</p>
              <p className="mt-1 text-caption leading-snug text-muted">
                Een vrije ronde levert geen punten op en telt niet als gespeelde partij.
              </p>
            </Block>
          ) : match.needsDecision ? (
            <div className="flex flex-col gap-2">
              <Button
                variant="primary"
                size="xl"
                block
                disabled={replay.state === 'running'}
                onClick={() => void replay.run(undefined)}
              >
                {match.actionLabel}
                <ChevronRight />
              </Button>
              {match.gameId ? (
                <LinkButton to={`/games/${match.gameId}`} size="md" block>
                  Bekijk de gespeelde partij
                </LinkButton>
              ) : null}
            </div>
          ) : match.gameId && !match.missingGame ? (
            <LinkButton to={`/games/${match.gameId}`} variant="primary" size="xl" block>
              {match.actionLabel}
              <ChevronRight />
            </LinkButton>
          ) : (
            <Button
              variant="primary"
              size="xl"
              block
              disabled={start.state === 'running'}
              onClick={() => void start.run(undefined)}
            >
              {match.actionLabel}
              <ChevronRight />
            </Button>
          )}

          <Score className="sr-only">{match.tableNumber}</Score>
        </div>

        <TournamentNav tournamentId={tournamentId ?? ''} />
      </div>
    </PageBody>
  );
}
