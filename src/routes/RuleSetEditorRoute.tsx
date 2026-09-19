import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { Json } from '@/domain/ids';
import type { ConfigOverride, CustomRuleSetRecord } from '@/rules/schema/ruleSet';
import type { RuleSetDescription } from '@/application/viewmodels/rulesView';
import {
  partyOverrides,
  partyShapeOf,
  teamLayoutsFor,
  teamSizeFor,
  type PartyShape,
} from '@/application/viewmodels/setup';
import { useServices } from '@/app/servicesContext';
import { useCommand } from '@/hooks/useCommand';
import { usePresetEditor } from '@/hooks/useGameData';
import { AppBar } from '@/ui/app/AppBar';
import { PageBody } from '@/ui/app/Page';
import { Check, Minus, Plus } from '@/ui/common/icons';
import { SettingsEditor } from '@/ui/rules/SettingsEditor';
import {
  Block,
  Button,
  EmptyState,
  ErrorPanel,
  LinkButton,
  LoadingState,
  Muted,
  SectionLabel,
  StickyActions,
} from '@/ui/common/primitives';

/**
 * Edits one custom rule set.
 *
 * Everything the user changes becomes a `ConfigOverride` on the stored record,
 * and saving runs the same `buildEffectiveRuleSet` pipeline a game start runs.
 * A preset therefore cannot be saved in a state that would fail later at the
 * card table, and the built-in it was copied from is never touched.
 */

/** The interface's own ceiling. The engine has none; this keeps the UI sane. */
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;

function PartyShapeField({
  shape,
  onChange,
}: {
  shape: PartyShape;
  onChange: (next: PartyShape) => void;
}) {
  const layouts = teamLayoutsFor(shape.playerCount);

  function resize(playerCount: number) {
    if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) return;
    const options = teamLayoutsFor(playerCount);
    const keep = options.find((layout) => layout.teamCount === shape.teamCount);
    const next = keep ?? options[0];
    if (next) onChange(next);
  }

  const stepper =
    'inline-flex size-11 shrink-0 items-center justify-center rounded-tile transition-colors ' +
    'enabled:bg-panel enabled:shadow-soft disabled:text-border';

  return (
    <Block className="px-4 py-1.5">
      <SectionLabel className="block pb-1 pt-2.5">Spelers en teams</SectionLabel>

      <div className="flex min-h-touch items-center justify-between gap-3 border-t border-border py-3">
        <label htmlFor="preset-spelers" className="text-body font-medium">
          Aantal spelers
        </label>
        <div className="flex shrink-0 items-center gap-0.5 rounded-control bg-panel2 p-0.75">
          <button
            type="button"
            className={stepper}
            disabled={shape.playerCount <= MIN_PLAYERS}
            aria-label="Eén speler minder"
            onClick={() => resize(shape.playerCount - 1)}
          >
            <Minus size={18} />
          </button>
          <output
            id="preset-spelers"
            className="w-9 text-center font-display text-[1.375rem] font-semibold tabular"
          >
            {shape.playerCount}
          </output>
          <button
            type="button"
            className={stepper}
            disabled={shape.playerCount >= MAX_PLAYERS}
            aria-label="Eén speler meer"
            onClick={() => resize(shape.playerCount + 1)}
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      <div className="border-t border-border py-3">
        <p className="text-body font-medium">Indeling</p>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Teamindeling">
          {layouts.map((layout) => {
            const selected = layout.teamCount === shape.teamCount;
            return (
              <button
                key={layout.teamCount}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange(layout)}
                className={`flex min-h-touch items-center rounded-full border px-3.5 text-note transition-colors ${
                  selected
                    ? 'border-accent bg-accent-soft font-semibold text-accent'
                    : 'border-border bg-panel font-medium text-ink'
                }`}
              >
                {layout.mode === 'individual'
                  ? 'Ieder voor zich'
                  : `${layout.teamCount} teams van ${teamSizeFor(layout)}`}
              </button>
            );
          })}
        </div>
      </div>
    </Block>
  );
}

