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
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-semibold">
          {summary.name ?? summary.teamNames.join(' tegen ')}
        </p>
        <p className="truncate text-caption text-muted">
          {summary.ruleSetName} · {formatDate(summary.createdAt)}
        </p>
      </div>
      <span className="shrink-0 text-caption text-muted">
        {summary.roundCount === 1 ? '1 ronde' : `${summary.roundCount} rondes`}
      </span>
      <Badge tone={STATUS_TONES[summary.status]}>{STATUS_LABELS[summary.status]}</Badge>
    </>
  );
}
