import { useEffect, useState } from 'react';
import type {
  RuleSetDescription,
  RuleValueVM,
  StatusBadgeVM,
} from '@/application/viewmodels/rulesView';
import { ChevronDown } from '@/ui/common/icons';
import { Badge, Block, Card, Muted, Score, SectionLabel } from '@/ui/common/primitives';

/**
 * The rules of a game, read-only. Every string comes from the view model.
 *
 * Laid out as the design's rulebook: a table of contents that stays put while
 * the rules scroll past it, and every section rendered at once so a reader can
 * move through them. The same list becomes a horizontal jump bar below `lg`,
 * where a column beside the text would leave nothing for the text.
 */

interface TocEntry {
  id: string;
  title: string;
}

function anchorId(key: string): string {
  return `regels-${key}`;
}

function StatusBadge({ badge }: { badge: StatusBadgeVM }) {
  if (badge.status === 'verified' && !badge.configurable) return null;

  return (
    <Badge tone="neutral">
      {badge.status === 'verified' ? 'Instelbaar' : badge.label}
      {badge.status !== 'verified' && badge.configurable ? ' · instelbaar' : ''}
    </Badge>
  );
}

/**
 * One rule. The design puts the value in its own column beside the label
 * rather than on the same baseline, so a long explanation never pushes the
 * number it belongs to out of sight.
 */
function ValueRow({ value }: { value: RuleValueVM }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-5 border-t border-border py-3.5 first:border-t-0">
      <div className="min-w-0">
        <span className="flex flex-wrap items-center gap-2 text-body font-medium lg:text-base">
          {value.label}
          {value.overridden ? <Badge tone="accent">Huisregel</Badge> : null}
          <StatusBadge badge={value.badge} />
        </span>
        {value.help ? (
          <p className="mt-1.5 max-w-[32.5rem] text-note leading-snug text-muted text-pretty">
            {value.help}
          </p>
        ) : null}
        <p className="mt-1 text-meta text-muted">{value.effectLabel}</p>
      </div>

      {value.rows ? (
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(3.5rem,4.5rem))] gap-1.5">
          {value.rows.map((row) => (
            <li key={row.label} className="rounded-tile bg-panel2 px-1.5 py-2 text-center">
              <Score tight={false} className="block text-note lg:text-[1.125rem]">
                {row.valueText}
              </Score>
              <span className="block text-micro text-muted">{row.label}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Score tight={false} className="text-xl lg:text-2xl">
          {value.valueText}
          {value.unit ? ` ${value.unit}` : ''}
        </Score>
      )}
    </li>
  );
}

/**
 * A rulebook section.
 *
 * Collapsible on a phone, where the design gives each section a chevron; open
 * from `lg`, where the design shows them all at once beside the contents. The
 * body stays in the document either way, so the desktop rule is pure CSS and
 * the table of contents can always find its anchor.
 */
function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Block id={id} as="section" className="scroll-mt-6 px-4.5 py-1 lg:rounded-[1.375rem] lg:px-6.5">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-touch w-full items-center justify-between gap-3 py-2 text-left lg:pointer-events-none lg:pb-2 lg:pt-3.5"
        >
          <SectionLabel as="span">{title}</SectionLabel>
          <ChevronDown
            size={18}
            className={`shrink-0 text-muted transition-transform lg:hidden ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </h2>
      <ul className={`pb-1 ${open ? '' : 'max-lg:hidden'}`}>{children}</ul>
    </Block>
  );
}

/**
 * Marks the section the reader is currently in.
 *
 * Presentation state only: which heading happens to be on screen. Nothing else
 * in the app knows or cares, and with no `IntersectionObserver` — or with
 * JavaScript that never runs — the contents still work as plain links.
 */
function useCurrentSection(entries: TocEntry[]): string | undefined {
  const [current, setCurrent] = useState<string | undefined>(entries[0]?.id);
  const ids = entries.map((entry) => entry.id).join('|');

  useEffect(() => {
    if (typeof IntersectionObserver !== 'function') return;

    const sections = ids
      .split('|')
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => node !== null);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (observed) => {
        const visible = observed
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setCurrent(visible[0].target.id);
      },
      // A band across the upper part of the window: the section being read is
      // the one just under the top, not whichever fills the most of the screen.
      { rootMargin: '-10% 0px -70% 0px', threshold: 0 },
    );

    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [ids]);

  return current;
}

function TableOfContents({ entries, current }: { entries: TocEntry[]; current?: string }) {
  return (
    <nav aria-label="Inhoud" className="sticky top-6 hidden flex-col gap-0.5 text-sm lg:flex">
      <SectionLabel as="div" className="px-3 pb-2">
        Inhoud
      </SectionLabel>
      {entries.map((entry) => {
        const active = entry.id === current;
        return (
          <a
            key={entry.id}
            href={`#${entry.id}`}
            aria-current={active ? 'true' : undefined}
            className={`flex min-h-10 items-center rounded-[0.625rem] px-3 transition-colors ${
              active
                ? 'border-l-[3px] border-accent bg-panel pl-[calc(0.75rem-3px)] font-semibold text-ink'
                : 'text-muted hover:text-ink'
            }`}
          >
            {entry.title}
          </a>
        );
      })}
    </nav>
  );
}

