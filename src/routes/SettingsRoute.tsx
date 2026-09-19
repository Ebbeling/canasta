import { useEffect, useState } from 'react';
import type { ThemePreference } from '@/application/ports';
import { useServices } from '@/app/servicesContext';
import { useGameList } from '@/hooks/useGameData';
import { useCommand } from '@/hooks/useCommand';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { applyTheme } from '@/app/theme';
import { BUILTIN_SOURCES } from '@/application/viewmodels/sources';
import { Button, Card, Muted, PageTitle, SectionTitle } from '@/ui/common/primitives';
import { ImportGameSection } from '@/ui/settings/ImportGameSection';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Volgt het systeem' },
  { value: 'light', label: 'Licht' },
  { value: 'dark', label: 'Donker' },
];

export function SettingsRoute() {
  const services = useServices();
  const games = useGameList();
  const install = usePwaInstall();

  const [theme, setTheme] = useState<ThemePreference>('system');
  const [persisted, setPersisted] = useState<boolean | undefined>();
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    void services.settings.theme().then(setTheme);
    void services.settings.storagePersisted().then(setPersisted);
  }, [services]);

  const clearAll = useCommand(async () => services.games.removeAll());

  async function chooseTheme(next: ThemePreference) {
    setTheme(next);
    applyTheme(next);
    await services.settings.setTheme(next);
  }

  return (
    <div className="space-y-4">
      <PageTitle>Instellingen</PageTitle>

      <Card>
        <SectionTitle>Thema</SectionTitle>
        <fieldset className="mt-2 flex flex-col gap-2 border-0 p-0">
          <legend className="sr-only">Kleurthema</legend>
          {THEME_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="inline-flex min-h-[var(--spacing-touch)] items-center gap-2"
            >
              <input
                type="radio"
                name="thema"
                value={option.value}
                checked={theme === option.value}
                onChange={() => void chooseTheme(option.value)}
              />
              <span className="text-sm">{option.label}</span>
            </label>
          ))}
        </fieldset>
      </Card>

      <Card>
        <SectionTitle>Opslag</SectionTitle>
        <p className="mt-2 text-sm">
          {games.status === 'ready'
            ? `${games.data.length === 1 ? '1 partij' : `${games.data.length} partijen`} op dit apparaat.`
            : 'Partijen tellen…'}
        </p>
        <Muted>
          Alle gegevens staan uitsluitend op dit apparaat. Er is geen account, geen server en geen
          synchronisatie.
        </Muted>
        <p className="mt-2 text-sm">
          Permanente opslag:{' '}
          {persisted === undefined ? 'onbekend' : persisted ? 'toegekend' : 'niet toegekend'}
        </p>
        {!persisted ? (
          <Button
            className="mt-2"
            onClick={() => void services.settings.requestPersistentStorage().then(setPersisted)}
          >
            Permanente opslag aanvragen
          </Button>
        ) : null}

        {install.canInstall ? (
          <Button className="mt-2" variant="primary" onClick={() => void install.promptInstall()}>
            App installeren
          </Button>
        ) : null}
        {install.iosHint ? (
          <Muted>
            Op iPhone en iPad: tik op de deelknop en kies &quot;Zet op beginscherm&quot; om de app
            te installeren.
          </Muted>
        ) : null}
      </Card>

      <ImportGameSection />

      <Card>
        <SectionTitle>Gegevens exporteren</SectionTitle>
        <Muted>
          Een partij exporteer je vanaf het scorebord van die partij, met de knop
          &quot;Exporteren&quot;. Je krijgt één JSON-bestand dat de partij compleet bevat, inclusief
          de regelset waarmee hij gespeeld is.
        </Muted>
      </Card>

      <Card>
        <SectionTitle>Over deze app</SectionTitle>
        <Muted>
          Een offline scorekaart voor Canasta. De regels komen uit de onderstaande bronnen; waar een
          bron zwijgt, zegt de app dat erbij in plaats van iets aan te nemen.
        </Muted>
        <ul className="mt-2 space-y-1 text-sm">
          {BUILTIN_SOURCES.map((source) => (
            <li key={`${source.name}-${source.title ?? ''}`}>
              {source.url ? (
                <a href={source.url} className="underline" target="_blank" rel="noreferrer">
                  {source.name}
                  {source.title ? ` — ${source.title}` : ''}
                </a>
              ) : (
                source.name
              )}
              {source.retrievedAt ? (
                <span className="text-[--color-ink-muted]"> (opgehaald {source.retrievedAt})</span>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <SectionTitle>Alle partijen verwijderen</SectionTitle>
        <Muted>
          Dit verwijdert elke partij op dit apparaat. Dit kan niet ongedaan worden gemaakt.
        </Muted>
        {confirmClear ? (
          <div className="mt-2 flex gap-2">
            <Button
              variant="danger"
              onClick={() => {
                void clearAll.run(undefined);
                setConfirmClear(false);
              }}
            >
              Ja, alles verwijderen
            </Button>
            <Button onClick={() => setConfirmClear(false)}>Annuleren</Button>
          </div>
        ) : (
          <Button className="mt-2" variant="danger" onClick={() => setConfirmClear(true)}>
            Alle partijen verwijderen
          </Button>
        )}
      </Card>
    </div>
  );
}
