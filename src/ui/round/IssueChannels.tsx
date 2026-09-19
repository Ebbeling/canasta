import type { IssueVM } from '@/application/viewmodels/issues';
import { Note } from '@/ui/common/primitives';

/**
 * The three channels, each its own region with a text label.
 *
 * Severity is never conveyed by colour alone: every block names itself, and
 * every item repeats the channel for screen readers. Errors additionally take
 * `role="alert"`, because they are the only channel that stops a save.
 */
function Channel({
  title,
  tone,
  issues,
}: {
  title: string;
  tone: 'danger' | 'warn' | 'info';
  issues: IssueVM[];
}) {
  if (issues.length === 0) return null;

  const line = (issue: IssueVM) => (
    <>
      {issue.teamName ? <span className="font-semibold">{issue.teamName}: </span> : null}
      {issue.message}
    </>
  );

  // One block per channel, not one per issue: an advisory rule set can produce
  // a dozen notes at once, and repeating the word "Info" a dozen times buries
  // the one line that actually needs reading.
  return (
    <section aria-label={title} role={tone === 'danger' ? 'alert' : undefined}>
      <Note lead={title} tone={tone}>
        {issues.length === 1 && issues[0] ? (
          line(issues[0])
        ) : (
          <ul className="flex flex-col gap-1">
            {issues.map((issue) => (
              <li key={`${issue.code}-${issue.teamId ?? 'round'}`}>{line(issue)}</li>
            ))}
          </ul>
        )}
      </Note>
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
    <div className="flex flex-col gap-2">
      <Channel title="Fout" tone="danger" issues={errors} />
      <Channel title="Let op" tone="warn" issues={warnings} />
      <Channel title="Info" tone="info" issues={advisories} />
    </div>
  );
}
