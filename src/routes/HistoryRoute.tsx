import { Link, useParams } from 'react-router';
import type { RoundRowVM } from '@/application/viewmodels/historyView';
import type { TeamStandingVM } from '@/application/viewmodels/scoreboard';
import { useGameHistory, useScoreboard } from '@/hooks/useGameData';
import { AppBar } from '@/ui/app/AppBar';
import { GameNav } from '@/ui/app/GameNav';
import { PageBody } from '@/ui/app/Page';
import { Pencil } from '@/ui/common/icons';
import { Suit } from '@/ui/common/Suit';
import {
  Block,
  EmptyState,
  LinkButton,
  LoadingState,
  Note,
  Score,
  SectionLabel,
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

const GRID = 'grid items-center gap-x-2';

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
      <div style={columns} className={`${GRID} min-h-15 px-4 py-2.5 md:px-6`}>
        <Score tight={false} className="text-xl text-muted">
          {row.displayNumber}
        </Score>

        {row.teams.map((team) => (
          <div key={team.teamId} className="min-w-0 text-right">
            <Score
              tight={false}
              className={`block text-xl md:text-[1.375rem] ${team.delta < 0 ? 'text-heart' : ''}`}
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
        <ul className="space-y-1.5 px-4 pb-3 md:px-6">
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

/**
 * One team in the standings beside the table.
 *
 * The design's row: position, suit, who, and the total with the gap to the
 * leader under it. Rank and gap both come from the scoreboard view model — the
 * same read model the board itself uses — so nothing here works out who is
 * ahead.
 */
function StandingRow({ team, index }: { team: TeamStandingVM; index: number }) {
  return (
    <Block className="grid grid-cols-[1.625rem_1.25rem_minmax(0,1fr)_auto] items-center gap-x-2.5 px-4 py-3.5 md:px-4.5">
      <Score
        tight={false}
        className={`inline-flex size-6.5 items-center justify-center rounded-lg text-note ${
          team.isLeader ? 'bg-accent text-accent-ink' : 'bg-panel2 text-muted'
        }`}
      >
        {team.rank}
      </Score>
      <Suit index={index} className="text-center text-[1.0625rem]" />
      <div className="min-w-0">
        <p className="truncate text-body font-semibold">{team.name}</p>
        <p className="truncate text-caption text-muted">{team.memberNames.join(' & ')}</p>
      </div>
      <div className="text-right">
        <Score className="block text-3xl leading-none">{team.totalText}</Score>
        {team.isLeader ? (
          <span className="block text-xs font-semibold text-accent">voor</span>
        ) : (
          <span className="block text-xs tabular text-muted">{team.gapText}</span>
        )}
      </div>
    </Block>
  );
}

export function HistoryRoute() {
  const { gameId } = useParams();
  const history = useGameHistory(gameId);
  const board = useScoreboard(gameId);

  if (history.status === 'loading') return <LoadingState label="Geschiedenis laden…" />;
  if (history.status === 'missing') return <GameNotFound />;

  const { rows, teams } = history.data;
  const columns = columnsFor(teams.length);

  return (
    <PageBody width="wide">
      <div className="flex flex-1 flex-col">
        <AppBar
          title="Geschiedenis"
          subtitle={`${teams.map((team) => team.name).join(' · ')} · ${
            rows.length === 1 ? '1 ronde' : `${rows.length} rondes`
          }`}
          back={`/games/${gameId}`}
        />

        {/*
         * The table and the standings it adds up to, side by side from `lg` —
         * the arrangement the design gives a game with more than two teams, and
         * the one that keeps the position visible while the rounds scroll.
         */}
        <div className="flex flex-1 flex-col gap-3 pt-1 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:content-start lg:items-start lg:gap-6">
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
              <Block className="overflow-hidden py-1.5 lg:order-1 lg:rounded-card">
                <div className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-3 md:px-6">
                  <SectionLabel as="h2">
                    Alle rondes · {rows.length}
                  </SectionLabel>
                  <span className="text-note text-muted max-sm:hidden">
                    Tik het potlood om te corrigeren
                  </span>
                </div>

                <div
                  style={columns}
                  className={`${GRID} px-4 pb-1.5 text-micro font-semibold uppercase tracking-label text-muted md:px-6`}
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

              <div className="flex flex-col gap-2.5 lg:sticky lg:top-6 lg:order-2">
                <SectionLabel as="h2" className="px-1">
                  Stand na ronde {rows.length}
                </SectionLabel>
                {board.status === 'ready'
                  ? board.data.teams
                      .map((team, index) => ({ team, index }))
                      .sort((a, b) => a.team.rank - b.team.rank)
                      .map(({ team, index }) => (
                        <StandingRow key={team.teamId} team={team} index={index} />
                      ))
                  : null}
              </div>
            </>
          )}
        </div>

        <GameNav gameId={gameId ?? ''} />
      </div>
    </PageBody>
  );
}
