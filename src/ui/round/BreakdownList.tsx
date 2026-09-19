import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ScoreLineVM, TeamPreviewVM } from '@/application/viewmodels/roundPreview';
import { Block, Score, SectionLabel } from '@/ui/common/primitives';

/**
 * The §38 breakdown: one line per scoring rule, tappable for the engine's own
 * explanation. The UI presents these lines; it never reconstructs them.
 */
function Line({ line }: { line: ScoreLineVM }) {
  const [open, setOpen] = useState(false);
  const negative = line.value < 0;

  const row = (
    <span className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
      <span className="min-w-0 truncate">{line.label}</span>
      <span className={`shrink-0 tabular ${negative ? 'text-heart' : ''}`}>{line.valueText}</span>
    </span>
  );

  if (!line.explain) {
    return <li className="border-b border-border py-2">{row}</li>;
  }

  return (
    <li className="border-b border-border">
      <button
        type="button"
        className="flex min-h-touch w-full flex-col justify-center text-left"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {row}
      </button>
      {open ? (
        <p className="mb-2 whitespace-pre-line rounded-tile bg-panel2 px-3 py-2 text-xs leading-relaxed text-muted">
          {line.explain}
        </p>
      ) : null}
    </li>
  );
}

export function BreakdownList({ team, title }: { team: TeamPreviewVM; title: ReactNode }) {
  return (
    <Block className="px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <SectionLabel as="h2">{title}</SectionLabel>
        {team.lines.length > 0 ? (
          <span className="text-caption text-muted">tik een regel voor uitleg</span>
        ) : null}
      </div>

      {team.lines.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nog niets ingevuld voor dit team.</p>
      ) : (
        <>
          <ul className="mt-1.5">
            {team.lines.map((line) => (
              <Line key={line.ruleId} line={line} />
            ))}
          </ul>
          <div className="flex items-baseline justify-between gap-3 pt-2.5" aria-live="polite">
            <span className="font-semibold">Totaal</span>
            <Score className="text-[1.75rem]">{team.totalText}</Score>
          </div>
          <p className="text-caption text-muted">
            Nieuwe stand <b className="tabular text-ink">{team.scoreAfterText}</b>
          </p>
        </>
      )}
    </Block>
  );
}
