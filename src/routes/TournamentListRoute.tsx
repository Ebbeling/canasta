import { Link } from 'react-router';
import type { TournamentRowVM } from '@/application/viewmodels/tournamentView';
import { useTournamentList } from '@/hooks/useTournamentData';
import { AppBar } from '@/ui/app/AppBar';
import { PageBody } from '@/ui/app/Page';
import { Plus, TrophyIcon } from '@/ui/common/icons';
import {
  Block,
  EmptyState,
  LinkButton,
  LoadingState,
  SectionLabel,
} from '@/ui/common/primitives';
import { StatusPill } from '@/ui/tournament/pieces';

/**
 * Every tournament, grouped the way the organiser thinks about them: what is
 * running, what has yet to start, what is over.
 */

function Group({ title, rows }: { title: string; rows: TournamentRowVM[] }) {
  if (rows.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel className="px-1">{title}</SectionLabel>
      <Block as="ul" className="overflow-hidden">
        {rows.map((row) => (
          <li key={row.id} className="border-t border-border first:border-t-0">
            <Link
              to={`/tournaments/${row.id}`}
              className="flex min-h-15 items-center gap-3 px-4 py-3 transition-colors hover:bg-panel2 md:gap-4 md:px-5.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-semibold">{row.name}</p>
                <p className="truncate text-caption text-muted">{row.metaLine}</p>
              </div>
              <span className="shrink-0 text-caption text-muted max-sm:hidden">{row.dateLine}</span>
              <StatusPill status={row.status} />
            </Link>
          </li>
        ))}
      </Block>
    </section>
  );
}

export function TournamentListRoute() {
  const tournaments = useTournamentList();
  const rows = tournaments.status === 'ready' ? tournaments.data : [];
  const isEmpty = tournaments.status === 'ready' && rows.length === 0;

  return (
    <PageBody>
      <div className="flex flex-1 flex-col pb-6">
        <AppBar title="Toernooien" back="/" />

        {tournaments.status === 'loading' ? <LoadingState label="Toernooien laden…" /> : null}

        {isEmpty ? (
          <div className="flex flex-1 flex-col justify-between gap-5">
            <EmptyState
              title="Nog geen toernooien"
              description="Een toernooi bundelt meerdere partijen tot één competitie, over één of meer speeldagen."
              illustration={<TrophyIcon size={56} className="text-muted" />}
            />
            <LinkButton to="/tournaments/new" variant="primary" size="xl" block>
              <Plus />
              Nieuw toernooi
            </LinkButton>
          </div>
        ) : null}

        {!isEmpty ? (
          <div className="flex flex-col gap-4.5 pt-2">
            <LinkButton
              to="/tournaments/new"
              variant="secondary"
              size="lg"
              block
              className="rounded-block"
            >
              <Plus />
              Nieuw toernooi
            </LinkButton>

            <Group title="Bezig" rows={rows.filter((row) => row.status.kind === 'busy')} />
            <Group title="Aankomend" rows={rows.filter((row) => row.status.kind === 'waiting')} />
            <Group title="Afgerond" rows={rows.filter((row) => row.status.kind === 'done')} />
          </div>
        ) : null}
      </div>
    </PageBody>
  );
}
