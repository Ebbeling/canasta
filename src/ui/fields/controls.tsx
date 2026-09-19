import { useState } from 'react';
import type { ScoreInputValue } from '@/rules/schema/field';
import type { FieldVM } from '@/application/viewmodels/roundForm';
import type { IssueVM } from '@/application/viewmodels/issues';
import { Keypad as KeypadIcon, Minus, Plus } from '@/ui/common/icons';
import { Note, Switch } from '@/ui/common/primitives';
import { NumberPad } from './NumberPad';

/**
 * One renderer per field type.
 *
 * A renderer knows how a `count` field looks and behaves. It does not know what
 * the field means — that is the rule set's business. Which renderer runs is
 * decided by `field.type` alone, so a new field in a rule set needs no change
 * here and no variant check anywhere.
 */

export interface FieldControlProps {
  field: FieldVM;
  value: ScoreInputValue;
  onChange: (next: ScoreInputValue) => void;
  /** Already filtered to this field and this team. */
  issues: IssueVM[];
  /** Unique per team + field, so labels and descriptions link up. */
  idPrefix: string;
  disabled?: boolean;
  /** Shown above the keypad sheet, e.g. "♠ Team A · Kaarten". */
  context?: string;
}

export type FieldRenderer = (props: FieldControlProps) => React.ReactElement;

