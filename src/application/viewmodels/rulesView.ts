import type { ConfigPath, Json, RuleSetId } from '@/domain/ids';
import type { InitialMeldThreshold, RuleSetConfiguration } from '@/rules/schema/configuration';
import type {
  RuleEffect,
  RuleStatus,
  SettingCategory,
  SettingDefinition,
  SettingType,
} from '@/rules/schema/setting';
import type { ConfigOverride, RuleSet, SourceMetadata } from '@/rules/schema/ruleSet';
import type { RuleModuleRegistry } from '@/rules/registry/ruleModule';
import { getPath } from '@/rules/expression/paths';
import { isVisible } from '@/application/fields/visibility';
import {
  RULE_EFFECT_LABELS,
  RULE_STATUS_LABELS,
  RULE_STATUS_MEANINGS,
  SETTING_CATEGORY_LABELS,
  SETTING_CATEGORY_ORDER,
  capabilityLabel,
} from '@/application/labels/labels';
import { formatBoolean, formatPoints, formatRange, pluralise } from '@/application/labels/format';

/**
 * Turns a rule set into display-ready sections (spec §18).
 *
 * Everything a rules screen needs is computed here: labels, formatted values,
 * status badges, provenance. React renders strings; it never reads a
 * configuration path and never decides what a rule means.
 */

export interface StatusBadgeVM {
  status: RuleStatus;
  label: string;
  meaning: string;
  /** Verbatim from provenance or `statusNote`. Never composed here. */
  note?: string;
  source?: SourceMetadata;
  /** Spec §17.1's fifth status, which the code expresses as `editable`. */
  configurable: boolean;
}

export interface RuleValueRowVM {
  label: string;
  valueText: string;
}

/**
 * One fact about a rule set, in two forms: as a labelled row for a definition
 * list, and as a self-contained phrase for the one-line summary. The phrase
 * carries its own unit, so joining phrases never produces a bare "13".
 */
export interface SummaryFactVM extends RuleValueRowVM {
  phrase: string;
}