export function RuleSetEditorRoute() {
  const { presetId } = useParams();
  const navigate = useNavigate();
  const services = useServices();
  const loaded = usePresetEditor(presetId);

  const [name, setName] = useState('');
  const [values, setValues] = useState<Record<string, Json>>({});

  /**
   * The editor works on the rule set as it was when the screen opened.
   *
   * Kept in state rather than read straight off the live query, because the
   * query re-fires — and passes back through `loading` — whenever anything in
   * the database changes. Rendering from it directly would tear the form down
   * mid-edit and put the stored values back over whatever had been typed.
   */
  const [editing, setEditing] = useState<
    { record: CustomRuleSetRecord; base: RuleSetDescription } | undefined
  >();

  useEffect(() => {
    if (loaded.status !== 'ready' || editing) return;
    setEditing(loaded.data);
    setName(loaded.data.record.name);
    setValues(
      Object.fromEntries(loaded.data.record.overrides.map((entry) => [entry.path, entry.value])),
    );
  }, [loaded, editing]);

  const save = useCommand(services.ruleSets.updatePreset);

  const shape: PartyShape | undefined = useMemo(() => {
    if (!editing) return undefined;
    const declared = partyShapeOf(editing.record.derivedFrom.snapshot);
    return {
      playerCount: (values['players.default'] as number | undefined) ?? declared.playerCount,
      teamCount: (values['teams.count'] as number | undefined) ?? declared.teamCount,
      mode: (values['teams.mode'] as PartyShape['mode'] | undefined) ?? declared.mode,
    };
  }, [editing, values]);

  if (!editing || !shape) {
    if (loaded.status === 'loading') return <LoadingState label="Regelset laden…" />;
    return (
      <PageBody>
        <div className="flex flex-1 flex-col">
        <AppBar title="Regelset" back="/rulesets" />
        <EmptyState
          title="Deze regelset bestaat niet meer."
          action={
            <LinkButton to="/rulesets" variant="primary" size="lg" block>
              Naar de regelsets
            </LinkButton>
          }
        />
        </div>
      </PageBody>
    );
  }

  const { record, base } = editing;
  const editable = base.sections.filter((section) => section.values.length > 0);
  const changed = new Set(Object.keys(values));
  const currentShape = shape;

  function overrides(): ConfigOverride[] {
    const party = partyOverrides(currentShape);
    const partyPaths = new Set(party.map((entry) => entry.path));
    const rest = Object.entries(values)
      .filter(([path]) => !partyPaths.has(path))
      .map(([path, value]) => ({ path, value }) as ConfigOverride);
    return [...party, ...rest];
  }

  async function handleSave() {
    if (!presetId) return;
    const outcome = await save.run({ id: presetId, name, overrides: overrides() });
    if (outcome?.ok) navigate('/rulesets');
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageBody>
      <div className="flex flex-1 flex-col">
      <AppBar title="Regelset bewerken" subtitle={record.name} back="/rulesets" />

      <div className="flex flex-1 flex-col gap-3 pt-1">
        <Muted>
          Gebaseerd op {record.derivedFrom.snapshot.name}. Die regelset blijft ongewijzigd, en ook
          partijen die al gespeeld zijn veranderen niet.
        </Muted>

        <Block className="px-4 py-3.5">
          <label htmlFor="preset-naam" className="text-body font-medium">
            Naam
          </label>
          <input
            id="preset-naam"
            type="text"
            className="mt-1.5 min-h-12 w-full rounded-tile border-[1.5px] border-border bg-surface px-3.5 text-base outline-none transition-colors focus:border-accent focus:bg-panel"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Block>

        <PartyShapeField
          shape={shape}
          onChange={(next) =>
            setValues((current) => ({
              ...current,
              'players.default': next.playerCount,
              'teams.count': next.teamCount,
              'teams.mode': next.mode,
              'teams.teamSize': teamSizeFor(next),
            }))
          }
        />

        <SettingsEditor
          sections={editable}
          values={values}
          changedPaths={changed}
          onChange={(path, value) => setValues((current) => ({ ...current, [path]: value }))}
        />

        {save.result && !save.result.ok ? (
          <ErrorPanel title="De regelset kon niet worden opgeslagen.">
            {save.result.reason === 'validation' ? (
              <ul className="list-disc pl-5">
                {save.result.issues.map((issue) => (
                  <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>
                ))}
              </ul>
            ) : (
              <p>Deze regelset bestaat niet meer.</p>
            )}
          </ErrorPanel>
        ) : null}
      </div>
      </div>
      </PageBody>

      <StickyActions>
        <Button variant="ghost" size="md" onClick={() => navigate('/rulesets')}>
          Annuleren
        </Button>
        <Button
          variant="primary"
          size="lg"
          block
          className="md:w-auto md:px-7"
          disabled={save.state === 'running'}
          onClick={() => void handleSave()}
        >
          <Check size={18} />
          Opslaan
        </Button>
      </StickyActions>
    </div>
  );
}
