import type { ScoreInputValue } from '@/rules/schema/field';
import type { FieldVM } from '@/application/viewmodels/roundForm';
import type { IssueVM } from '@/application/viewmodels/issues';

/**
 * One renderer per field type.
 *
 * A renderer knows how a `count` field looks and behaves. It does not know what
 * the field means — that is the rule set's business.
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
}

export type FieldRenderer = (props: FieldControlProps) => React.ReactElement;

function describedBy(props: FieldControlProps): string | undefined {
  const ids: string[] = [];
  if (props.field.hint) ids.push(`${props.idPrefix}-hint`);
  if (props.issues.length > 0) ids.push(`${props.idPrefix}-issues`);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

function FieldFrame({
  props,
  children,
  as = 'label',
}: {
  props: FieldControlProps;
  children: React.ReactNode;
  as?: 'label' | 'group';
}) {
  const { field, idPrefix, issues } = props;
  const heading =
    as === 'label' ? (
      <label htmlFor={idPrefix} className="text-sm font-medium">
        {field.label}
      </label>
    ) : (
      <legend className="text-sm font-medium">{field.label}</legend>
    );

  const body = (
    <>
      {heading}
      {field.hint ? (
        <p id={`${idPrefix}-hint`} className="text-xs text-[--color-ink-muted]">
          {field.hint}
        </p>
      ) : null}
      {children}
      {issues.length > 0 ? (
        <ul id={`${idPrefix}-issues`} className="space-y-1 text-xs">
          {issues.map((issue) => (
            <li
              key={issue.code}
              className={
                issue.channel === 'error' ? 'text-[--color-negative]' : 'text-[--color-warning]'
              }
            >
              <span className="font-semibold">{issue.channelLabel}:</span> {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );

  return as === 'label' ? (
    <div className="flex flex-col gap-1">{body}</div>
  ) : (
    <fieldset className="flex flex-col gap-1 border-0 p-0">{body}</fieldset>
  );
}

const NUMBER_INPUT =
  'min-h-[var(--spacing-touch)] w-full rounded-xl border border-[--color-border] ' +
  'bg-[--color-panel] px-3 text-right text-lg tabular';

export function PointsField(props: FieldControlProps) {
  const { field, value, onChange, idPrefix, disabled } = props;
  return (
    <FieldFrame props={props}>
      <input
        id={idPrefix}
        type="number"
        inputMode="numeric"
        className={NUMBER_INPUT}
        value={typeof value === 'number' ? value : 0}
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        disabled={disabled}
        aria-describedby={describedBy(props)}
        aria-invalid={props.issues.some((issue) => issue.channel === 'error') || undefined}
        onChange={(event) => onChange(event.target.valueAsNumber)}
      />
    </FieldFrame>
  );
}

export function CountField(props: FieldControlProps) {
  const { field, value, onChange, idPrefix, disabled } = props;
  const current = typeof value === 'number' ? value : 0;
  const step = field.step ?? 1;

  const nudge = (delta: number) => {
    let next = current + delta;
    if (field.min !== undefined) next = Math.max(next, field.min);
    if (field.max !== undefined) next = Math.min(next, field.max);
    onChange(next);
  };

  const stepper =
    'h-[var(--spacing-touch-lg)] w-[var(--spacing-touch-lg)] shrink-0 rounded-xl border ' +
    'border-[--color-border] bg-[--color-panel] text-2xl leading-none disabled:opacity-40';

  return (
    <FieldFrame props={props}>
      <div className="flex items-center gap-2" style={{ touchAction: 'manipulation' }}>
        <button
          type="button"
          className={stepper}
          onClick={() => nudge(-step)}
          disabled={disabled || (field.min !== undefined && current <= field.min)}
          aria-label={`${field.label}: één minder`}
        >
          −
        </button>
        <input
          id={idPrefix}
          type="number"
          inputMode="numeric"
          className={`${NUMBER_INPUT} text-center`}
          value={current}
          min={field.min}
          max={field.max}
          step={step}
          disabled={disabled}
          aria-describedby={describedBy(props)}
          onChange={(event) => onChange(event.target.valueAsNumber)}
        />
        <button
          type="button"
          className={stepper}
          onClick={() => nudge(step)}
          disabled={disabled || (field.max !== undefined && current >= field.max)}
          aria-label={`${field.label}: één meer`}
        >
          +
        </button>
      </div>
    </FieldFrame>
  );
}

export function BooleanField(props: FieldControlProps) {
  const { value, onChange, idPrefix, disabled } = props;
  return (
    <FieldFrame props={props}>
      <input
        id={idPrefix}
        type="checkbox"
        role="switch"
        className="h-6 w-11 shrink-0 accent-[--color-accent]"
        checked={value === true}
        disabled={disabled}
        aria-describedby={describedBy(props)}
        onChange={(event) => onChange(event.target.checked)}
      />
    </FieldFrame>
  );
}

export function ChoiceField(props: FieldControlProps) {
  const { field, value, onChange, idPrefix, disabled } = props;
  return (
    <FieldFrame props={props} as="group">
      <div className="flex flex-wrap gap-2">
        {field.options.map((option) => (
          <label
            key={option.value}
            className="inline-flex min-h-[var(--spacing-touch)] items-center gap-2 rounded-xl border border-[--color-border] px-3"
          >
            <input
              type="radio"
              name={idPrefix}
              value={option.value}
              checked={value === option.value}
              disabled={disabled}
              onChange={() => onChange(option.value)}
            />
            <span className="text-sm">{option.label}</span>
          </label>
        ))}
      </div>
    </FieldFrame>
  );
}

export function MultiSelectField(props: FieldControlProps) {
  const { field, value, onChange, idPrefix, disabled } = props;
  const selected = Array.isArray(value) ? value : [];

  return (
    <FieldFrame props={props} as="group">
      <div className="flex flex-col gap-1">
        {field.options.map((option) => (
          <label
            key={option.value}
            className="inline-flex min-h-[var(--spacing-touch)] items-center gap-2"
          >
            <input
              type="checkbox"
              name={idPrefix}
              value={option.value}
              checked={selected.includes(option.value)}
              disabled={disabled}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, option.value]
                    : selected.filter((item) => item !== option.value),
                )
              }
            />
            <span className="text-sm">{option.label}</span>
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
    <div className="flex flex-col gap-1">
      <p id={idPrefix} className="text-sm font-medium">
        {field.label}
      </p>
      <p role="note" className="rounded-xl bg-[--color-panel-muted] p-3 text-xs">
        Dit veldtype ({field.type}) wordt door deze versie van de app niet herkend. De ingevulde
        waarde blijft ongewijzigd bewaard.
      </p>
      <p className="text-sm tabular">{String(value)}</p>
    </div>
  );
}
