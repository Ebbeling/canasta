import { useState } from 'react';
import { useParams } from 'react-router';
import { useServerTables } from '@/hooks/useServerTables';
import { useTournamentDashboard } from '@/hooks/useTournamentData';
import { useCommand } from '@/hooks/useCommand';
import { useServices } from '@/app/servicesContext';
import { useServerLink } from '@/app/serverLinkContext';
import { isReachableFromOtherDevices } from '@/net/protocol';
import { AppBar } from '@/ui/app/AppBar';
import { PageBody } from '@/ui/app/Page';
import { Plus } from '@/ui/common/icons';
import {
  Block,
  Button,
  Card,
  EmptyState,
  ErrorPanel,
  LoadingState,
  Note,
  SectionLabel,
} from '@/ui/common/primitives';
import { ConfirmDialog } from '@/ui/common/ConfirmDialog';
import { QrCode } from '@/ui/tournament/QrCode';
import { StatusPill, TournamentNav } from '@/ui/tournament/pieces';
import { TournamentNotFound } from './TournamentNotFound';

/**
 * The tables in the room, and the devices standing on them.
 *
 * Only reachable when a tournament server is serving this app: without one
 * there is nothing to connect to, and a QR code pointing at a page that is not
 * being served would be worse than no QR code at all.
 *
 * The code belongs to the table, not to the round. That is the whole reason a
 * physical table is a thing of its own: print it once, and the device keeps
 * showing the right match every round without anybody scanning anything again.
 */
