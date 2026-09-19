import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { CanastaExportV1 } from '@/application/transfer/format';
import type { ImportPreview, ParseFailure } from '@/application/transfer/parseExport';
import { useServices } from '@/app/servicesContext';
import { useCommand } from '@/hooks/useCommand';
import { readTextFile } from '@/ui/common/files';
import { Button, Card, ErrorPanel, Muted, SectionTitle } from '@/ui/common/primitives';

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
    <Card>
      <SectionTitle>Partij importeren</SectionTitle>
      <Muted>
        Kies een eerder geëxporteerd bestand. Er wordt altijd een nieuwe partij aangemaakt; een
        bestaande partij wordt nooit overschreven.
      </Muted>

      <div className="mt-3">
        <label htmlFor="import-bestand" className="text-sm font-medium">
          Exportbestand (.json)
        </label>
        <input
          id="import-bestand"
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="mt-1 block w-full text-sm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>

      {failure ? (
        <div className="mt-3">
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
        </div>
      ) : null}

      {staged ? (
        <div className="mt-3 rounded-xl border border-[--color-border] bg-[--color-panel-muted] p-3">
          <p className="font-medium">{staged.preview.gameName}</p>
          <ul className="mt-1 text-sm text-[--color-ink-muted]">
            <li>{staged.preview.ruleSetName}</li>
            <li>
              {staged.preview.playerCount} spelers · {staged.preview.teamCount} teams ·{' '}
              {staged.preview.roundCount === 1 ? '1 ronde' : `${staged.preview.roundCount} rondes`}
            </li>
            <li>Status: {STATUS_LABELS[staged.preview.status]}</li>
            <li>Geëxporteerd op: {staged.preview.exportedAt.slice(0, 10)}</li>
          </ul>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={runImport.state === 'running'}
              onClick={() => void confirmImport()}
            >
              Importeren
            </Button>
            <Button onClick={reset}>Annuleren</Button>
          </div>
        </div>
      ) : null}

      {runImport.result && !runImport.result.ok ? (
        <div className="mt-3">
          <ErrorPanel title="Importeren is niet gelukt.">{runImport.result.message}</ErrorPanel>
        </div>
      ) : null}

      {runImport.state === 'failed' ? (
        <div className="mt-3">
          <ErrorPanel title="Importeren is niet gelukt.">{runImport.error?.message}</ErrorPanel>
        </div>
      ) : null}
    </Card>
  );
}
