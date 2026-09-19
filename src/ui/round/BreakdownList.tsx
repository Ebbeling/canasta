import { useState } from 'react';
import type { TeamPreviewVM } from '@/application/viewmodels/roundPreview';
import type { ScoreLineVM } from '@/application/viewmodels/roundPreview';

/**
 * The §38 breakdown: one line per scoring rule, tappable for the engine's own
 * explanation. The UI presents these lines; it never reconstructs them.
 */
function Line({ line }: { line: ScoreLineVM }) {
  const [open, setOpen] = useState(false);
  const negative = line.value < 0;

  const row = (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="min-w-0 truncate">{line.label}</span>
      <span className={`shrink-0 tabular ${negative ? 'text-[--color-negative]' : ''}`}>
        {line.valueText}
      </span>
    </div>
  );

  if (!line.explain) return <li className="text-sm">{row}</li>;

  return (
    <li className="text-sm">
      <button
        type="button"
        className="min-h-[var(--spacing-touch)] w-full text-left"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {row}
      </button>
      {open ? (
        <p className="whitespace-pre-line rounded-lg bg-[--color-panel-muted] p-2 text-xs">
          {line.explain}
        </p>
      ) : null}
    </li>
  );
}

export function BreakdownList({ team }: { team: TeamPreviewVM }) {
  if (team.lines.length === 0) {
    return <p className="text-sm text-[--color-ink-muted]">Nog niets ingevuld voor dit team.</p>;
  }

  return (
    <>
      <ul className="divide-y divide-[--color-border]">
        {team.lines.map((line) => (
          <Line key={line.ruleId} line={line} />
        ))}
      </ul>
      <div
        className="mt-2 flex items-baseline justify-between border-t border-[--color-border] pt-2 font-semibold"
        aria-live="polite"
      >
        <span>Totaal</span>
        <span className="tabular">{team.totalText}</span>
      </div>
      <p className="mt-1 text-xs text-[--color-ink-muted]">
        Nieuwe stand: <span className="tabular">{team.scoreAfterText}</span>
      </p>
    </>
  );
}
