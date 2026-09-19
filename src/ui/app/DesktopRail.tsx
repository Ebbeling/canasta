import { NavLink, useParams } from 'react-router';
import { useScoreboard } from '@/hooks/useGameData';
import { BoardIcon, BookIcon, ChevronLeft, ClockIcon, Plus, Sliders } from '@/ui/common/icons';
import { Suit } from '@/ui/common/Suit';
import { SectionLabel } from '@/ui/common/primitives';

/**
 * The left rail, for tablet landscape and up.
 *
 * On a phone the design puts the in-game destinations in a bottom bar under
 * the thumb. On a wide screen that bar would sit a long way from anything the
 * user is reading, so the same three destinations move into a rail together
 * with the context they belong to — which game, against whom, how far along.
 *
 * From `md` to `lg` the rail collapses to icons: the room is there for a
 * column, not yet for a column with words in it. Below `md` it disappears
 * entirely and the mobile layout takes over unchanged.
 */

const RAIL_ITEM =
  'flex min-h-12 items-center gap-3 rounded-control px-3.5 text-body transition-colors ' +
  'lg:px-3.5 max-lg:justify-center max-lg:px-0';

function railClass(isActive: boolean): string {
  return `${RAIL_ITEM} ${
    isActive ? 'bg-accent-soft font-semibold text-accent' : 'font-medium text-ink hover:bg-panel2'
  }`;
}

/** The dot that marks the active destination, as the design draws it. */
function Marker({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`hidden size-2 shrink-0 rounded-full lg:block ${
        active ? 'bg-accent' : 'border-[1.5px] border-border'
      }`}
    />
  );
}

/** Which game the rail is standing in, if any. */
function GameContext({ gameId }: { gameId: string }) {
  const board = useScoreboard(gameId);

  return (
    <>
      <NavLink to="/games" className={`${RAIL_ITEM} text-muted hover:text-ink`}>
        <ChevronLeft size={18} />
        <span className="max-lg:sr-only">Alle partijen</span>
      </NavLink>

      {board.status === 'ready' ? (
        <div className="rounded-block border border-border bg-surface px-4 py-3.5 max-lg:hidden">
          <SectionLabel as="div">Deze partij</SectionLabel>
          <p className="mt-2 text-body font-semibold leading-snug">
            {board.data.teams.map((team, index) => (
              <span key={team.teamId} className="block truncate">
                <Suit index={index} /> {team.name}
              </span>
            ))}
          </p>
          <p className="mt-1.5 text-caption text-muted">
            {board.data.ruleSetName} ·{' '}
            {board.data.roundCount === 0 ? 'nog geen ronde' : `na ronde ${board.data.roundCount}`} ·
            doel {board.data.targetScoreText}
          </p>
        </div>
      ) : null}

      <nav aria-label="In deze partij" className="flex flex-col gap-1">
        {[
          { to: `/games/${gameId}`, label: 'Scorebord', Icon: BoardIcon, end: true },
          { to: `/games/${gameId}/history`, label: 'Geschiedenis', Icon: ClockIcon, end: false },
          { to: `/games/${gameId}/rules`, label: 'Spelregels', Icon: BookIcon, end: false },
        ].map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => railClass(isActive)}>
            {({ isActive }) => (
              <>
                <Marker active={isActive} />
                <Icon size={20} className="lg:hidden" />
                <span className="max-lg:sr-only">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </>
  );
}

export function DesktopRail() {
  // The layout route sits above `games/:gameId`, and `useParams` reports the
  // whole matched hierarchy, so this is the id of the game being looked at.
  const { gameId } = useParams();

  return (
    <aside aria-label="Canasta" className="sticky top-0 hidden h-dvh w-18 shrink-0 flex-col gap-5 overflow-y-auto border-r border-border bg-panel px-3 py-6 md:flex lg:w-66 lg:px-4">
      <NavLink to="/" className="flex items-center gap-2.5 px-2 max-lg:justify-center">
        <span className="font-display text-[1.375rem] font-semibold tracking-display">
          <span className="max-lg:hidden">Canasta</span>
          <span className="lg:hidden" aria-hidden="true">
            ♠
          </span>
          <span className="sr-only lg:hidden">Canasta</span>
        </span>
        <span aria-hidden="true" className="text-xs tracking-[0.14em] text-muted max-lg:hidden">
          ♠ <span className="text-heart">♥</span> ♣ <span className="text-heart">♦</span>
        </span>
      </NavLink>

      {gameId ? (
        <GameContext gameId={gameId} />
      ) : (
        <>
          <nav aria-label="Hoofdmenu" className="flex flex-col gap-1">
            <NavLink to="/" end className={({ isActive }) => railClass(isActive)}>
              {({ isActive }) => (
                <>
                  <Marker active={isActive} />
                  <BoardIcon size={20} className="lg:hidden" />
                  <span className="max-lg:sr-only">Home</span>
                </>
              )}
            </NavLink>
            <NavLink to="/games" className={({ isActive }) => railClass(isActive)}>
              {({ isActive }) => (
                <>
                  <Marker active={isActive} />
                  <ClockIcon size={20} className="lg:hidden" />
                  <span className="max-lg:sr-only">Partijen</span>
                </>
              )}
            </NavLink>
          </nav>

          <NavLink
            to="/new"
            className="flex min-h-13 items-center justify-center gap-2 rounded-btn bg-accent font-semibold text-accent-ink shadow-soft transition-opacity hover:opacity-90"
          >
            <Plus />
            <span className="max-lg:sr-only">Nieuwe partij</span>
          </NavLink>
        </>
      )}

      <div className="flex-1" />

      <NavLink
        to="/settings"
        className={({ isActive }) =>
          `${RAIL_ITEM} ${isActive ? 'font-semibold text-accent' : 'text-muted hover:text-ink'}`
        }
      >
        <Sliders size={18} />
        <span className="max-lg:sr-only">Instellingen</span>
      </NavLink>
    </aside>
  );
}
