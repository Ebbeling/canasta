import { useState } from 'react';
import type {
  RuleSetDescription,
  RuleValueVM,
  StatusBadgeVM,
} from '@/application/viewmodels/rulesView';
import { ChevronDown } from '@/ui/common/icons';
import { Badge, Block, Card, Muted, Score, SectionLabel } from '@/ui/common/primitives';

/** Read-only rendering of a rule set. Every string comes from the view model. */

function StatusBadge({ badge }: { badge: StatusBadgeVM }) {
  if (badge.status === 'verified' && !badge.configurable) return null;

  return (
    <Badge tone="neutral">
      {badge.status === 'verified' ? 'Instelbaar' : badge.label}
      {badge.status !== 'verified' && badge.configurable ? ' · instelbaar' : ''}
    </Badge>
  );
}

function ValueRow({ value }: { value: RuleValueVM }) {
  return (
    <li className="border-t border-border py-3 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-body font-medium">
          {value.label}
          {value.overridden ? <Badge tone="accent">Huisregel</Badge> : null}
          <StatusBadge badge={value.badge} />
        </span>
        {value.rows ? null : (
          <Score tight={false} className="shrink-0 text-xl">
            {value.valueText}
            {value.unit ? ` ${value.unit}` : ''}
          </Score>
        )}
      </div>

      {value.rows ? (
        <ul className="mt-2 grid grid-cols-4 gap-1.5">
          {value.rows.map((row) => (
            <li key={row.label} className="rounded-tile bg-panel2 px-1.5 py-2 text-center">
              <Score tight={false} className="block text-[1.0625rem]">
                {row.valueText}
              </Score>
              <span className="block text-micro text-muted">{row.label}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {value.help ? (
        <p className="mt-1.5 text-note leading-snug text-muted text-pretty">{value.help}</p>
      ) : null}
      <p className="mt-1 text-meta text-muted">{value.effectLabel}</p>
    </li>
  );
}

/** A section that can be folded away; open by default, because this is a reference. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);

  return (
    <Block className="px-4.5 py-1">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-touch w-full items-center justify-between gap-3 py-2 text-left"
        >
          <SectionLabel as="span">{title}</SectionLabel>
          <ChevronDown
            size={18}
            className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </h2>
      {open ? <ul className="pb-1">{children}</ul> : null}
    </Block>
  );
}

export function RuleSetView({ description }: { description: RuleSetDescription }) {
  const [filter, setFilter] = useState('Alles');
  const pills = ['Alles', ...description.sections.map((section) => section.title)];
  const shown = description.sections.filter(
    (section) => filter === 'Alles' || section.title === filter,
  );

  return (
    <div className="flex flex-col gap-3">
      <Card className="px-5 py-5">
        <h2 className="font-display text-[1.625rem] font-semibold leading-tight tracking-title">
          {description.name}
        </h2>
        <Muted className="mt-1.5 text-sm text-pretty">{description.description}</Muted>
        <dl className="mt-3.5 grid grid-cols-4 gap-2">
          {description.summaryFacts.map((fact) => (
            <div key={fact.label} className="rounded-control bg-panel2 px-2 py-2.5 text-center">
              <dd className="font-display text-xl font-semibold tabular">{fact.valueText}</dd>
              <dt className="mt-0.5 text-micro leading-tight text-muted">{fact.label}</dt>
            </div>
          ))}
        </dl>
      </Card>

      {/* A filter, not a tab list: the sections stay real headings underneath. */}
      <div
        className="-mx-4 flex gap-2 overflow-x-auto px-4 py-0.5 sm:-mx-6 sm:px-6"
        role="group"
        aria-label="Filter op onderdeel"
      >
        {pills.map((pill) => {
          const active = pill === filter;
          return (
            <button
              key={pill}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(pill)}
              className={`flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-note transition-colors ${
                active
                  ? 'bg-ink font-semibold text-surface'
                  : 'border border-border bg-panel font-medium text-ink'
              }`}
            >
              {pill}
            </button>
          );
        })}
      </div>

      {shown.map((section) => (
        <Section key={section.category} title={section.title}>
          {section.values.map((value) => (
            <ValueRow key={value.key} value={value} />
          ))}
        </Section>
      ))}

      {description.caveats.length > 0 ? (
        <Block className="px-4.5 py-3.5">
          <SectionLabel as="h2">Waar deze regelset niet zeker over is</SectionLabel>
          <ul className="mt-2 flex flex-col gap-3 text-sm">
            {description.caveats.map((caveat) => (
              <li key={caveat.key}>
                <p className="flex flex-wrap items-center gap-1.5 font-medium">
                  {caveat.label}
                  <StatusBadge badge={caveat.badge} />
                </p>
                {/* Verbatim from the rule set; never rewritten in the UI. */}
                <p className="mt-0.5 text-note leading-snug text-muted text-pretty">
                  {caveat.badge.note}
                </p>
                {caveat.badge.source ? (
                  <p className="mt-0.5 text-meta text-muted">Bron: {caveat.badge.source.name}</p>
                ) : null}
              </li>
            ))}
          </ul>
          {description.provenanceNotes ? (
            <p className="mt-3 text-meta leading-snug text-muted">
              {description.provenanceNotes}
            </p>
          ) : null}
        </Block>
      ) : null}

      <Block className="px-4.5 py-3.5">
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
  );
}
