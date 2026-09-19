import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';

/** Shared building blocks. None of them know anything about Canasta. */

const BUTTON_BASE =
  'inline-flex min-h-[var(--spacing-touch)] items-center justify-center gap-2 rounded-xl px-4 ' +
  'text-base font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const VARIANTS = {
  primary: 'bg-[--color-accent] text-[--color-accent-ink] hover:opacity-90',
  secondary:
    'border border-[--color-border] bg-[--color-panel] text-[--color-ink] hover:bg-[--color-panel-muted]',
  ghost: 'text-[--color-ink] hover:bg-[--color-panel-muted]',
  danger: 'border border-[--color-negative] text-[--color-negative] hover:bg-[--color-panel-muted]',
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

export function Button({
  variant = 'secondary',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={`${BUTTON_BASE} ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}

export function LinkButton({
  to,
  variant = 'secondary',
  className = '',
  children,
}: {
  to: string;
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={`${BUTTON_BASE} ${VARIANTS[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-[--color-border] bg-[--color-panel] p-4 ${className}`}
    >
      {children}
    </div>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl font-semibold tracking-tight">{children}</h1>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wide text-[--color-ink-muted]">
      {children}
    </h2>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm text-[--color-ink-muted]">{children}</p>;
}

export function LoadingState({ label = 'Laden…' }: { label?: string }) {
  return (
    <p className="py-10 text-center text-[--color-ink-muted]" role="status" aria-live="polite">
      {label}
    </p>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="text-center">
      <p className="font-medium">{title}</p>
      {description ? <p className="mt-1 text-sm text-[--color-ink-muted]">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </Card>
  );
}

export function ErrorPanel({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-[--color-negative] bg-[--color-panel] p-4 text-sm"
    >
      <p className="font-semibold text-[--color-negative]">{title}</p>
      {children ? <div className="mt-1 text-[--color-ink]">{children}</div> : null}
    </div>
  );
}

/** A progress bar that conveys its value as text too, never colour alone. */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  const percent = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-[--color-panel-muted]"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="h-full bg-[--color-accent]" style={{ width: `${percent}%` }} />
    </div>
  );
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