function describedBy(props: FieldControlProps): string | undefined {
  const ids: string[] = [];
  if (props.field.hint) ids.push(`${props.idPrefix}-hint`);
  if (props.issues.length > 0) ids.push(`${props.idPrefix}-issues`);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

function hasError(props: FieldControlProps): boolean {
  return props.issues.some((issue) => issue.channel === 'error');
}

function clamp(field: FieldVM, next: number): number {
  let value = next;
  if (field.min !== undefined) value = Math.max(value, field.min);
  if (field.max !== undefined) value = Math.min(value, field.max);
  return value;
}

/**
 * The shared row: label and hint on the left, the control on the right, and
 * anything the engine wants to say about the value underneath.
 */
function FieldFrame({
  props,
  children,
  as = 'label',
  stacked = false,
}: {
  props: FieldControlProps;
  children: React.ReactNode;
  as?: 'label' | 'group';
  stacked?: boolean;
}) {
  const { field, idPrefix, issues } = props;

  const heading =
    as === 'label' ? (
      <label htmlFor={idPrefix} className="text-body font-medium">
        {field.label}
      </label>
    ) : (
      <legend className="text-body font-medium">{field.label}</legend>
    );

  const body = (
    <>
      <div className={stacked ? '' : 'flex min-h-touch items-center justify-between gap-3'}>
        <div className="min-w-0 flex-1">
          {heading}
          {field.hint ? (
            <p id={`${idPrefix}-hint`} className="mt-0.5 text-caption leading-snug text-muted text-pretty">
              {field.hint}
            </p>
          ) : null}
        </div>
        {stacked ? null : children}
      </div>

      {stacked ? <div className="mt-2.5">{children}</div> : null}

      {issues.length > 0 ? (
        <ul id={`${idPrefix}-issues`} className="mt-2.5 space-y-1.5">
          {issues.map((issue) => (
            <li key={issue.code}>
              <Note lead={issue.channelLabel} tone={issue.channel === 'error' ? 'danger' : 'warn'}>
                {issue.message}
              </Note>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );

  return as === 'label' ? (
    <div className="border-t border-border py-3 first:border-t-0">{body}</div>
  ) : (
    <fieldset className="m-0 border-0 border-t border-border p-0 py-3 first:border-t-0">{body}</fieldset>
  );
}

/**
 * A points field: a tile you can type into, plus a keypad for thumbs.
 *
 * The `<input>` stays a real, labelled number input — that is what keyboard and
 * screen-reader users get, and what the browser's own numeric keyboard opens on
 * a phone. The keypad sheet is an addition beside it, never a replacement.
 */
export function PointsField(props: FieldControlProps) {
  const { field, value, onChange, idPrefix, disabled, context } = props;
  const [padOpen, setPadOpen] = useState(false);
  const current = typeof value === 'number' ? value : 0;

  return (
    <FieldFrame props={props}>
      <>
        <div
          className={`flex min-h-13 w-29 shrink-0 items-center rounded-control border bg-panel2 pl-3.5 transition-colors focus-within:border-accent focus-within:bg-panel ${
            hasError(props) ? 'border-heart' : 'border-border'
          }`}
        >
          <input
            id={idPrefix}
            type="number"
            inputMode="numeric"
            className="w-full min-w-0 bg-transparent text-right font-display text-2xl font-semibold tabular outline-none"
            value={current}
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            disabled={disabled}
            aria-describedby={describedBy(props)}
            aria-invalid={hasError(props) || undefined}
            onChange={(event) =>
              onChange(Number.isNaN(event.target.valueAsNumber) ? 0 : event.target.valueAsNumber)
            }
          />
          <button
            type="button"
            aria-label={`${field.label}: invoeren met toetsenblok`}
            disabled={disabled}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-tile text-muted transition-colors hover:text-ink disabled:opacity-50"
            onClick={() => setPadOpen(true)}
          >
            <KeypadIcon size={18} />
          </button>
        </div>

        <NumberPad
          open={padOpen}
          onClose={() => setPadOpen(false)}
          field={field}
          context={context}
          value={current}
          onCommit={(next) => onChange(clamp(field, next))}
        />
      </>
    </FieldFrame>
  );
}

/** A count field: a stepper, with the number itself still typeable. */
export function CountField(props: FieldControlProps) {
  const { field, value, onChange, idPrefix, disabled } = props;
  const current = typeof value === 'number' ? value : 0;
  const step = field.step ?? 1;

  const atMin = field.min !== undefined && current <= field.min;
  const atMax = field.max !== undefined && current >= field.max;

  const stepper =
    'inline-flex size-11.5 shrink-0 items-center justify-center rounded-tile transition-colors ' +
    'enabled:bg-panel enabled:shadow-soft disabled:text-border';

  return (
    <FieldFrame props={props}>
      <div
        className="flex shrink-0 items-center gap-0.5 rounded-control bg-panel2 p-0.75"
        style={{ touchAction: 'manipulation' }}
      >
        <button
          type="button"
          className={stepper}
          onClick={() => onChange(clamp(field, current - step))}
          disabled={disabled || atMin}
          aria-label={`${field.label}: één minder`}
        >
          <Minus size={18} />
        </button>
        <input
          id={idPrefix}
          type="number"
          inputMode="numeric"
          className="w-9 min-w-0 bg-transparent text-center font-display text-[1.375rem] font-semibold tabular outline-none"
          value={current}
          min={field.min}
          max={field.max}
          step={step}
          disabled={disabled}
          aria-describedby={describedBy(props)}
          aria-invalid={hasError(props) || undefined}
          onChange={(event) =>
            onChange(Number.isNaN(event.target.valueAsNumber) ? 0 : event.target.valueAsNumber)
          }
        />
        <button
          type="button"
          className={stepper}
          onClick={() => onChange(clamp(field, current + step))}
          disabled={disabled || atMax}
          aria-label={`${field.label}: één meer`}
        >
          <Plus size={18} />
        </button>
      </div>
    </FieldFrame>
  );
}

export function BooleanField(props: FieldControlProps) {
  const { value, onChange, idPrefix, disabled } = props;
  return (
    <FieldFrame props={props}>
      <Switch
        id={idPrefix}
        checked={value === true}
        disabled={disabled}
        describedBy={describedBy(props)}
        onChange={onChange}
      />
    </FieldFrame>
  );
}

export function ChoiceField(props: FieldControlProps) {
  const { field, value, onChange, idPrefix, disabled } = props;
  return (
    <FieldFrame props={props} as="group" stacked>
      <div className="flex flex-wrap gap-2">
        {field.options.map((option) => {
          const id = `${idPrefix}-${option.value}`;
          const selected = value === option.value;
          return (
            <span key={option.value} className="relative">
              <input
                id={id}
                type="radio"
                name={idPrefix}
                value={option.value}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(option.value)}
                className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none rounded-full disabled:cursor-not-allowed"
              />
              <label
                htmlFor={id}
                className={`flex min-h-touch items-center rounded-full border px-3.5 text-sm transition-colors ${
                  selected
                    ? 'border-accent bg-accent-soft font-semibold text-accent'
                    : 'border-border bg-panel font-medium text-ink'
                }`}
              >
                {option.label}
              </label>
            </span>
          );
        })}
      </div>
    </FieldFrame>
  );
}

export function MultiSelectField(props: FieldControlProps) {
  const { field, value, onChange, idPrefix, disabled } = props;
  const selected = Array.isArray(value) ? value : [];

  return (
    <FieldFrame props={props} as="group" stacked>
      <div className="flex flex-col">
        {field.options.map((option) => (
          <label
            key={option.value}
            className="flex min-h-touch items-center gap-3 border-t border-border py-1.5 first:border-t-0 text-sm"
          >
            <input
              type="checkbox"
              name={idPrefix}
              value={option.value}
              checked={selected.includes(option.value)}
              disabled={disabled}
              className="size-5 shrink-0 accent-accent"
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, option.value]
                    : selected.filter((item) => item !== option.value),
                )
              }
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </FieldFrame>
  );
}

/**
 * A field type this build does not know.
 *
 * Read-only on purpose: the stored value stays untouched in `extra`, so saving a
 * round never destroys data a newer or older version wrote.
 */
export function UnsupportedField(props: FieldControlProps) {
  const { field, value, idPrefix } = props;
  return (
    <div className="border-t border-border py-3 first:border-t-0">
      <p id={idPrefix} className="text-body font-medium">
        {field.label}
      </p>
      <div className="mt-2">
        <Note lead="Info" tone="info">
          Dit veldtype ({field.type}) wordt door deze versie van de app niet herkend. De ingevulde
          waarde blijft ongewijzigd bewaard.
        </Note>
      </div>
      <p className="mt-1.5 text-sm tabular">{String(value)}</p>
    </div>
  );
}
