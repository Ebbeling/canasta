import { useParams } from 'react-router';
import { useTableSession } from '@/hooks/useTableSession';
import { TOURNAMENT_PROTOCOL_VERSION } from '@/net/protocol';
import { ChevronRight } from '@/ui/common/icons';
import {
  Button,
  Card,
  LinkButton,
  LoadingState,
  Note,
  Score,
  SectionLabel,
} from '@/ui/common/primitives';
import {
  MatchStatus,
  PendingPanel,
  SeatingCard,
  TableHeader,
  TableMessage,
} from '@/ui/table/pieces';

/**
 * What one table sees.
 *
 * A screen for a phone standing on a card table: which tournament, which table,
 * which round, who is sitting here, and one thing to do. It has no navigation
 * into the rest of the app on purpose — the device is paired to a table, not
 * handed to an organiser.
 *
 * The scoring is not here either. "Score invoeren" goes to the ordinary round
 * form, driven by this game's own frozen rule set; this screen only knows that
 * a round is a thing you can hand in.
 */
export function TableRoute() {
  const { token } = useParams();
  const session = useTableSession(token);

  if (session.view.status === 'loading') return <LoadingState label="Tafel laden…" />;

  if (session.view.status === 'invalid') {
    return (
      <TableMessage title="Deze koppeling werkt niet">
        <p>{session.view.message}</p>
      </TableMessage>
    );
  }

  if (session.view.status === 'incompatible') {
    return (
      <TableMessage title="Versies komen niet overeen">
        <p>
          De server spreekt versie {session.view.serverProtocol} en deze app versie{' '}
          {TOURNAMENT_PROTOCOL_VERSION}. Ververs deze pagina; blijft dit staan, vraag de organisator
          om beide bij te werken.
        </p>
      </TableMessage>
    );
  }

  const state = session.view.status === 'ready' ? session.view.state : session.view.state;

  if (!state) {
    return (
      <TableMessage
        title="Geen verbinding"
        action={
          <Button size="lg" block onClick={() => void session.refresh()}>
            Opnieuw proberen
          </Button>
        }
      >
        <p>
          Deze tafel kan de server niet bereiken. Controleer of het apparaat nog op dezelfde WiFi
          zit als de laptop van de organisator.
        </p>
      </TableMessage>
    );
  }

  const match = state.match;
  const round = state.round;

  return (
    <div className="flex flex-1 flex-col gap-3.5 px-4 py-4 sm:mx-auto sm:w-full sm:max-w-screen-sm">
      <TableHeader
        tableNumber={state.session.table.number}
        tournamentName={state.session.tournamentName}
        roundLine={round ? `Ronde ${round.sequence} · dag ${round.dayNumber}` : undefined}
        connected={!session.offline}
      />

      {session.offline ? (
        <Note lead="Geen verbinding" tone="warn">
          Je ziet het laatste dat is opgehaald. Wat je invoert blijft op dit apparaat staan tot de
          server weer bereikbaar is.
        </Note>
      ) : null}

      <PendingPanel
        pending={session.pending}
        onRetry={() => void session.retry()}
        onDiscard={session.discard}
      />

      {!match ? (
        <Card className="flex flex-col gap-2 px-5 py-6">
          <SectionLabel as="h2">Nog geen partij</SectionLabel>
          <p className="text-body leading-snug text-muted">
            {state.tournamentStatus === 'finished'
              ? 'Het toernooi is afgerond. Bedankt!'
              : 'De organisator heeft deze ronde nog niet ingedeeld. Dit scherm werkt zichzelf bij zodra dat gebeurt.'}
          </p>
        </Card>
      ) : (
        <>
          <SeatingCard sideLines={match.sideLines} />

          <Card className="flex items-center justify-between gap-3 px-5 py-4">
            <SectionLabel as="h2">Status</SectionLabel>
            <MatchStatus status={match.status} />
          </Card>

          {state.game && match.status !== 'waiting' ? (
            <Card className="flex flex-col gap-2 px-5 py-4">
              <SectionLabel as="h2">Stand</SectionLabel>
              {state.game.game.teams
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((team) => (
                  <div key={team.id} className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-body font-medium">{team.name}</span>
                    <Score>{state.game!.game.summary?.totalsByTeam[team.id] ?? 0}</Score>
                  </div>
                ))}
              <p className="text-caption text-muted">
                {state.game.rounds.length === 1
                  ? '1 ronde gespeeld'
                  : `${state.game.rounds.length} rondes gespeeld`}
              </p>
            </Card>
          ) : null}

          {match.status === 'waiting' ? (
            <Button
              variant="primary"
              size="xl"
              block
              disabled={session.offline}
              onClick={() => void session.startMatch()}
            >
              Partij starten
              <ChevronRight />
            </Button>
          ) : null}

          {match.status === 'busy' ? (
            <LinkButton to={`/table/${token}/round`} variant="primary" size="xl" block>
              Score invoeren
              <ChevronRight />
            </LinkButton>
          ) : null}

          {match.status === 'done' ? (
            <Note lead="Klaar" tone="info">
              Deze partij is afgerond. De organisator sluit de ronde af; daarna verschijnt hier
              vanzelf de volgende.
            </Note>
          ) : null}

          {match.status === 'undecided' ? (
            <Note lead="Gelijk geëindigd" tone="warn">
              De partij eindigde gelijk en dit toernooi kent geen gelijkspel. De organisator laat
              deze tafel opnieuw spelen.
            </Note>
          ) : null}
        </>
      )}
    </div>
  );
}
