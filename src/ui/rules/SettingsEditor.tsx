import type { Json } from '@/domain/ids';
import type { RuleSectionVM, RuleValueVM } from '@/application/viewmodels/rulesView';
import { Badge, Block, Note, Score, SectionLabel, Switch } from '@/ui/common/primitives';

/**
 * Edits a rule set's settings, generated entirely from its own metadata.
 *
 * Which settings exist, what they are called, what they may be set to and
 * whether they may be set at all all come from `SettingDefinition`. Nothing
 * here knows what a Canasta is; adding a setting to a rule set makes it appear
 * with no change to this file.
 *
 * Two setting types — the red-three table and the initial-meld staircase — are
 * shown read-only. They are arrays whose meaning depends on their position, and
 * a half-built editor for them would be worse than none: the values stay
 * exactly as the rule set defines them and the screen says so.
 */

const UNSUPPORTED: RuleValueVM['type'][] = ['numberTable', 'thresholds'];

export interface SettingsEditorProps {
  sections: RuleSectionVM[];
  /** Pending values by configuration path; absent means "as the rule set has it". */
  values: Record<string, Json>;
  onChange: (path: string, value: Json) => void;
  /** Shown when a value differs from the base rule set. */
  changedPaths?: ReadonlySet<string>;
}

function numberOf(value: Json | undefined, fallback: Json): number {
  const candidate = value ?? fallback;
  return typeof candidate === 'number' ? candidate : 0;
}

function Control({
  value,
  current,
  onChange,
}: {
  value: RuleValueVM;
  current: Json | undefined;
  onChange: (next: Json) => void;
}) {
  const id = `regel-${value.key}`;

  if (!value.editable || UNSUPPORTED.includes(value.type)) {
    return (
      <Score tight={false} className="shrink-0 text-lg text-muted">
        {value.valueText}
      </Score>
    );
  }

  if (value.type === 'boolean') {
    return (
      <Switch
        id={id}
        checked={(current ?? value.value) === true}
        onChange={(checked) => onChange(checked)}
      />
    );
  }

  if (value.type === 'select' && value.options) {
    return (
      <select
        id={id}
        value={String(current ?? value.value ?? '')}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-touch shrink-0 rounded-control border border-border bg-panel2 px-3 text-body font-medium"
      >
        {value.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (value.type === 'text') {
    return (
      <input
        id={id}
        type="text"
        value={String(current ?? value.value ?? '')}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 w-40 shrink-0 rounded-control border border-border bg-panel2 px-3 text-body outline-none focus:border-accent focus:bg-panel"
      />
    );
  }

  return (
    <div className="flex min-h-12 w-24 shrink-0 items-center rounded-control border border-border bg-panel2 px-3.5 transition-colors focus-within:border-accent focus-within:bg-panel">
      <input
        id={id}
        type="number"
        inputMode="numeric"
        className="w-full min-w-0 bg-transparent text-right font-display text-xl font-semibold tabular outline-none"
        value={numberOf(current, value.value)}
        min={value.min}
        max={value.max}
        step={value.step ?? 1}
        onChange={(event) =>
          onChange(Number.isNaN(event.target.valueAsNumber) ? 0 : event.target.valueAsNumber)
        }
      />
    </div>
  );
}

export function SettingsEditor({ sections, values, onChange, changedPaths }: SettingsEditorProps) {
  if (sections.length === 0) {
    return <Note lead="Info">Deze regelset heeft geen instelbare regels.</Note>;
  }

  return (
    <div className="flex flex-col gap-3">
      {sections.map((section) => (
        <Block key={section.category} className="px-4 py-1.5 lg:rounded-[1.375rem] lg:px-6.5">
          <SectionLabel className="block pb-1 pt-2.5">{section.title}</SectionLabel>

          {section.values.map((value) => {
            const readOnly = !value.editable || UNSUPPORTED.includes(value.type);
            return (
              <div key={value.key} className="border-t border-border py-3">
                <div className="flex min-h-touch items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor={`regel-${value.key}`}
                      className="flex flex-wrap items-center gap-1.5 text-body font-medium"
                    >
                      {value.label}
                      {changedPaths?.has(value.key) ? <Badge tone="accent">Gewijzigd</Badge> : null}
                    </label>
                    {value.help ? (
                      <p className="mt-0.5 max-w-[32.5rem] text-caption leading-snug text-muted text-pretty">
                        {value.help}
                      </p>
                    ) : null}
                  </div>
                  <Control
                    value={value}
                    current={values[value.key]}
                    onChange={(next) => onChange(value.key, next)}
                  />
                </div>

                {readOnly ? (
                  <p className="mt-1.5 text-meta text-muted">
                    {value.editable
                      ? 'Deze tabel is hier niet bewerkbaar en blijft zoals de regelset hem vastlegt.'
                      : 'Deze regel ligt vast in deze regelset.'}
                  </p>
                ) : null}

                {value.rows ? (
                  <ul className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(3.5rem,4.5rem))] gap-1.5">
                    {value.rows.map((row) => (
                      <li key={row.label} className="rounded-tile bg-panel2 px-1.5 py-2 text-center">
                        <Score tight={false} className="block text-note">
                          {row.valueText}
                        </Score>
                        <span className="block text-micro text-muted">{row.label}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </Block>
      ))}
    </div>
  );
}
