import type { ButtonHTMLAttributes, ComponentPropsWithRef, ReactNode } from 'react';
import { Link } from 'react-router';

/**
 * Shared building blocks. None of them know anything about Canasta.
 *
 * Every visual value here is a theme token (`bg-panel`, `rounded-card`,
 * `min-h-touch`) rather than an arbitrary value, so light and dark mode are one
 * definition and a component never re-states a colour.
 */

/* ------------------------------------------------------------------ buttons */

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 font-semibold transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const VARIANTS = {
  /** The one main action on a screen. */
  primary: 'bg-accent text-accent-ink shadow-soft hover:opacity-90',
  secondary: 'border-[1.5px] border-border bg-panel text-ink hover:bg-panel2',
  /** A dark, high-contrast alternative used next to a primary action. */
  contrast: 'bg-ink text-surface hover:opacity-90',
  ghost: 'text-muted hover:bg-panel2 hover:text-ink',
  /** Destructive, filled — for the confirmed step of a delete. */
  danger: 'bg-heart text-heart-ink hover:opacity-90',
  /** Destructive, quiet — for the control that *opens* a confirmation. */
  dangerSoft: 'bg-neg-soft text-heart hover:opacity-90',
} as const;

const SIZES = {
  sm: 'min-h-10 rounded-tile px-3.5 text-sm',
  md: 'min-h-touch rounded-control px-4 text-body',
  lg: 'min-h-touch-lg rounded-btn px-5 text-base',
  xl: 'min-h-action rounded-block px-5 text-[1.0625rem]',
} as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

interface StyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretches the button to fill its row. */
  block?: boolean;
  className?: string;
}

function buttonClass({ variant = 'secondary', size = 'md', block, className = '' }: StyleProps) {
  return `${BUTTON_BASE} ${VARIANTS[variant]} ${SIZES[size]} ${block ? 'w-full' : ''} ${className}`;
}

export function Button({
  variant,
  size,
  block,
  className,
  ...rest
}: ComponentPropsWithRef<'button'> & StyleProps) {
  // `rest` carries `ref` through: in React 19 a function component receives it
  // as an ordinary prop, so a dialog can point initial focus at its own button.
  return <button type="button" className={buttonClass({ variant, size, block, className })} {...rest} />;
}

export function LinkButton({
  to,
  children,
  replace,
  ...style
}: StyleProps & { to: string; children: ReactNode; replace?: boolean }) {
  return (
    <Link to={to} replace={replace} className={buttonClass(style)}>
      {children}
    </Link>
  );
}

/** A 40px square tap target for header affordances. */
export function IconButton({
  label,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`inline-flex size-10 shrink-0 items-center justify-center rounded-tile text-muted transition-colors hover:bg-panel2 hover:text-ink ${className}`}
      {...rest}
    />
  );
}

export function IconLink({
  to,
  label,
  children,
  className = '',
}: {
  to: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      className={`inline-flex size-10 shrink-0 items-center justify-center rounded-tile text-muted transition-colors hover:bg-panel2 hover:text-ink ${className}`}
    >
      {children}
    </Link>
  );
}

/* ----------------------------------------------------------------- surfaces */

/** The most prominent surface: a card lifted off the page. */
export function Card({
  children,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article';
}) {
  return (
    <Tag className={`rounded-card border border-border bg-panel shadow-soft lg:rounded-sheet ${className}`}>
      {children}
    </Tag>
  );
}

/** A quieter grouping surface, without the lift. */
export function Block({
  children,
  className = '',
  as: Tag = 'div',
  id,
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'ul' | 'ol';
  /** For a block a table of contents links to. */
  id?: string;
}) {
  return (
    <Tag id={id} className={`rounded-list border border-border bg-panel ${className}`}>
      {children}
    </Tag>
  );
}

/** A row inside a `Block`, separated by a hairline rather than a gap. */
export function Row({
  children,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'li';
}) {
  return (
    <Tag
      className={`flex min-h-15 items-center gap-3 border-t border-border px-4 py-3 first:border-t-0 ${className}`}
    >
      {children}
    </Tag>
  );
}

/* ------------------------------------------------------------------ text */

export function PageTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h1 className={`font-display text-[1.75rem] leading-tight tracking-title ${className}`}>
      {children}
    </h1>
  );
}

/** The small uppercase label that titles a group. */
export function SectionLabel({
  children,
  as: Tag = 'h2',
  className = '',
}: {
  children: ReactNode;
  as?: 'h2' | 'h3' | 'div' | 'span';
  className?: string;
}) {
  return (
    <Tag className={`text-xs font-semibold uppercase tracking-label text-muted ${className}`}>
      {children}
    </Tag>
  );
}

