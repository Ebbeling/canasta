import type { ReactNode } from 'react';
import type { PendingSubmission } from '@/net/tableClient';
import { Block, Button, Card, SectionLabel } from '@/ui/common/primitives';
import { StatusPill } from '@/ui/tournament/pieces';

/**
 * The table view's own pieces.
 *
 * Still the app's primitives — `Card`, `Block`, `Button`, the same status pill
 * the organiser sees — arranged for a phone propped against a card box. Bigger
 * type, fewer things, one obvious action. There is no second design system
 * here, only a second arrangement.
 */

/** The banner at the top of every table screen: where am I, and is the wire up. */
export function TableHeader({
  tableNumber,
  tournamentName,
  roundLine,
  connected,
}: {
  tableNumber: number;
  tournamentName: string;
  roundLine?: string;
  connected: boolean;
}) {
  return (
    <Card tone="accent" className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionLabel as="h2" tone="inherit">
            Tafel {tableNumber}
          </SectionLabel>
          <p className="mt-0.5 truncate font-display text-2xl font-semibold tracking-title">
            {tournamentName}
          </p>
          {roundLine ? <p className="mt-0.5 text-sm opacity-90">{roundLine}</p> : null}
        </div>

        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-black/15 px-2.5 py-1 text-micro font-semibold">
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${connected ? 'bg-white' : 'border-[1.5px] border-white/70'}`}
          />
          {connected ? 'Verbonden' : 'Geen verbinding'}
        </span>
      </div>
    </Card>
  );
}

/** Who is sitting here, grouped into sides. */
export function SeatingCard({ sideLines }: { sideLines: string[] }) {
  return (
    <Card className="flex flex-col gap-2 px-5 py-4">
      <SectionLabel as="h2">Aan deze tafel</SectionLabel>
      {sideLines.map((line, index) => (
        <p key={`${line}-${index}`} className="text-lg font-medium leading-snug">
          {line}
        </p>
      ))}
    </Card>
  );
}

const MATCH_STATUS = {
  waiting: { kind: 'waiting', label: 'Nog niet gestart' },
  busy: { kind: 'busy', label: 'Bezig' },
  done: { kind: 'done', label: 'Klaar' },
  undecided: { kind: 'attention', label: 'Gelijk · onbeslist' },
} as const;

export function MatchStatus({ status }: { status: keyof typeof MATCH_STATUS }) {
  return <StatusPill status={MATCH_STATUS[status]} />;
}

/**
 * What this device is still holding on to.
 *
 * The distinction this makes is the point of the whole offline story: a round
 * that is "opgeslagen op dit apparaat" is not the same as one that is
 * "bevestigd door de server", and a table operator has to be able to see which
 * of the two they have.
 */
export function PendingPanel({
  pending,
  onRetry,
  onDiscard,
}: {
  pending: PendingSubmission[];
  onRetry: () => void;
  onDiscard: (id: string) => void;
}) {
  if (pending.length === 0) return null;

  const rejected = pending.filter((entry) => entry.rejected);
  const waiting = pending.filter((entry) => !entry.rejected);

  return (
    <Block className="flex flex-col gap-2.5 px-4 py-3.5">
      <SectionLabel as="h2">Nog niet bevestigd</SectionLabel>

      {waiting.length > 0 ? (
        <>
          <p className="text-body">
            {waiting.length === 1
              ? 'Eén invoer staat op dit apparaat en is nog niet door de server bevestigd.'
              : `${waiting.length} invoeren staan op dit apparaat en zijn nog niet door de server bevestigd.`}
          </p>
          <p className="text-caption leading-snug text-muted">
            Laat dit scherm openstaan. Zodra de verbinding terug is, wordt het vanzelf verstuurd.
          </p>
          <Button size="md" block onClick={onRetry}>
            Nu opnieuw proberen
          </Button>
        </>
      ) : null}

      {rejected.map((entry) => (
        <div key={entry.id} className="flex flex-col gap-1.5 border-t border-border pt-2.5">
          <p className="text-body font-medium">De server heeft dit geweigerd.</p>
          <p className="text-caption leading-snug text-muted">{entry.rejected?.message}</p>
          <Button size="sm" variant="ghost" onClick={() => onDiscard(entry.id)}>
            Verwijder deze invoer
          </Button>
        </div>
      ))}
    </Block>
  );
}

/** A full-screen message, for the states where there is nothing else to show. */
export function TableMessage({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-4 py-10">
      <Card className="flex flex-col gap-3 px-5 py-6">
        <SectionLabel as="h2">{title}</SectionLabel>
        {children ? <div className="text-body leading-snug text-muted">{children}</div> : null}
        {action}
      </Card>
    </div>
  );
}
