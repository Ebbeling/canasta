import type { GameSummary } from '@/application/ports';
import { formatDate } from '@/application/labels/format';
import { Badge } from '@/ui/common/primitives';

const STATUS_LABELS: Record<GameSummary['status'], string> = {
  active: 'Bezig',
  finished: 'Afgerond',
  abandoned: 'Gestopt',
};

const STATUS_TONES: Record<GameSummary['status'], 'accent' | 'neutral'> = {
  active: 'accent',
  finished: 'neutral',
  abandoned: 'neutral',
};

/**
 * One game as a list row: who played, which rule set and when, how far it got.
 *
 * No scores here on purpose. A `GameSummary` is read from the games store
 * alone; the totals live in the rounds store, and loading every game's rounds
 * to paint a list would turn a cheap query into a per-row recomputation.
 */
export function GameSummaryRow({ summary }: { summary: GameSummary }) {
  return (
    <>
      {/*
       * Who played, and under which rules, when. Stacked while the row is
       * narrow; side by side once the row is wide enough for two columns, as
       * the design's desktop list has them — which is also what stops a long
       * title from being cut off. A container query, because what decides this
       * is the width of the row, not the width of the window: the same row
       * appears in a full-width list and in a narrower column.
       */}
      <div className="@container min-w-0 flex-1">
        <div className="@[24rem]:grid @[24rem]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] @[24rem]:items-baseline @[24rem]:gap-4">
          <p className="truncate text-body font-semibold">
            {summary.name ?? summary.teamNames.join(' tegen ')}
          </p>
          <p className="truncate text-caption text-muted">
            {summary.ruleSetName} · {formatDate(summary.createdAt)}
          </p>
        </div>
      </div>
      <span className="shrink-0 text-caption text-muted">
        {summary.roundCount === 1 ? '1 ronde' : `${summary.roundCount} rondes`}
      </span>
      <Badge tone={STATUS_TONES[summary.status]}>{STATUS_LABELS[summary.status]}</Badge>
    </>
  );
}