export function Muted({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-sm leading-relaxed text-muted ${className}`}>{children}</p>;
}

/**
 * A number in the display face.
 *
 * Always tabular: a score that changes under a stepper must not shift the
 * layout while the user is reading it.
 */
export function Score({
  children,
  className = '',
  tight = true,
}: {
  children: ReactNode;
  className?: string;
  /** Scores get the tight display tracking; short counts read better without. */
  tight?: boolean;
}) {
  return (
    <span
      className={`font-display font-semibold tabular ${tight ? 'tracking-display' : 'tracking-normal'} ${className}`}
    >
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- badges */

const BADGE_TONES = {
  accent: 'bg-accent-soft text-accent',
  neutral: 'bg-panel2 text-muted',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-neg-soft text-heart',
} as const;

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: keyof typeof BADGE_TONES;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-micro font-semibold ${BADGE_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ states */

export function LoadingState({ label = 'Laden…' }: { label?: string }) {
  return (
    <p className="py-12 text-center text-muted" role="status" aria-live="polite">
      {label}
    </p>
  );
}

export function EmptyState({
  title,
  description,
  action,
  illustration,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  illustration?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3.5 px-3 py-10 text-center">
      {illustration}
      <p className="mt-1.5 font-display text-2xl font-semibold tracking-title">{title}</p>
      {description ? <p className="max-w-[16rem] text-body text-muted">{description}</p> : null}
      {action ? <div className="mt-1 w-full max-w-xs">{action}</div> : null}
    </div>
  );
}

export function ErrorPanel({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div role="alert" className="rounded-block border border-heart bg-neg-soft px-4 py-3 text-sm">
      <p className="font-semibold text-heart">{title}</p>
      {children ? <div className="mt-1 text-ink">{children}</div> : null}
    </div>
  );
}

/**
 * An inline note in one of the three issue tones.
 *
 * The tone name is always spelled out in the leading word, so severity is never
 * carried by colour alone.
 */
const NOTE_TONES = {
  warn: { box: 'bg-warn-soft text-ink', lead: 'text-warn' },
  info: { box: 'bg-panel2 text-muted', lead: 'text-ink' },
  danger: { box: 'bg-neg-soft text-ink', lead: 'text-heart' },
} as const;

export function Note({
  lead,
  children,
  tone = 'info',
  className = '',
}: {
  lead: string;
  children: ReactNode;
  tone?: keyof typeof NOTE_TONES;
  className?: string;
}) {
  const style = NOTE_TONES[tone];
  return (
    <div className={`flex gap-2 rounded-control px-3.5 py-2.5 text-note leading-snug ${style.box} ${className}`}>
      <span className={`shrink-0 font-bold ${style.lead}`}>{lead}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/* --------------------------------------------------------------- progress */

/** A progress bar that conveys its value as text too, never colour alone. */
export function ProgressBar({
  value,
  label,
  dimmed = false,
}: {
  value: number;
  label: string;
  /** The trailing team's bar is held back so the leader's reads first. */
  dimmed?: boolean;
}) {
  const percent = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-panel2"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={`h-full rounded-full bg-accent ${dimmed ? 'opacity-50' : ''}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- controls */

/**
 * An accessible switch drawn as the design's pill.
 *
 * The real `<input type="checkbox" role="switch">` sits transparent on top of
 * the drawing, so it stays the labelled, focusable, clickable control while the
 * two spans below it do the painting.
 */
export function Switch({
  id,
  checked,
  onChange,
  disabled,
  describedBy,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  return (
    <span className="relative inline-block h-8 w-13 shrink-0">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.checked)}
        className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none rounded-full disabled:cursor-not-allowed"
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full border border-border bg-panel2 transition-colors peer-checked:border-accent peer-checked:bg-accent peer-disabled:opacity-50"
      />
      <span
        aria-hidden="true"
        className="absolute left-0.75 top-0.75 size-6.5 rounded-full bg-panel shadow-sm transition-transform peer-checked:translate-x-5 peer-checked:bg-white peer-disabled:opacity-50"
      />
    </span>
  );
}

/**
 * A segmented control backed by real radios.
 *
 * Looks like the design's pill row, behaves like a radio group: arrow keys move
 * between options and the selection is announced.
 */
export function SegmentedControl<T extends string>({
  name,
  label,
  value,
  options,
  onChange,
  className = '',
}: {
  name: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <fieldset className={`m-0 rounded-control border-0 bg-panel2 p-1 ${className}`}>
      <legend className="sr-only">{label}</legend>
      <div className="grid auto-cols-fr grid-flow-col gap-1">
        {options.map((option) => {
          const id = `${name}-${option.value}`;
          const selected = option.value === value;
          return (
            <span key={option.value} className="relative">
              <input
                id={id}
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none rounded-tile"
              />
              <label
                htmlFor={id}
                className={`flex min-h-touch items-center justify-center rounded-tile px-2 text-center text-sm transition-colors ${
                  selected ? 'bg-panel font-semibold text-ink shadow-soft' : 'font-medium text-muted'
                }`}
              >
                {option.label}
              </label>
            </span>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * The bottom action area of a form.
 *
 * Sticky so the primary action stays reachable while a long form scrolls, with
 * the safe-area inset added so it clears the iOS home indicator.
 */
export function StickyActions({
  children,
  className = '',
}: {
  children: ReactNode;
  /** For a screen that carries its actions somewhere else at some width. */
  className?: string;
}) {
  return (
    <div
      className={`sticky bottom-0 z-20 border-t border-border bg-panel px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:px-6 md:px-12 md:pb-4.5 md:pt-3.5 ${className}`}
    >
      {/* Aligned on the same column as the content above it, so the actions sit
          under the last field rather than against the edge of the window. */}
      <div className="mx-auto flex w-full max-w-page items-center gap-2.5 md:max-w-wide md:justify-end">
        {children}
      </div>
    </div>
  );
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
