import { Link } from 'react-router';
import type { GameSummary } from '@/application/ports';
import { useGameList, useLastActiveGame, useScoreboard } from '@/hooks/useGameData';
import { ChevronRight, Plus, Sliders } from '@/ui/common/icons';
import { Suit } from '@/ui/common/Suit';
import {
  Block,
  Card,
  EmptyState,
  IconLink,
  LinkButton,
  LoadingState,
  Score,
  SectionLabel,
} from '@/ui/common/primitives';
import { PageBody } from '@/ui/app/Page';
import { GameSummaryRow } from './GameSummaryRow';

/** The wordmark, with the four suits as the app's only decoration. */
function Masthead() {
  return (
    <div className="flex items-start justify-between gap-3 pt-5">
      <div>
        <h1 className="font-display text-[2.5rem] font-semibold leading-none tracking-[-0.04em]">
          Canasta
        </h1>
        <p aria-hidden="true" className="mt-1.5 text-sm tracking-[0.18em] text-muted">
          ♠ <span className="text-heart">♥</span> ♣ <span className="text-heart">♦</span>
        </p>
      </div>
      {/* The rail carries this from `md` up; two of them would be one too many. */}
      <IconLink
        to="/settings"
        label="Instellingen"
        className="size-11 rounded-control border border-border bg-panel md:hidden"
      >
        <Sliders />
      </IconLink>
    </div>
  );
}

/**
 * The game you are most likely to want: both totals at a glance and one button
 * back into it. The scoreboard view model is what supplies the numbers — the
 * game summary on its own does not carry scores.
 */
function ResumeCard({ summary }: { summary: GameSummary }) {
  const board = useScoreboard(summary.id);

  return (
    <Card className="flex flex-col gap-3.5 px-4.5 pb-4 pt-4.5">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel as="h2">
          Bezig
          {summary.roundCount > 0 ? ` · na ronde ${summary.roundCount}` : ' · nog geen ronde'}
        </SectionLabel>
        <span className="truncate text-caption text-muted">{summary.ruleSetName}</span>
      </div>

      {board.status === 'ready' ? (
        <div className="grid grid-cols-2 gap-3">
          {board.data.teams.map((team, index) => (
            <div key={team.teamId} className={index === 1 ? 'min-w-0 text-right' : 'min-w-0'}>
              <div
                className={`flex items-center gap-1.5 text-note font-semibold ${
                  index === 1 ? 'justify-end' : ''
                }`}
              >
                {index === 1 ? null : <Suit index={index} />}
                <span className="truncate">{team.name}</span>
                {index === 1 ? <Suit index={index} /> : null}
              </div>
              <Score className="block text-[2.25rem] leading-[1.05]">{team.totalText}</Score>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">{summary.teamNames.join(' · ')}</p>
      )}

      <LinkButton to={`/games/${summary.id}`} variant="primary" size="lg" block>
        Verder spelen
        <ChevronRight />
      </LinkButton>
    </Card>
  );
}

/** Three fanned cards — the design's illustration for "nothing here yet". */
function CardFan() {
  const face = 'flex h-15 w-11 items-center justify-center rounded-lg border border-border bg-panel text-[1.375rem] shadow-soft';
  return (
    <div className="flex" aria-hidden="true">
      <span className={`${face} translate-x-2 -rotate-[10deg]`}>♠</span>
      <span className={`${face} relative z-10 text-heart`}>♥</span>
      <span className={`${face} -translate-x-2 rotate-[10deg]`}>♣</span>
    </div>
  );
}

export function HomeRoute() {
  const resume = useLastActiveGame();
  const recent = useGameList({ limit: 5 });

  const isEmpty = recent.status === 'ready' && recent.data.length === 0;

  return (
    <PageBody>
      <div className="flex flex-1 flex-col gap-5.5 pb-6">
      <Masthead />

      {isEmpty ? (
        <div className="flex flex-1 flex-col justify-between gap-5">
          <EmptyState
            title="Nog geen partijen"
            description="Start een nieuwe Canasta-partij en houd de score automatisch bij."
            illustration={<CardFan />}
          />
          <LinkButton to="/new" variant="primary" size="xl" block>
            <Plus />
            Nieuwe partij
          </LinkButton>
        </div>
      ) : null}

      {/*
       * From `lg` the design puts the game you were playing beside the way into
       * a new one. The list of earlier games stays full width underneath, which
       * is where a long game title has the room to be read. Below `lg` nothing
       * about the order changes.
       */}
      {!isEmpty ? (
        <div className="flex flex-col gap-5.5 lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-stretch lg:gap-5">
          {resume.status === 'ready' ? <ResumeCard summary={resume.data} /> : null}

          <LinkButton
            to="/new"
            variant="secondary"
            size="lg"
            block
            className={`rounded-block lg:h-full lg:flex-col lg:justify-center lg:gap-3 lg:rounded-sheet lg:border-dashed lg:px-7 lg:py-6 ${
              resume.status === 'ready' ? '' : 'lg:col-span-2'
            }`}
          >
            <span className="flex items-center gap-2 lg:size-14 lg:justify-center lg:rounded-block lg:bg-panel2">
              <Plus />
              <span className="lg:hidden">Nieuwe partij</span>
            </span>
            <span className="hidden font-display text-[1.375rem] font-semibold tracking-title lg:block">
              Nieuwe partij
            </span>
            <span className="hidden text-center text-note font-normal leading-snug text-muted text-pretty lg:block">
              Classic, Modern American of Two-Handed. Klaar in drie stappen.
            </span>
          </LinkButton>
        </div>
      ) : null}

      {recent.status === 'loading' ? <LoadingState /> : null}

      {recent.status === 'ready' && recent.data.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <SectionLabel>Recente partijen</SectionLabel>
            <Link
              to="/games"
              className="inline-flex min-h-touch items-center text-note font-semibold text-accent"
            >
              Alle partijen
            </Link>
          </div>

          <Block as="ul" className="overflow-hidden">
            {recent.data.map((summary) => (
              <li key={summary.id} className="border-t border-border first:border-t-0">
                <Link
                  to={`/games/${summary.id}`}
                  className="flex min-h-15 items-center gap-3 px-4 py-3 transition-colors hover:bg-panel2 md:gap-4 md:px-5.5"
                >
                  <GameSummaryRow summary={summary} />
                </Link>
              </li>
            ))}
          </Block>
        </section>
      ) : null}
      </div>
    </PageBody>
  );
}
