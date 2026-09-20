import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useCommand } from '@/hooks/useCommand';
import { useTournamentDashboard } from '@/hooks/useTournamentData';
import { useServices } from '@/app/servicesContext';
import { AppBar } from '@/ui/app/AppBar';
import { PageBody } from '@/ui/app/Page';
import { Trash } from '@/ui/common/icons';
import { ConfirmDialog } from '@/ui/common/ConfirmDialog';
import { downloadTextFile, readTextFile } from '@/ui/common/files';
import {
  Block,
  Button,
  ErrorPanel,
  LoadingState,
  Muted,
  Note,
  Row,
  SectionLabel,
} from '@/ui/common/primitives';
import { TournamentNav } from '@/ui/tournament/pieces';
import { TournamentNotFound } from './TournamentNotFound';

/**
 * What a tournament was set up as, and the two things that can still be done
 * to it as a whole: give it another name, or take it out of the app.
 *
 * The settings that decide how the games are scored are deliberately read-only
 * once play has begun. Changing how a point is earned half way through would
 * rewrite results that have already been played.
 */
export function TournamentSettingsRoute() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();
  const services = useServices();
  const dashboard = useTournamentDashboard(tournamentId);
  const fileInput = useRef<HTMLInputElement>(null);

  const [name, setName] = useState<string | undefined>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [importMessage, setImportMessage] = useState<string | undefined>();

  const rename = useCommand(async (next: string) =>
    tournamentId ? services.tournaments.rename(tournamentId, next) : undefined,
  );
  const exportTournament = useCommand(async () => {
    if (!tournamentId) return undefined;
    const result = await services.transfer.exportTournament(tournamentId);
    if (result.ok) downloadTextFile(result.fileName, result.json);
    return result;
  });
  const remove = useCommand(async () =>
    tournamentId ? services.tournaments.remove(tournamentId) : undefined,
  );

  if (dashboard.status === 'loading') return <LoadingState label="Instellingen laden…" />;
  if (dashboard.status === 'missing') return <TournamentNotFound />;

  const { data } = dashboard;
  const current = name ?? data.name;

  async function handleImport(file: File) {
    const parsed = services.transfer.parseTournament(await readTextFile(file));
    if (!parsed.ok) {
      setImportMessage(parsed.message);
      return;
    }
    const outcome = await services.transfer.importTournament(parsed.document);
    if (!outcome.ok) {
      setImportMessage(outcome.message);
      return;
    }
    navigate(`/tournaments/${outcome.tournament.id}`);
  }

  return (
    <PageBody>
      <div className="flex flex-1 flex-col pb-6">
        <AppBar
          title="Instellingen"
          subtitle={data.name}
          back={`/tournaments/${tournamentId}`}
        />

        <div className="flex flex-col gap-4.5 pt-2">
          <section className="flex flex-col gap-2">
            <SectionLabel className="px-1">Toernooi</SectionLabel>
            <Block className="px-4 py-3.5">
              <label htmlFor="toernooi-naam" className="text-body font-medium">
                Naam
              </label>
              <input
                id="toernooi-naam"
                type="text"
                className="mt-1.5 min-h-12 w-full rounded-tile border-[1.5px] border-border bg-surface px-3.5 text-base outline-none transition-colors focus:border-accent focus:bg-panel"
                value={current}
                onChange={(event) => setName(event.target.value)}
              />
              <Button
                size="sm"
                className="mt-2.5"
                disabled={current.trim() === data.name || rename.state === 'running'}
                onClick={() => void rename.run(current)}
              >
                Naam opslaan
              </Button>
            </Block>
          </section>

          <section className="flex flex-col gap-2">
            <SectionLabel className="px-1">Zo is dit toernooi opgezet</SectionLabel>
            <Block className="overflow-hidden">
              {[
                ['Opzet', data.modeLabel],
                ['Telling', data.scoringLabel],
                ['Deelnemers', `${data.participantCount}`],
                ['Speeldagen', `${data.dayCount}`],
                ['Rondes gespeeld', `${data.roundCount}`],
                ['Partijen afgerond', `${data.finishedGames}`],
              ].map(([label, value]) => (
                <Row key={label}>
                  <span className="min-w-0 flex-1 text-body">{label}</span>
                  <span className="shrink-0 text-body font-medium">{value}</span>
                </Row>
              ))}
            </Block>
            <Muted className="px-1 text-caption">
              De opzet en de telling liggen vast zodra er gespeeld is: ze bepalen wat een al
              gespeelde partij heeft opgeleverd.
            </Muted>
          </section>

          <section className="flex flex-col gap-2">
            <SectionLabel className="px-1">Bewaren en overzetten</SectionLabel>
            <Block className="overflow-hidden">
              <Row>
                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium">Toernooi exporteren</p>
                  <p className="mt-0.5 text-caption leading-snug text-muted">
                    Eén JSON-bestand met de opzet, de deelnemers, alle rondes en elke gespeelde
                    partij.
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={exportTournament.state === 'running'}
                  onClick={() => void exportTournament.run(undefined)}
                >
                  Exporteren
                </Button>
              </Row>

              <Row>
                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium">Toernooi importeren</p>
                  <p className="mt-0.5 text-caption leading-snug text-muted">
                    Er wordt altijd een nieuw toernooi aangemaakt; dit toernooi blijft ongewijzigd.
                  </p>
                </div>
                <Button size="sm" onClick={() => fileInput.current?.click()}>
                  Bestand kiezen
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleImport(file);
                    event.target.value = '';
                  }}
                />
              </Row>
            </Block>

            {importMessage ? (
              <ErrorPanel title="Dit bestand kon niet worden gelezen.">
                <p>{importMessage}</p>
              </ErrorPanel>
            ) : null}

            {exportTournament.result && !exportTournament.result.ok ? (
              <ErrorPanel title="Exporteren is niet gelukt.">
                <p>Dit toernooi kon niet worden gevonden.</p>
              </ErrorPanel>
            ) : null}
          </section>

          <section className="flex flex-col gap-2">
            <SectionLabel className="px-1">Verwijderen</SectionLabel>
            <Block className="overflow-hidden">
              <Row>
                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium">Toernooi verwijderen</p>
                  <p className="mt-0.5 text-caption leading-snug text-muted">
                    De partijen blijven bestaan onder Partijen. Alleen het toernooi verdwijnt.
                  </p>
                </div>
                <Button variant="dangerSoft" size="sm" onClick={() => setConfirmDelete(true)}>
                  Verwijderen
                </Button>
              </Row>
            </Block>
          </section>

          <Note lead="Let op" tone="info">
            Alles staat op dit apparaat. Exporteer het toernooi om het elders te openen.
          </Note>
        </div>

        <TournamentNav tournamentId={tournamentId ?? ''} />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`${data.name} verwijderen?`}
        description="Het toernooi verdwijnt van dit apparaat. De partijen die eraan hingen blijven staan."
        confirmLabel="Verwijderen"
        tone="danger"
        icon={
          <span className="flex size-13 items-center justify-center rounded-btn bg-neg-soft text-heart">
            <Trash />
          </span>
        }
        onConfirm={() => {
          void remove.run(undefined);
          setConfirmDelete(false);
          navigate('/tournaments');
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </PageBody>
  );
}
