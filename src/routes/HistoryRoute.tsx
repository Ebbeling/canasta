import { Link, useParams } from 'react-router';
import type { RoundRowVM } from '@/application/viewmodels/historyView';
import { useGameHistory } from '@/hooks/useGameData';
import { AppBar } from '@/ui/app/AppBar';
import { GameNav } from '@/ui/app/GameNav';
import { Pencil } from '@/ui/common/icons';
import { Suit } from '@/ui/common/Suit';
import {
  Block,
  EmptyState,
  LinkButton,
  LoadingState,
  Note,
  Score,
} from '@/ui/common/primitives';
import { GameNotFound } from './GameNotFound';

/**
 * The columns the header and every row share: the round number, one per team,
 * and the correction link. Built from the game rather than written down, which
 * is what lets three or six teams line up as readily as two.
 */
function columnsFor(teamCount: number) {
  return { gridTemplateColumns: `3.25rem repeat(${teamCount}, minmax(0,1fr)) 2.75rem` };
}

const GRID = 'grid items-center gap-x-1';

function Row({
  row,
  gameId,
  columns,
}: {
  row: RoundRowVM;
  gameId: string | undefined;
  columns: React.CSSProperties;
}) {
  return (
    <li className="border-t border-border">
      <div style={columns} className={`${GRID} min-h-15 px-4 py-2.5 lg:px-6`}>
        <Score tight={false} className="text-xl text-muted">
          {row.displayNumber}
        </Score>

        {row.teams.map((team) => (
          <div key={team.teamId} className="min-w-0 text-right">
            <Score
              tight={false}
              className={`block text-xl ${team.delta < 0 ? 'text-heart' : ''}`}
            >
              {team.deltaText}
            </Score>
            <span className="block text-xs tabular text-muted">{team.runningTotalText}</span>
          </div>
        ))}

        <Link
          to={`/games/${gameId}/rounds/${row.roundId}/edit`}
          aria-label={`Ronde ${row.displayNumber} bewerken`}
          className="inline-flex size-11 items-center justify-center justify-self-end rounded-tile text-muted transition-colors hover:bg-panel2 hover:text-ink"
        >
          <Pencil size={18} />
        </Link>
      </div>

      {row.issues.length > 0 ? (
        <ul className="space-y-1.5 px-4 pb-3">
          {row.issues.map((issue) => (
            <li key={`${issue.code}-${issue.teamId ?? 'round'}`}>
              <Note lead={issue.channelLabel} tone={issue.channel === 'error' ? 'danger' : 'warn'}>
                {issue.teamName ? <span className="font-semibold">{issue.teamName}: </span> : null}
                {issue.message}
              </Note>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function HistoryRoute() {
  const { gameId } = useParams();
  const history = useGameHistory(gameId);

  if (history.status === 'loading') return <LoadingState label="Geschiedenis laden…" />;
  if (history.status === 'missing') return <GameNotFound />;

  const { rows, teams } = history.data;
  const last = rows.at(-1);
  const columns = columnsFor(teams.length);

  return (
    <div className="flex flex-1 flex-col">
      <AppBar
        title="Geschiedenis"
        subtitle={`${teams.map((team) => team.name).join(' · ')} · ${
          rows.length === 1 ? '1 ronde' : `${rows.length} rondes`
        }`}
        back={`/games/${gameId}`}
      />

      <div
        data-wide
        className="flex flex-1 flex-col gap-3 pt-1 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:content-start lg:items-start lg:gap-6"
      >
        {rows.length === 0 ? (
          <div className="flex flex-1 flex-col lg:col-span-2">
            <EmptyState
              title="Nog geen rondes gespeeld"
              description="Zodra je een ronde invoert, verschijnt hier de hele opbouw van de stand."
              action={
                <LinkButton to={`/games/${gameId}/round`} variant="primary" size="lg" block>
                  Ronde invoeren
                </LinkButton>
              }
            />
          </div>
        ) : (
          <>
            <Block className="overflow-hidden py-1 lg:order-1 lg:rounded-[1.375rem]">
              <div
                style={columns}
                className={`${GRID} px-4 pb-1.5 pt-2 text-micro font-semibold uppercase tracking-label text-muted lg:px-6 lg:pt-3.5`}
              >
                <span>Ronde</span>
                {teams.map((team, index) => (
                  <span key={team.teamId} className="truncate text-right">
                    <Suit index={index} /> {team.name}
                  </span>
                ))}
                <span />
              </div>
              <ul>
                {rows.map((row) => (
                  <Row key={row.roundId} row={row} gameId={gameId} columns={columns} />
                ))}
              </ul>
            </Block>

            {/* The standings this table adds up to. Beside it from `lg`, where
                the design keeps secondary information in its own column. */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2.5 lg:order-2 lg:sticky lg:top-6 lg:grid-cols-1">
              {teams.map((team, index) => (
                <Block key={team.teamId} className="px-4 py-3">
                  <span className="flex items-center gap-1.5 text-caption font-semibold text-muted">
                    <Suit index={index} />
                    <span className="truncate">{team.name}</span>
                  </span>
                  <Score className="block text-3xl leading-tight">
                    {last?.teams.find((entry) => entry.teamId === team.teamId)?.runningTotalText ??
                      '0'}
                  </Score>
                </Block>
              ))}
            </div>

            <p className="px-2 text-center text-caption text-muted lg:order-3 lg:col-span-2">
              Tik het potlood om een ronde te corrigeren. Latere standen worden herberekend.
            </p>
          </>
        )}
      </div>

      <GameNav gameId={gameId ?? ''} />
    </div>
  );
}
