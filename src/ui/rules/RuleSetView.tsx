import type {
  RuleSetDescription,
  RuleValueVM,
  StatusBadgeVM,
} from '@/application/viewmodels/rulesView';
import { Card, Muted, SectionTitle } from '@/ui/common/primitives';

/** Read-only rendering of a rule set. Every string comes from the view model. */

function StatusBadge({ badge }: { badge: StatusBadgeVM }) {
  if (badge.status === 'verified' && !badge.configurable) return null;

  return (
    <span className="ml-2 whitespace-nowrap rounded-full bg-[--color-panel-muted] px-2 py-0.5 text-xs">
      {badge.status === 'verified' ? 'Instelbaar' : badge.label}
      {badge.status !== 'verified' && badge.configurable ? ' · instelbaar' : ''}
    </span>
  );
}

function ValueRow({ value }: { value: RuleValueVM }) {
  return (
    <li className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0">
          {value.label}
          <StatusBadge badge={value.badge} />
          {value.overridden ? (
            <span className="ml-2 rounded-full bg-[--color-accent] px-2 py-0.5 text-xs text-[--color-accent-ink]">
              Huisregel
            </span>
          ) : null}
        </span>
        {value.rows ? null : (
          <span className="shrink-0 tabular">
            {value.valueText}
            {value.unit ? ` ${value.unit}` : ''}
          </span>
        )}
      </div>

      {value.rows ? (
        <ul className="mt-1 space-y-0.5 text-sm">
          {value.rows.map((row) => (
            <li key={row.label} className="flex justify-between gap-3">
              <span className="text-[--color-ink-muted]">{row.label}</span>
              <span className="tabular">{row.valueText}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {value.help ? <p className="mt-1 text-xs text-[--color-ink-muted]">{value.help}</p> : null}
      <p className="mt-0.5 text-xs text-[--color-ink-muted]">{value.effectLabel}</p>
    </li>
  );
}

export function RuleSetView({ description }: { description: RuleSetDescription }) {
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-semibold">{description.headline}</h2>
        <Muted>{description.description}</Muted>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          {description.summaryFacts.map((fact) => (
            <div key={fact.label}>
              <dt className="text-[--color-ink-muted]">{fact.label}</dt>
              <dd className="tabular">{fact.valueText}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {description.sections.map((section) => (
        <Card key={section.category}>
          <SectionTitle>{section.title}</SectionTitle>
          <ul className="mt-1 divide-y divide-[--color-border] text-sm">
            {section.values.map((value) => (
              <ValueRow key={value.key} value={value} />
            ))}
          </ul>
        </Card>
      ))}

      {description.caveats.length > 0 ? (
        <Card>
          <SectionTitle>Waar deze regelset niet zeker over is</SectionTitle>
          <ul className="mt-2 space-y-3 text-sm">
            {description.caveats.map((caveat) => (
              <li key={caveat.key}>
                <p className="font-medium">
                  {caveat.label}
                  <StatusBadge badge={caveat.badge} />
                </p>
                {/* Verbatim from the rule set; never rewritten in the UI. */}
                <p className="text-[--color-ink-muted]">{caveat.badge.note}</p>
                {caveat.badge.source ? (
                  <p className="text-xs text-[--color-ink-muted]">
                    Bron: {caveat.badge.source.name}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          {description.provenanceNotes ? (
            <p className="mt-3 text-xs text-[--color-ink-muted]">{description.provenanceNotes}</p>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Bronnen</SectionTitle>
        <ul className="mt-2 space-y-1 text-sm">
          {[description.source, ...description.additionalSources].map((source) => (
            <li key={`${source.name}-${source.title ?? ''}`}>
              {source.url ? (
                <a href={source.url} className="underline" target="_blank" rel="noreferrer">
                  {source.name}
                  {source.title ? ` — ${source.title}` : ''}
                </a>
              ) : (
                <span>{source.name}</span>
              )}
              {source.retrievedAt ? (
                <span className="text-[--color-ink-muted]"> (opgehaald {source.retrievedAt})</span>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
