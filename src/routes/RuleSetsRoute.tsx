import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { CustomRuleSetRecord } from '@/rules/schema/ruleSet';
import type { RuleSetChoice } from '@/application/services/ruleSetService';
import { useServices } from '@/app/servicesContext';
import { useCommand } from '@/hooks/useCommand';
import { usePresets, useRuleSetChoices } from '@/hooks/useGameData';
import { AppBar } from '@/ui/app/AppBar';
import { PageBody } from '@/ui/app/Page';
import { Plus, Trash } from '@/ui/common/icons';
import { ConfirmDialog } from '@/ui/common/ConfirmDialog';
import { Sheet } from '@/ui/common/Sheet';
import {
  Badge,
  Block,
  Button,
  ErrorPanel,
  LoadingState,
  Muted,
  SectionLabel,
} from '@/ui/common/primitives';

/**
 * Rule set management.
 *
 * The built-ins are listed but never edited: they live in code and have no row
 * to write to, so "copy first" is the only way in. Everything below the fold is
 * a `CustomRuleSetRecord` — the same storage the app has always had for
 * presets, now with a screen in front of it.
 */

const TEXT_INPUT =
  'mt-1.5 min-h-12 w-full rounded-tile border-[1.5px] border-border bg-surface px-3.5 text-base ' +
  'transition-colors outline-none focus:border-accent focus:bg-panel';

function RuleSetRow({
  name,
  summaryLine,
  badge,
  actions,
}: {
  name: string;
  summaryLine: string;
  badge: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    // The actions drop under the name while the row is narrow and move beside
    // it once there is room for both. A container query, because that depends
    // on how wide this list is, not on how wide the window is.
    <div className="@container border-t border-border first:border-t-0">
      <div className="flex flex-col gap-2.5 px-4 py-3.5 @[32rem]:flex-row @[32rem]:items-center @[32rem]:justify-between @[32rem]:gap-5 @[32rem]:px-5.5">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-body font-semibold">
            {name}
            {badge}
          </p>
          <p className="mt-0.5 text-caption text-muted">{summaryLine}</p>
        </div>
        <div className="flex flex-wrap gap-2 @[32rem]:shrink-0 @[32rem]:justify-end">{actions}</div>
      </div>
    </div>
  );
}

