import { useState } from 'react';
import { Link } from 'react-router';
import type { GameSummary } from '@/application/ports';
import { useGameList } from '@/hooks/useGameData';
import { AppBar } from '@/ui/app/AppBar';
import { PageBody } from '@/ui/app/Page';
import { Plus } from '@/ui/common/icons';
import {
  Block,
  EmptyState,
  IconLink,
  LinkButton,
  LoadingState,
  SectionLabel,
  SegmentedControl,
} from '@/ui/common/primitives';
import { GameSummaryRow } from './GameSummaryRow';

type Filter = 'all' | 'active' | 'finished';

/** Filtering happens over the list already in hand; nothing re-queries. */
const MATCHES: Record<Filter, (summary: GameSummary) => boolean> = {
  all: () => true,
  active: (summary) => summary.status === 'active',
  finished: (summary) => summary.status !== 'active',
};

function Group({ title, games }: { title: string; games: GameSummary[] }) {
  if (games.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel className="px-1">{title}</SectionLabel>
      <Block as="ul" className="overflow-hidden">
        {games.map((summary) => (
          <li key={summary.id} className="border-t border-border first:border-t-0">
            <Link
              to={`/games/${summary.id}`}
              className="flex min-h-15 items-center gap-3 px-4 py-3 transition-colors hover:bg-panel2"
            >
              <GameSummaryRow summary={summary} />
            </Link>
          </li>
        ))}
      </Block>
    </section>
  );
}

export function GameListRoute() {
  const games = useGameList();
  const [filter, setFilter] = useState<Filter>('all');

  const all = games.status === 'ready' ? games.data : [];
  const shown = all.filter(MATCHES[filter]);

  return (
    <PageBody>
      <div className="flex flex-1 flex-col pb-6">
      <AppBar
        title="Partijen"
        back="/"
        action={
          <IconLink to="/new" label="Nieuwe partij" className="text-accent">
            <Plus />
          </IconLink>
        }
      />

      {games.status === 'loading' ? <LoadingState label="Partijen laden…" /> : null}

      {games.status === 'ready' && all.length === 0 ? (
        <div className="flex flex-1 flex-col justify-between gap-5">
          <EmptyState
            title="Nog geen partijen"
            description="Start een nieuwe Canasta-partij en houd de score automatisch bij."
          />
          <LinkButton to="/new" variant="primary" size="xl" block>
            <Plus />
            Nieuwe partij
          </LinkButton>
        </div>
      ) : null}

      {all.length > 0 ? (
        <div className="flex flex-col gap-4.5 pt-2">
          <SegmentedControl
            name="partijen-filter"
            label="Partijen filteren"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `Alle · ${all.length}` },
              { value: 'active', label: 'Bezig' },
              { value: 'finished', label: 'Afgerond' },
            ]}
          />

          <Group title="Bezig" games={shown.filter((game) => game.status === 'active')} />
          <Group title="Eerder" games={shown.filter((game) => game.status !== 'active')} />

          {shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              Geen partijen in deze selectie.
            </p>
          ) : null}
        </div>
      ) : null}
      </div>
    </PageBody>
  );
}
