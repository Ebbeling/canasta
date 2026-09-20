import { Link, NavLink } from 'react-router';
import type {
  StatusVM,
  TournamentMatchVM,
  TournamentRoundVM,
} from '@/application/viewmodels/tournamentView';
import { Check, ChevronRight, PeopleIcon, StandingsIcon, TableIcon } from '@/ui/common/icons';
import { Block, Card, Score, SectionLabel } from '@/ui/common/primitives';

/**
 * The pieces every tournament screen is made of.
 *
 * Built from the same primitives the rest of the app uses — there is no second
 * component library here, only three arrangements of `Card`, `Block` and
 * `Badge` that the tournament screens share.
 */

const PILL_TONES = {
  waiting: 'bg-panel2 text-muted',
  busy: 'bg-accent-soft text-accent',
  done: 'bg-panel2 text-muted',
  attention: 'bg-warn-soft text-warn',
} as const;

/**
 * A status, always as a word with a mark beside it.
 *
 * Never colour alone: a dot for what is running, a tick for what is done, an
 * open ring for what has not started.
 */
export function StatusPill({ status, className = '' }: { status: StatusVM; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-micro font-semibold ${PILL_TONES[status.kind]} ${className}`}
    >
      {status.kind === 'done' ? (
        <Check size={11} aria-hidden="true" />
      ) : (
        <span
          aria-hidden="true"
          className={`size-2 rounded-full ${
            status.kind === 'busy'
              ? 'bg-accent'
              : status.kind === 'attention'
                ? 'bg-warn'
                : 'border-[1.5px] border-muted'
          }`}
        />
      )}
      {status.label}
    </span>
  );
}

/**
 * One table in a round.
 *
 * The number is the first thing on the card, because at a tournament people are
 * told "tafel 3" and have to find it. Opening it goes to the ordinary game
 * screens — the tournament never scores a hand itself.
 */
export function TableCard({
  match,
  to,
  className = '',
}: {
  match: TournamentMatchVM;
  to: string;
  className?: string;
}) {
  return (
    <Block className={`overflow-hidden ${className}`}>
      <Link
        to={to}
        className="flex flex-col gap-2.5 px-4 py-3.5 transition-colors hover:bg-panel2"
      >
        <div className="flex items-center gap-3">
          <span className="sr-only">{match.title}</span>
          <span
            aria-hidden="true"
            className={`flex size-11 shrink-0 flex-col items-center justify-center rounded-tile leading-none ${
              match.isBye
                ? 'bg-panel2 text-muted'
                : match.status.kind === 'busy'
                  ? 'bg-accent text-accent-ink'
                  : 'bg-panel2 text-ink'
            }`}
          >
            <span className="text-[0.5625rem] font-semibold uppercase tracking-label opacity-80">
              {match.isBye ? 'Vrij' : 'Tafel'}
            </span>
            {match.isBye ? null : (
              <Score tight={false} className="text-[1.0625rem]">
                {match.tableNumber}
              </Score>
            )}
          </span>

          <div className="min-w-0 flex-1">
            {match.sideLines.map((line, index) => (
              <p key={line + index} className="truncate text-sm leading-snug">
                {line}
              </p>
            ))}
          </div>

          <StatusPill status={match.status} />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5">
          <span className="truncate text-caption text-muted">
            {match.resultLines.length > 0 ? match.resultLines.join(' · ') : match.participantLine}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-note font-semibold text-accent">
            {match.actionLabel}
            <ChevronRight size={14} />
          </span>
        </div>
      </Link>
    </Block>
  );
}

/** The tables of one round, as many across as the width allows. */
export function TableGrid({
  round,
  tournamentId,
  className = '',
}: {
  round: TournamentRoundVM;
  tournamentId: string;
  className?: string;
}) {
  return (
    <div
      className={`grid grid-cols-[repeat(auto-fit,minmax(17rem,1fr))] items-start gap-2.5 ${className}`}
    >
      {round.matches.map((match) => (
        <TableCard
          key={match.id}
          match={match}
          to={`/tournaments/${tournamentId}/tables/${match.id}`}
        />
      ))}
    </div>
  );
}

/** The top of the standings, for the dashboard. */
export function StandingsPreview({
  rows,
  to,
  pointsHeader,
}: {
  rows: { participantId: string; rankText: string; name: string; pointsText: string }[];
  to: string;
  pointsHeader: string;
}) {
  return (
    <Card className="px-4 pb-2 pt-1">
      <div className="flex items-center justify-between gap-3 py-2.5">
        <SectionLabel as="h2">Stand · top 3</SectionLabel>
        <Link to={to} className="text-note font-semibold text-accent">
          Volledige stand
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="border-t border-border py-3 text-sm text-muted">
          Nog geen uitslagen. De stand verschijnt zodra de eerste partij is afgerond.
        </p>
      ) : (
        rows.map((row) => (
          <div
            key={row.participantId}
            className="grid min-h-11 grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-border"
          >
            <Score tight={false} className="text-sm text-muted">
              {row.rankText}
            </Score>
            <span className="truncate text-sm font-medium">{row.name}</span>
            <Score className="text-lg">{row.pointsText}</Score>
          </div>
        ))
      )}
      <span className="sr-only">Gesorteerd op {pointsHeader.toLowerCase()}</span>
    </Card>
  );
}

/**
 * The four destinations inside a tournament.
 *
 * A bottom bar on a phone, gone from `md` where the rail carries the same four
 * — exactly the arrangement a game already uses.
 */
export function TournamentNav({ tournamentId }: { tournamentId: string }) {
  const items = [
    { to: `/tournaments/${tournamentId}`, label: 'Overzicht', Icon: TableIcon, end: true },
    { to: `/tournaments/${tournamentId}/rounds`, label: 'Rondes', Icon: ChevronRight, end: false },
    {
      to: `/tournaments/${tournamentId}/standings`,
      label: 'Stand',
      Icon: StandingsIcon,
      end: false,
    },
    {
      to: `/tournaments/${tournamentId}/participants`,
      label: 'Deelnemers',
      Icon: PeopleIcon,
      end: false,
    },
  ];

  return (
    <nav
      aria-label="In dit toernooi"
      className="sticky bottom-0 z-20 -mx-4 mt-4 border-t border-border bg-panel px-2 pb-[calc(env(safe-area-inset-bottom)+0.625rem)] pt-2 sm:static sm:mx-0 sm:mb-1 sm:rounded-block sm:border sm:px-2 sm:pb-2 md:hidden"
    >
      <ul className="grid grid-cols-4">
        {items.map(({ to, label, Icon, end }) => (
          <li key={to} className="contents">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex min-h-touch flex-col items-center justify-center gap-0.5 rounded-tile py-1.5 text-meta transition-colors ${
                  isActive ? 'font-semibold text-accent' : 'font-medium text-muted hover:text-ink'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon aria-hidden="true" size={20} />
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