export function TournamentTablesRoute() {
  const { tournamentId } = useParams();
  const services = useServices();
  const server = useServerLink();
  const dashboard = useTournamentDashboard(tournamentId);
  const tables = useServerTables(tournamentId);

  const [showing, setShowing] = useState<string | undefined>();
  const [confirming, setConfirming] = useState<string | undefined>();
  const [copied, setCopied] = useState<string | undefined>();

  const add = useCommand(async () =>
    tournamentId ? services.tournaments.addTable(tournamentId) : undefined,
  );

  if (dashboard.status === 'loading') return <LoadingState label="Tafels laden…" />;
  if (dashboard.status === 'missing') return <TournamentNotFound />;

  const offline = server?.present === true && server.connected === false;

  /*
   * A link nobody else can open.
   *
   * The server builds these from its own LAN address, so this only happens
   * when there is no network or it was started with `-LocalOnly`. Saying so
   * beats printing a QR code that works on exactly one device in the room.
   */
  const unreachable =
    tables.state.status === 'ready' &&
    tables.state.tables.some((entry) => entry.joinUrl && !isReachableFromOtherDevices(entry.joinUrl));

  return (
    <PageBody width="wide">
      <div className="flex flex-1 flex-col">
        <AppBar
          title="Tafels"
          subtitle={dashboard.data.name}
          back={`/tournaments/${tournamentId}`}
        />

        <div className="flex flex-1 flex-col gap-3.5 pt-1">
          {!server?.present ? (
            <EmptyState
              title="Geen toernooiserver"
              description="Tafels met eigen apparaten werken alleen wanneer deze app door de lokale toernooiserver wordt geserveerd. Start die op de laptop en open het adres dat hij toont."
            />
          ) : null}

          {offline ? (
            <Note lead="Geen verbinding" tone="warn">
              De server is nu niet bereikbaar. Wat je hier ziet is het laatste dat is opgehaald.
            </Note>
          ) : null}

          {tables.state.status === 'error' ? (
            <ErrorPanel title="De tafels konden niet worden geladen.">
              <p>{tables.state.message}</p>
            </ErrorPanel>
          ) : null}

          {tables.state.status === 'loading' ? <LoadingState label="Tafels laden…" /> : null}

          {tables.state.status === 'ready' ? (
            <>
              <Note lead="Zo werkt het" tone="info">
                Elke tafel heeft een eigen QR-code. Scan hem één keer met het apparaat dat op die
                tafel blijft staan; bij elke nieuwe ronde verschijnt de juiste partij vanzelf.
              </Note>

              {unreachable ? (
                <Note lead="Niet te scannen" tone="warn">
                  Deze links wijzen naar deze laptop zelf, niet naar het netwerk. Een telefoon kan
                  ze dus niet openen. Controleer of de laptop met de WiFi verbonden is en of de
                  server zonder <code>-LocalOnly</code> is gestart.
                </Note>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {tables.state.tables.map((entry) => (
                  <Card key={entry.table.id} className="flex flex-col gap-3 px-4.5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <SectionLabel as="h2">Tafel {entry.table.number}</SectionLabel>
                        {entry.table.name ? (
                          <p className="truncate text-caption text-muted">{entry.table.name}</p>
                        ) : null}
                      </div>
                      <StatusPill
                        status={
                          entry.connected
                            ? { kind: 'busy', label: 'Verbonden' }
                            : entry.hasSession
                              ? { kind: 'waiting', label: 'Niet verbonden' }
                              : { kind: 'waiting', label: 'Nog geen code' }
                        }
                      />
                    </div>

                    {entry.lastSeenAt && !entry.connected ? (
                      <p className="text-caption text-muted">
                        Laatst gezien {new Date(entry.lastSeenAt).toLocaleTimeString('nl-NL', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    ) : null}

                    {showing === entry.table.id && entry.joinUrl ? (
                      <div className="flex flex-col items-center gap-2 py-1">
                        {/* One URL, straight from the server: the code and the
                            copied link are the same string. */}
                        <QrCode
                          value={entry.joinUrl}
                          size={180}
                          label={`QR-code om een apparaat aan tafel ${entry.table.number} te koppelen`}
                        />
                        <p className="break-all text-center text-micro text-muted">
                          {entry.joinUrl}
                        </p>
                        <Button
                          size="sm"
                          onClick={() => {
                            const url = entry.joinUrl;
                            if (!url) return;
                            void navigator.clipboard?.writeText(url).then(() => {
                              setCopied(entry.table.id);
                              setTimeout(() => setCopied(undefined), 2000);
                            });
                          }}
                        >
                          {copied === entry.table.id ? 'Gekopieerd' : 'Link kopiëren'}
                        </Button>
                      </div>
                    ) : null}

                    <div className="mt-auto flex flex-wrap gap-2">
                      {entry.hasSession ? (
                        <Button
                          size="sm"
                          onClick={() =>
                            setShowing(showing === entry.table.id ? undefined : entry.table.id)
                          }
                        >
                          {showing === entry.table.id ? 'QR verbergen' : 'QR tonen'}
                        </Button>
                      ) : null}

                      <Button size="sm" onClick={() => void tables.issue(entry.table.id)}>
                        {entry.hasSession ? 'Nieuwe code' : 'Code maken'}
                      </Button>

                      {entry.hasSession ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirming(entry.table.id)}
                        >
                          Ontkoppelen
                        </Button>
                      ) : null}
                    </div>
                  </Card>
                ))}
              </div>

              <Block className="px-4 py-3">
                <Button
                  size="md"
                  block
                  disabled={add.state === 'running'}
                  onClick={() => void add.run(undefined).then(() => tables.reload())}
                >
                  <Plus />
                  Tafel toevoegen
                </Button>
              </Block>
            </>
          ) : null}
        </div>

        <TournamentNav tournamentId={tournamentId ?? ''} />
      </div>

      <ConfirmDialog
        open={confirming !== undefined}
        title="Tafel ontkoppelen?"
        description="Het apparaat aan deze tafel wordt meteen uitgelogd. De QR-code werkt daarna niet meer; je kunt een nieuwe maken."
        confirmLabel="Ontkoppelen"
        tone="danger"
        onCancel={() => setConfirming(undefined)}
        onConfirm={() => {
          const id = confirming;
          setConfirming(undefined);
          setShowing(undefined);
          if (id) void tables.revoke(id);
        }}
      />
    </PageBody>
  );
}