/** The same list as a jump bar, for widths with no room for a column beside the text. */
function JumpBar({ entries, current }: { entries: TocEntry[]; current?: string }) {
  return (
    <div
      className="-mx-4 flex gap-2 overflow-x-auto px-4 py-0.5 sm:-mx-6 sm:px-6 lg:hidden"
      role="group"
      aria-label="Ga naar onderdeel"
    >
      {entries.map((entry) => {
        const active = entry.id === current;
        return (
          <a
            key={entry.id}
            href={`#${entry.id}`}
            aria-current={active ? 'true' : undefined}
            className={`flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-note transition-colors ${
              active
                ? 'bg-ink font-semibold text-surface'
                : 'border border-border bg-panel font-medium text-ink'
            }`}
          >
            {entry.title}
          </a>
        );
      })}
    </div>
  );
}

export function RuleSetView({ description }: { description: RuleSetDescription }) {
  const entries: TocEntry[] = [
    ...description.sections.map((section) => ({
      id: anchorId(section.category),
      title: section.title,
    })),
    ...(description.caveats.length > 0 ? [{ id: anchorId('voorbehoud'), title: 'Voorbehoud' }] : []),
    { id: anchorId('bronnen'), title: 'Bronnen' },
  ];
  const current = useCurrentSection(entries);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[12.5rem_minmax(0,1fr)] lg:gap-7">
      <TableOfContents entries={entries} current={current} />

      <div className="flex min-w-0 flex-col gap-4">
        {/* What this rule set is, with its headline facts beside it as soon as
            there is room for a second column. */}
        <Card className="px-5 py-5 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-6 lg:px-8 lg:py-7">
          <div className="min-w-0">
            <h2 className="font-display text-[1.625rem] font-semibold leading-tight tracking-title lg:text-[2.125rem]">
              {description.name}
            </h2>
            <Muted className="mt-1.5 text-sm text-pretty lg:text-[0.9375rem]">
              {description.description}
            </Muted>
          </div>
          <dl className="mt-3.5 grid grid-cols-[repeat(auto-fit,minmax(4rem,1fr))] gap-2 lg:mt-0 lg:w-56 lg:grid-cols-2">
            {description.summaryFacts.map((fact) => (
              <div key={fact.label} className="rounded-control bg-panel2 px-2 py-2.5 text-center">
                <dd className="font-display text-xl font-semibold tabular lg:text-[1.375rem]">
                  {fact.valueText}
                </dd>
                <dt className="mt-0.5 text-micro leading-tight text-muted">{fact.label}</dt>
              </div>
            ))}
          </dl>
        </Card>

        <JumpBar entries={entries} current={current} />

        {description.sections.map((section) => (
          <Section key={section.category} id={anchorId(section.category)} title={section.title}>
            {section.values.map((value) => (
              <ValueRow key={value.key} value={value} />
            ))}
          </Section>
        ))}

        {description.caveats.length > 0 ? (
          <Block
            id={anchorId('voorbehoud')}
            as="section"
            className="scroll-mt-6 px-4.5 py-3.5 lg:rounded-[1.375rem] lg:px-6.5"
          >
            <SectionLabel as="h2">Waar deze regelset niet zeker over is</SectionLabel>
            <ul className="mt-2 flex flex-col gap-3 text-sm">
              {description.caveats.map((caveat) => (
                <li key={caveat.key}>
                  <p className="flex flex-wrap items-center gap-1.5 font-medium">
                    {caveat.label}
                    <StatusBadge badge={caveat.badge} />
                  </p>
                  {/* Verbatim from the rule set; never rewritten in the UI. */}
                  <p className="mt-0.5 max-w-[32.5rem] text-note leading-snug text-muted text-pretty">
                    {caveat.badge.note}
                  </p>
                  {caveat.badge.source ? (
                    <p className="mt-0.5 text-meta text-muted">Bron: {caveat.badge.source.name}</p>
                  ) : null}
                </li>
              ))}
            </ul>
            {description.provenanceNotes ? (
              <p className="mt-3 max-w-[32.5rem] text-meta leading-snug text-muted">
                {description.provenanceNotes}
              </p>
            ) : null}
          </Block>
        ) : null}

        <Block
          id={anchorId('bronnen')}
          as="section"
          className="scroll-mt-6 px-4.5 py-3.5 lg:rounded-[1.375rem] lg:px-6.5"
        >
          <SectionLabel as="h2">Bronnen</SectionLabel>
          <ul className="mt-2 flex flex-col gap-1">
            {[description.source, ...description.additionalSources].map((source) => (
              <li
                key={`${source.name}-${source.title ?? ''}`}
                className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 text-sm"
              >
                {source.url ? (
                  <a
                    href={source.url}
                    className="font-medium underline decoration-border underline-offset-2"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {source.name}
                    {source.title ? ` — ${source.title}` : ''}
                  </a>
                ) : (
                  <span className="font-medium">{source.name}</span>
                )}
                {source.retrievedAt ? (
                  <span className="text-xs text-muted">opgehaald {source.retrievedAt}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </Block>
      </div>
    </div>
  );
}