export interface RuleValueVM {
  key: ConfigPath;
  label: string;
  help?: string;
  type: SettingType;
  valueText: string;
  /**
   * The value as stored, next to the formatted one.
   *
   * The rules screen renders `valueText`; the editor needs the raw value to
   * seed a control and hand it back unchanged. Deriving it from `valueText`
   * would mean parsing "5.000" back into a number in React, which is exactly
   * the rule knowledge the UI must not hold.
   */
  value: Json;
  /** Carried from the setting so an editor can offer and bound the choices. */
  options?: readonly { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  editable: boolean;
  effect: RuleEffect;
  effectLabel: string;
  badge: StatusBadgeVM;
  overridden: boolean;
  /** Tables and threshold staircases, already flattened into rows. */
  rows?: RuleValueRowVM[];
}

export interface RuleSectionVM {
  category: SettingCategory;
  title: string;
  values: RuleValueVM[];
}

export interface RuleSetDescription {
  id: RuleSetId;
  name: string;
  description: string;
  version: number;
  origin: 'builtin' | 'custom';
  locked: boolean;
  /** "Classic Canasta · 2 huisregels" */
  headline: string;
  /** "4 spelers · 2 teams · 11 kaarten · doel 5.000" (spec §5) */
  summaryLine: string;
  summaryFacts: SummaryFactVM[];
  source: SourceMetadata;
  additionalSources: SourceMetadata[];
  sections: RuleSectionVM[];
  /** Every value that is not plainly `verified`, for the §17 disclosure block. */
  caveats: { key: ConfigPath; label: string; badge: StatusBadgeVM }[];
  provenanceNotes?: string;
  capabilities: { key: string; label: string; enabled: boolean }[];
  overrides: { path: ConfigPath; label: string; valueText: string }[];
}

export interface DescribeOptions {
  /** Paths the game or preset deviates on, for the house-rules badge. */
  overrides?: readonly ConfigOverride[];
  modules?: RuleModuleRegistry;
}

function isThreshold(value: unknown): value is InitialMeldThreshold {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return 'required' in candidate && 'minScore' in candidate && 'maxScore' in candidate;
}

/** Formats one configuration value according to the setting's declared type. */
function formatValue(setting: SettingDefinition, raw: unknown): string {
  switch (setting.type) {
    case 'boolean':
      return formatBoolean(raw === true);

    case 'number':
      return typeof raw === 'number' ? formatPoints(raw) : '—';

    case 'select': {
      const match = setting.options?.find((option) => option.value === raw);
      return match?.label ?? (typeof raw === 'string' ? raw : '—');
    }

    case 'text':
      return typeof raw === 'string' && raw.length > 0 ? raw : '—';

    case 'numberTable':
      return Array.isArray(raw) ? `${raw.length} waarden` : '—';

    case 'thresholds':
      return Array.isArray(raw) ? pluralise(raw.length, 'grens', 'grenzen') : '—';

    default:
      // A setting type this build does not know: show it rather than hide it.
      return raw === null || raw === undefined ? '—' : String(raw);
  }
}

/** Flattens a table or staircase into labelled rows. */
function buildRows(setting: SettingDefinition, raw: unknown): RuleValueRowVM[] | undefined {
  if (setting.type === 'numberTable' && Array.isArray(raw)) {
    return raw.map((value, index) => ({
      label: setting.itemLabels?.[index] ?? String(index),
      valueText: typeof value === 'number' ? formatPoints(value) : '—',
    }));
  }

  if (setting.type === 'thresholds' && Array.isArray(raw)) {
    return raw.filter(isThreshold).map((band) => ({
      label: formatRange(band.minScore, band.maxScore),
      valueText: `${formatPoints(band.required)} punten`,
    }));
  }

  return undefined;
}

function buildBadge(ruleSet: RuleSet, setting: SettingDefinition): StatusBadgeVM {
  const provenance = ruleSet.provenance.entries.find((entry) => entry.path === setting.key);

  return {
    status: setting.status,
    label: RULE_STATUS_LABELS[setting.status] ?? setting.status,
    meaning: RULE_STATUS_MEANINGS[setting.status] ?? '',
    // The Dutch sentences the specification mandates live in the rule set data;
    // they are passed through verbatim and never rewritten here.
    note: provenance?.note ?? setting.statusNote,
    source: provenance?.source,
    configurable: setting.editable,
  };
}

function summaryFacts(configuration: RuleSetConfiguration): SummaryFactVM[] {
  const { players, teams, dealing, deck, endGame } = configuration;
  const playerCount = pluralise(players.default, 'speler', 'spelers');

  const facts: SummaryFactVM[] = [
    { label: 'Spelers', valueText: playerCount, phrase: playerCount },
  ];

  // A rule set for individual play has no meaningful team count to show.
  if (teams.mode === 'partnership') {
    const teamCount = pluralise(teams.count, 'team', 'teams');
    facts.push({ label: 'Teams', valueText: teamCount, phrase: teamCount });
  }

  facts.push(
    {
      label: 'Kaarten per speler',
      valueText: formatPoints(dealing.cardsPerPlayer),
      phrase: `${formatPoints(dealing.cardsPerPlayer)} kaarten per speler`,
    },
    {
      label: 'Kaartspel',
      valueText: `${formatPoints(deck.totalCards)} kaarten`,
      phrase: `${formatPoints(deck.totalCards)} kaarten in het spel`,
    },
    {
      label: 'Doelscore',
      valueText: `${formatPoints(endGame.targetScore)} punten`,
      phrase: `doel ${formatPoints(endGame.targetScore)} punten`,
    },
  );

  return facts;
}

export function describeRuleSet(
  ruleSet: RuleSet,
  options: DescribeOptions = {},
): RuleSetDescription {
  const overrides = options.overrides ?? [];
  const overriddenKeys = new Set(overrides.map((override) => override.path));

  const visibleSettings = ruleSet.settings
    .filter((setting) => isVisible(ruleSet, setting.visibleWhen, options.modules))
    .sort((a, b) => a.order - b.order);

  const values: RuleValueVM[] = visibleSettings.map((setting) => {
    const raw = getPath(ruleSet.configuration, setting.key);
    return {
      key: setting.key,
      label: setting.label,
      help: setting.help,
      type: setting.type,
      valueText: formatValue(setting, raw),
      value: raw as Json,
      options: setting.options,
      min: setting.min,
      max: setting.max,
      step: setting.step,
      unit: setting.unit,
      editable: setting.editable,
      effect: setting.effect,
      effectLabel: RULE_EFFECT_LABELS[setting.effect] ?? setting.effect,
      badge: buildBadge(ruleSet, setting),
      overridden: overriddenKeys.has(setting.key),
      rows: buildRows(setting, raw),
    };
  });

  const byCategory = new Map<SettingCategory, RuleValueVM[]>();
  for (const [index, value] of values.entries()) {
    const category = visibleSettings[index]!.category;
    const bucket = byCategory.get(category);
    if (bucket) bucket.push(value);
    else byCategory.set(category, [value]);
  }

  const sections: RuleSectionVM[] = [];
  for (const category of SETTING_CATEGORY_ORDER) {
    const sectionValues = byCategory.get(category);
    if (!sectionValues || sectionValues.length === 0) continue;
    sections.push({ category, title: SETTING_CATEGORY_LABELS[category], values: sectionValues });
  }
  for (const [category, sectionValues] of byCategory) {
    if (SETTING_CATEGORY_ORDER.includes(category)) continue;
    sections.push({
      category,
      title: SETTING_CATEGORY_LABELS[category] ?? category,
      values: sectionValues,
    });
  }

  const settingByKey = new Map(ruleSet.settings.map((setting) => [setting.key, setting]));

  // Every caveat the rule set records, whether or not it has a visible setting —
  // a path with no setting still deserves disclosure (spec §17).
  const caveats = ruleSet.provenance.entries.map((entry) => {
    const setting = settingByKey.get(entry.path);
    return {
      key: entry.path,
      label: setting?.label ?? entry.path,
      badge: {
        status: entry.status,
        label: RULE_STATUS_LABELS[entry.status] ?? entry.status,
        meaning: RULE_STATUS_MEANINGS[entry.status] ?? '',
        note: entry.note,
        source: entry.source,
        configurable: setting?.editable ?? false,
      } satisfies StatusBadgeVM,
    };
  });

  const houseRules =
    overrides.length > 0 ? ` · ${pluralise(overrides.length, 'huisregel', 'huisregels')}` : '';

  const facts = summaryFacts(ruleSet.configuration);

  return {
    id: ruleSet.id,
    name: ruleSet.name,
    description: ruleSet.description,
    version: ruleSet.version,
    origin: ruleSet.origin,
    locked: ruleSet.locked,
    headline: `${ruleSet.name}${houseRules}`,
    summaryLine: facts.map((fact) => fact.phrase).join(' · '),
    summaryFacts: facts,
    source: ruleSet.source,
    additionalSources: ruleSet.additionalSources ?? [],
    sections,
    caveats,
    provenanceNotes: ruleSet.provenance.notes,
    capabilities: Object.entries(ruleSet.capabilities).map(([key, enabled]) => ({
      key,
      label: capabilityLabel(key),
      enabled,
    })),
    overrides: overrides.map((override) => {
      const setting = settingByKey.get(override.path);
      return {
        path: override.path,
        label: setting?.label ?? override.path,
        valueText: setting
          ? formatValue(setting, override.value)
          : String(override.value as unknown),
      };
    }),
  };
}
