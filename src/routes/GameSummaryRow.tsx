import type { GameSummary } from '@/application/ports';
import { formatDate } from '@/application/labels/format';

const STATUS_LABELS: Record<GameSummary['status'], string> = {
  active: 'Bezig',
  finished: 'Afgerond',
  abandoned: 'Gestopt',
};

export function GameSummaryRow({ summary }: { summary: GameSummary }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{summary.name ?? summary.teamNames.join(' tegen ')}</p>
        <p className="mt-0.5 truncate text-sm text-[--color-ink-muted]">
          {summary.ruleSetName} · {formatDate(summary.createdAt)}
        </p>
        <p className="mt-0.5 text-sm text-[--color-ink-muted]">
          {summary.roundCount === 1 ? '1 ronde' : `${summary.roundCount} rondes`}
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-[--color-panel-muted] px-3 py-1 text-xs">
        {STATUS_LABELS[summary.status]}
      </span>
    </div>
  );
}
