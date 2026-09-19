import { useEffect, useState } from 'react';
import type { ThemePreference } from '@/application/ports';
import { useServices } from '@/app/servicesContext';
import { useGameList } from '@/hooks/useGameData';
import { useCommand } from '@/hooks/useCommand';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { applyTheme } from '@/app/theme';
import { BUILTIN_SOURCES } from '@/application/viewmodels/sources';
import { AppBar } from '@/ui/app/AppBar';
import { PageBody } from '@/ui/app/Page';
import { ExternalLink, Trash } from '@/ui/common/icons';
import { ConfirmDialog } from '@/ui/common/ConfirmDialog';
import {
  Block,
  Button,
  LinkButton,
  Muted,
  Row,
  SectionLabel,
  SegmentedControl,
} from '@/ui/common/primitives';
import { ImportGameSection } from '@/ui/settings/ImportGameSection';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Systeem' },
  { value: 'light', label: 'Licht' },
  { value: 'dark', label: 'Donker' },
];

/**
 * A settings group: a small caps label above one bordered block of rows.
 *
 * The `break-inside-avoid` is what lets the page flow into two columns on a
 * wide screen without a group ever being cut in half by the column break.
 */
const GROUP = 'flex flex-col gap-2 lg:mb-5 lg:break-inside-avoid';

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={GROUP}>
      <SectionLabel className="px-1">{title}</SectionLabel>
      <Block className="overflow-hidden">{children}</Block>
    </section>
  );
}

function RowText({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-body font-medium">{label}</p>
      {sub ? <p className="mt-0.5 text-caption leading-snug text-muted text-pretty">{sub}</p> : null}
    </div>
  );
}

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

  const gameCount = games.status === 'ready' ? games.data.length : undefined;
  const countText =
    gameCount === undefined ? 'Partijen tellen…' : gameCount === 1 ? '1 partij' : `${gameCount} partijen`;

  return (
    <PageBody>
      <div className="flex flex-1 flex-col pb-6">
      <AppBar title="Instellingen" back="/" />

      {/*
       * Settings is a stack of short, independent groups. In an 880px reading
       * column a single stack leaves most of the width unused, so from `lg` the
       * groups flow into two columns — CSS columns rather than a grid, because
       * the groups differ in height and a grid would leave a hole under every
       * short one. Nothing about the order or the markup changes.
       */}
      <div className="flex flex-col gap-4.5 pt-2 lg:block lg:columns-2 lg:gap-x-5">
        <Group title="Weergave">
          <div className="flex flex-col gap-2.5 px-4 py-3.5">
            <p className="text-body font-medium">Thema</p>
            <SegmentedControl
              name="thema"
              label="Kleurthema"
              value={theme}
              options={THEME_OPTIONS}
              onChange={(next) => void chooseTheme(next)}
            />
          </div>
        </Group>

        <Group title="Spel">
          <Row>
            <RowText
              label="Regelsets"
              sub="Kopieer een ingebouwde regelset en leg je eigen spelers, teams en huisregels vast."
            />
            <LinkButton to="/rulesets" size="sm">
              Beheren
            </LinkButton>
          </Row>
        </Group>

        <Group title="Opslag">
          <Row>
            <RowText
              label="Partijen op dit apparaat"
              sub="Geen account, geen server, geen synchronisatie."
            />
            <span className="shrink-0 text-sm text-muted">{countText}</span>
          </Row>

          <Row>
            <RowText
              label="Permanente opslag"
              sub="Voorkomt dat de browser deze gegevens opruimt."
            />
            {persisted ? (
              <span className="shrink-0 text-sm text-muted">Toegekend</span>
            ) : (
              <Button
                size="sm"
                onClick={() => void services.settings.requestPersistentStorage().then(setPersisted)}
              >
                Aanvragen
              </Button>
            )}
          </Row>

          <Row>
            <RowText
              label="Alle partijen verwijderen"
              sub="Kan niet ongedaan worden gemaakt."
            />
            <Button variant="dangerSoft" size="sm" onClick={() => setConfirmClear(true)}>
              Verwijderen
            </Button>
          </Row>
        </Group>

        <div className={GROUP}>
          <ImportGameSection />
        </div>

        <Group title="App">
          {install.canInstall ? (
            <Row>
              <RowText label="App installeren" sub="Zet Canasta op je beginscherm." />
              <Button variant="primary" size="sm" onClick={() => void install.promptInstall()}>
                Installeren
              </Button>
            </Row>
          ) : null}

          {install.iosHint ? (
            <Row>
              <RowText
                label="App installeren"
                sub={'Op iPhone en iPad: tik op de deelknop en kies "Zet op beginscherm".'}
              />
            </Row>
          ) : null}

          <Row>
            <RowText
              label="Een partij exporteren"
              sub={'Open de partij en kies "Meer acties" op het scorebord. Je krijgt één JSON-bestand, inclusief de regelset waarmee hij gespeeld is.'}
            />
          </Row>

          <Row>
            <RowText
              label="Over deze app"
              sub="Een offline scorekaart voor Canasta. Waar een bron zwijgt, zegt de app dat erbij in plaats van iets aan te nemen."
            />
          </Row>
        </Group>

        <Group title="Bronnen">
          {BUILTIN_SOURCES.map((source) => (
            <Row key={`${source.name}-${source.title ?? ''}`}>
              <RowText
                label={source.name}
                sub={[source.title, source.retrievedAt ? `opgehaald ${source.retrievedAt}` : undefined]
                  .filter(Boolean)
                  .join(' · ')}
              />
              {source.url ? (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${source.name} openen in een nieuw tabblad`}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-tile text-muted transition-colors hover:bg-panel2 hover:text-ink"
                >
                  <ExternalLink size={18} />
                </a>
              ) : null}
            </Row>
          ))}
        </Group>

      </div>

      <Muted className="pt-4.5 text-center text-xs">
        Canasta Puntentelling · versie 0.1.0 · werkt offline
      </Muted>

      <ConfirmDialog
        open={confirmClear}
        title={
          gameCount === undefined
            ? 'Alle partijen verwijderen?'
            : `Alle ${gameCount} ${gameCount === 1 ? 'partij' : 'partijen'} verwijderen?`
        }
        description={
          <>
            Alle partijen, rondes en concepten op <b className="text-ink">dit apparaat</b> worden
            gewist. Er is geen back-up en geen synchronisatie — dit kan niet ongedaan worden
            gemaakt.
          </>
        }
        confirmLabel="Ja, alles verwijderen"
        tone="danger"
        icon={
          <span className="flex size-13 items-center justify-center rounded-btn bg-neg-soft text-heart">
            <Trash />
          </span>
        }
        busy={clearAll.state === 'running'}
        onConfirm={() => {
          void clearAll.run(undefined);
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />
      </div>
    </PageBody>
  );
}