export function RuleSetsRoute() {
  const navigate = useNavigate();
  const services = useServices();
  const choices = useRuleSetChoices();
  const presets = usePresets();

  const [copyFrom, setCopyFrom] = useState<RuleSetChoice | undefined>();
  const [copyName, setCopyName] = useState('');
  const [toDelete, setToDelete] = useState<CustomRuleSetRecord | undefined>();

  const createPreset = useCommand(services.ruleSets.createPreset);
  const removePreset = useCommand(async (id: string) => services.ruleSets.removePreset(id));

  const builtins = choices.status === 'ready' ? choices.data.filter((item) => item.locked) : [];
  const custom = presets.status === 'ready' ? presets.data : [];
  const byId = new Map(
    choices.status === 'ready' ? choices.data.map((item) => [item.id, item]) : [],
  );

  function openCopy(source: RuleSetChoice, suggestedName: string) {
    setCopyFrom(source);
    setCopyName(suggestedName);
    createPreset.reset();
  }

  async function confirmCopy() {
    if (!copyFrom) return;
    const outcome = await createPreset.run({
      sourceId: copyFrom.id,
      sourceOrigin: copyFrom.origin,
      name: copyName,
    });
    if (outcome?.ok) {
      setCopyFrom(undefined);
      navigate(`/rulesets/${outcome.preset.id}`);
    }
  }

  return (
    <PageBody>
      <div className="flex flex-1 flex-col pb-6">
      <AppBar title="Regelsets" back="/settings" />

      <div className="flex flex-col gap-4.5 pt-2">
        <Muted>
          Een ingebouwde regelset verandert nooit. Maak er een kopie van om eigen huisregels,
          spelers en teams vast te leggen en die later opnieuw te gebruiken.
        </Muted>

        {choices.status === 'loading' ? <LoadingState label="Regelsets laden…" /> : null}

        <section className="flex flex-col gap-2">
          <SectionLabel className="px-1">Ingebouwd</SectionLabel>
          <Block className="overflow-hidden">
            {builtins.map((item) => (
              <RuleSetRow
                key={item.id}
                name={item.name}
                summaryLine={item.summaryLine}
                badge={<Badge tone="neutral">Ingebouwd</Badge>}
                actions={
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => navigate(`/new?ruleSet=${item.id}&origin=builtin`)}
                    >
                      Gebruiken
                    </Button>
                    <Button size="sm" onClick={() => openCopy(item, `Mijn ${item.name}`)}>
                      Kopie maken
                    </Button>
                  </>
                }
              />
            ))}
          </Block>
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel className="px-1">Mijn regelsets</SectionLabel>

          {custom.length === 0 ? (
            <Block className="px-4 py-5 text-center">
              <p className="text-body font-medium">Nog geen eigen regelsets</p>
              <Muted className="mt-1">
                Kopieer hierboven een ingebouwde regelset om te beginnen.
              </Muted>
            </Block>
          ) : (
            <Block className="overflow-hidden">
              {custom.map((record) => (
                <RuleSetRow
                  key={record.id}
                  name={record.name}
                  summaryLine={
                    byId.get(record.id)?.summaryLine ??
                    `Gebaseerd op ${record.derivedFrom.snapshot.name}`
                  }
                  badge={
                    <>
                      <Badge tone="accent">Aangepast</Badge>
                      {record.overrides.length > 0 ? (
                        <Badge tone="neutral">
                          {record.overrides.length === 1
                            ? '1 huisregel'
                            : `${record.overrides.length} huisregels`}
                        </Badge>
                      ) : null}
                    </>
                  }
                  actions={
                    <>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => navigate(`/new?ruleSet=${record.id}&origin=custom`)}
                      >
                        Gebruiken
                      </Button>
                      <Button size="sm" onClick={() => navigate(`/rulesets/${record.id}`)}>
                        Bewerken
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          openCopy(
                            {
                              id: record.id,
                              origin: 'custom',
                              name: record.name,
                              description: record.description,
                              summaryLine: '',
                              locked: false,
                              overrideCount: record.overrides.length,
                            },
                            `${record.name} (kopie)`,
                          )
                        }
                      >
                        Dupliceren
                      </Button>
                      <Button variant="dangerSoft" size="sm" onClick={() => setToDelete(record)}>
                        Verwijderen
                      </Button>
                    </>
                  }
                />
              ))}
            </Block>
          )}
        </section>
      </div>

      <Sheet
        open={copyFrom !== undefined}
        onClose={() => setCopyFrom(undefined)}
        title="Kopie maken"
        description={
          copyFrom
            ? `Een eigen regelset op basis van ${copyFrom.name}. Het origineel blijft ongewijzigd.`
            : undefined
        }
      >
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label htmlFor="regelset-naam" className="text-body font-medium">
              Naam
            </label>
            <input
              id="regelset-naam"
              type="text"
              className={TEXT_INPUT}
              value={copyName}
              onChange={(event) => setCopyName(event.target.value)}
            />
          </div>

          {createPreset.result && !createPreset.result.ok ? (
            <ErrorPanel title="De kopie kon niet worden gemaakt.">
              {createPreset.result.reason === 'validation' ? (
                <ul className="list-disc pl-5">
                  {createPreset.result.issues.map((issue) => (
                    <li key={issue.code}>{issue.message}</li>
                  ))}
                </ul>
              ) : (
                <p>Deze regelset bestaat niet meer.</p>
              )}
            </ErrorPanel>
          ) : null}

          <Button
            variant="primary"
            size="lg"
            block
            disabled={createPreset.state === 'running'}
            onClick={() => void confirmCopy()}
          >
            <Plus />
            Kopie maken
          </Button>
          <Button variant="ghost" size="lg" block onClick={() => setCopyFrom(undefined)}>
            Annuleren
          </Button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={toDelete !== undefined}
        title={toDelete ? `${toDelete.name} verwijderen?` : 'Regelset verwijderen?'}
        description="Partijen die met deze regelset zijn gespeeld blijven ongewijzigd: die bewaren hun eigen bevroren kopie."
        confirmLabel="Verwijderen"
        tone="danger"
        icon={
          <span className="flex size-13 items-center justify-center rounded-btn bg-neg-soft text-heart">
            <Trash />
          </span>
        }
        onConfirm={() => {
          if (toDelete) void removePreset.run(toDelete.id);
          setToDelete(undefined);
        }}
        onCancel={() => setToDelete(undefined)}
      />
      </div>
    </PageBody>
  );
}
