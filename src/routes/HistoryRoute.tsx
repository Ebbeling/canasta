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

/** The four columns the header and every row share. */
const GRID = 'grid grid-cols-[3.25rem_1fr_1fr_2.75rem] items-center gap-x-1';

function Row({ row, gameId }: { row: RoundRowVM; gameId: string | undefined }) {
  return (
    <li className="border-t border-border">
      <div className={`${GRID} min-h-15 px-4 py-2.5`}>
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

  return (
    <div className="flex flex-1 flex-col">
      <AppBar
        title="Geschiedenis"
        subtitle={`${teams.map((team) => team.name).join(' · ')} · ${
          rows.length === 1 ? '1 ronde' : `${rows.length} rondes`
        }`}
        back={`/games/${gameId}`}
      />

      <div className="flex flex-1 flex-col gap-3 pt-1">
        {rows.length === 0 ? (
          <EmptyState
            title="Nog geen rondes gespeeld"
            description="Zodra je een ronde invoert, verschijnt hier de hele opbouw van de stand."
            action={
              <LinkButton to={`/games/${gameId}/round`} variant="primary" size="lg" block>
                Ronde invoeren
              </LinkButton>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              {teams.map((team, index) => (
                <Block
                  key={team.teamId}
                  className={`px-4 py-3 ${index === 1 ? 'text-right' : ''}`}
                >
                  <span
                    className={`flex items-center gap-1.5 text-caption font-semibold text-muted ${
                      index === 1 ? 'justify-end' : ''
                    }`}
                  >
                    {index === 1 ? null : <Suit index={index} />}
                    <span className="truncate">{team.name}</span>
                    {index === 1 ? <Suit index={index} /> : null}
                  </span>
                  <Score className="block text-3xl leading-tight">
                    {last?.teams.find((entry) => entry.teamId === team.teamId)?.runningTotalText ??
                      '0'}
                  </Score>
                </Block>
              ))}
            </div>

            <Block className="overflow-hidden py-1">
              <div className={`${GRID} px-4 pb-1.5 pt-2 text-micro font-semibold uppercase tracking-label text-muted`}>
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
                  <Row key={row.roundId} row={row} gameId={gameId} />
                ))}
              </ul>
            </Block>

            <p className="px-2 text-center text-caption text-muted">
              Tik het potlood om een ronde te corrigeren. Latere standen worden herberekend.
            </p>
          </>
        )}
      </div>

      <GameNav gameId={gameId ?? ''} />
    </div>
  );
}
