import { NavLink } from 'react-router';
import { BoardIcon, BookIcon, ClockIcon } from '@/ui/common/icons';

/**
 * The three destinations inside a game.
 *
 * A bottom bar on a phone, where it sits under the thumb; at `sm` it becomes a
 * centred row below the header. From `md` it disappears altogether, because the
 * left rail carries the same three destinations and repeating them would be
 * two navigations for one job.
 *
 * Round entry deliberately does not render this: entering a round is a focus
 * mode with its own way out.
 */
export function GameNav({ gameId }: { gameId: string }) {
  const items = [
    { to: `/games/${gameId}`, label: 'Scorebord', Icon: BoardIcon, end: true },
    { to: `/games/${gameId}/history`, label: 'Geschiedenis', Icon: ClockIcon, end: false },
    { to: `/games/${gameId}/rules`, label: 'Spelregels', Icon: BookIcon, end: false },
  ];

  return (
    <nav
      aria-label="In deze partij"
      className="sticky bottom-0 z-20 -mx-4 mt-4 border-t border-border bg-panel px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.625rem)] sm:static sm:mx-0 sm:mb-1 sm:rounded-block sm:border sm:px-2 sm:pb-2 md:hidden"
    >
      <ul className="grid grid-cols-3">
        {items.map(({ to, label, Icon, end }) => (
          <li key={to} className="contents">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex min-h-touch flex-col items-center justify-center gap-0.5 rounded-tile py-1.5 text-meta transition-colors sm:flex-row sm:gap-2 sm:text-sm ${
                  isActive ? 'font-semibold text-accent' : 'font-medium text-muted hover:text-ink'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                  {isActive ? <span className="sr-only">(huidige pagina)</span> : null}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
