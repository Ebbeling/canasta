import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { CanastaExportV1 } from '@/application/transfer/format';
import type { ImportPreview, ParseFailure } from '@/application/transfer/parseExport';
import { useServices } from '@/app/servicesContext';
import { useCommand } from '@/hooks/useCommand';
import { readTextFile } from '@/ui/common/files';
import { Badge, Block, Button, ErrorPanel, Muted, SectionLabel } from '@/ui/common/primitives';

const STATUS_LABELS: Record<ImportPreview['status'], string> = {
  active: 'Bezig',
  finished: 'Afgerond',
  abandoned: 'Gestopt',
};

/**
 * Import in three steps: pick a file, look at what it contains, then confirm.
 *
 * Picking a file writes nothing. Parsing and validation happen first and are
 * entirely in memory, so an invalid file can never touch the database.
 */
export function ImportGameSection() {
  const services = useServices();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);

  const [staged, setStaged] = useState<
    { document: CanastaExportV1; preview: ImportPreview; fileName: string } | undefined
  >();
  const [failure, setFailure] = useState<ParseFailure | undefined>();

  const runImport = useCommand(async (document: CanastaExportV1) =>
    services.transfer.importGame(document),
  );

  function reset() {
    setStaged(undefined);
    setFailure(undefined);
    runImport.reset();
    if (fileInput.current) fileInput.current.value = '';
  }

  async function handleFile(file: File) {
    setStaged(undefined);
    setFailure(undefined);
    runImport.reset();

    const parsed = services.transfer.parse(await readTextFile(file));

    if (!parsed.ok) {
      setFailure(parsed);
      // The technical detail belongs in the console, not on the screen.
      if (parsed.detail) console.warn('Import geweigerd:', parsed.reason, parsed.detail);
      return;
    }

    setStaged({
      document: parsed.document,
      preview: services.transfer.preview(parsed.document),
      fileName: file.name,
    });
  }

  async function confirmImport() {
    if (!staged) return;
    const outcome = await runImport.run(staged.document);
    if (outcome?.ok) {
      reset();
      navigate(`/games/${outcome.game.id}`);
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel className="px-1">Partij importeren</SectionLabel>

      <Block className="flex flex-col gap-3 px-4 py-4">
        <Muted>
          Kies een eerder geëxporteerd bestand. Er wordt altijd een nieuwe partij aangemaakt; een
          bestaande partij wordt nooit overschreven.
        </Muted>

        <div>
          <label htmlFor="import-bestand" className="text-body font-medium">
            Exportbestand (.json)
          </label>
          <input
            id="import-bestand"
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="mt-1.5 block w-full text-sm text-muted file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-tile file:border-[1.5px] file:border-border file:bg-panel file:px-3.5 file:text-sm file:font-semibold file:text-ink"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </div>

        {failure ? (
          <ErrorPanel title="Dit bestand kan niet worden geïmporteerd.">
            <p>{failure.message}</p>
            {failure.issues && failure.issues.length > 1 ? (
              <ul className="mt-1 list-disc pl-5">
                {failure.issues.slice(0, 5).map((issue) => (
                  <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>
                ))}
              </ul>
            ) : null}
          </ErrorPanel>
        ) : null}

        {staged ? (
          <div className="rounded-control border border-border bg-panel2 px-3.5 py-3">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate font-semibold">{staged.preview.gameName}</p>
              <Badge tone="neutral">{STATUS_LABELS[staged.preview.status]}</Badge>
            </div>
            <ul className="mt-1 text-note text-muted">
              <li>{staged.preview.ruleSetName}</li>
              <li>
                {staged.preview.playerCount} spelers · {staged.preview.teamCount} teams ·{' '}
                {staged.preview.roundCount === 1 ? '1 ronde' : `${staged.preview.roundCount} rondes`}
              </li>
              <li>Geëxporteerd op: {staged.preview.exportedAt.slice(0, 10)}</li>
            </ul>

            <div className="mt-3 flex gap-2">
              <Button
                variant="primary"
                size="md"
                block
                disabled={runImport.state === 'running'}
                onClick={() => void confirmImport()}
              >
                Importeren
              </Button>
              <Button variant="ghost" size="md" onClick={reset}>
                Annuleren
              </Button>
            </div>
          </div>
        ) : null}

        {runImport.result && !runImport.result.ok ? (
          <ErrorPanel title="Importeren is niet gelukt.">{runImport.result.message}</ErrorPanel>
        ) : null}

        {runImport.state === 'failed' ? (
          <ErrorPanel title="Importeren is niet gelukt.">{runImport.error?.message}</ErrorPanel>
        ) : null}
      </Block>
    </section>
  );
}
