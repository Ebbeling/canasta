import type { IssueVM } from '@/application/viewmodels/issues';

/**
 * The three channels, each its own region with a text label.
 *
 * Severity is never conveyed by colour alone: every block names itself, and
 * every item repeats the channel for screen readers.
 */
function Channel({
  title,
  tone,
  issues,
}: {
  title: string;
  tone: 'error' | 'warning' | 'info';
  issues: IssueVM[];
}) {
  if (issues.length === 0) return null;

  const border =
    tone === 'error'
      ? 'border-[--color-negative]'
      : tone === 'warning'
        ? 'border-[--color-warning]'
        : 'border-[--color-border]';

  return (
    <section
      aria-label={title}
      className={`rounded-xl border bg-[--color-panel] p-3 text-sm ${border}`}
      role={tone === 'error' ? 'alert' : undefined}
    >
      <h3 className="font-semibold">{title}</h3>
      <ul className="mt-1 space-y-1">
        {issues.map((issue) => (
          <li key={`${issue.code}-${issue.teamId ?? 'round'}`}>
            <span className="sr-only">{issue.channelLabel}: </span>
            {issue.teamName ? <span className="font-medium">{issue.teamName}: </span> : null}
            {issue.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function IssueChannels({
  errors,
  warnings,
  advisories,
}: {
  errors: IssueVM[];
  warnings: IssueVM[];
  advisories: IssueVM[];
}) {
  return (
    <div className="space-y-2">
      <Channel title="Fout" tone="error" issues={errors} />
      <Channel title="Let op" tone="warning" issues={warnings} />
      <Channel title="Info" tone="info" issues={advisories} />
    </div>
  );
}
