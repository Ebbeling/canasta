import type { FieldId } from '@/domain/ids';
import type {
  FieldCategory,
  FieldDefinition,
  FieldType,
  ScoreInputValue,
} from '@/rules/schema/field';
import type { RuleSet } from '@/rules/schema/ruleSet';
import type { RuleModuleRegistry } from '@/rules/registry/ruleModule';
import { getPath } from '@/rules/expression/paths';
import { isVisible } from '@/application/fields/visibility';
import {
  FIELD_CATEGORY_LABELS,
  FIELD_CATEGORY_ORDER,
  FIELD_TYPE_INPUT_MODE,
} from '@/application/labels/labels';

/**
 * The round-entry form, derived entirely from the rule set's field metadata.
 *
 * Pure and static: `visibleWhen` cannot read input (see `visibility.ts`), so
 * this runs once per rule set and never again while typing.
 */

export interface FieldOptionVM {
  value: string;
  label: string;
}

export interface FieldVM {
  id: FieldId;
  type: FieldType;
  label: string;
  hint?: string;
  category: FieldCategory;
  order: number;
  defaultValue: ScoreInputValue;
  min?: number;
  max?: number;
  step?: number;
  options: FieldOptionVM[];
  /** True when this value lives in `TeamRoundInput.extra`. */
  isExtra: boolean;
  inputMode: 'numeric' | 'none';
}

export interface FieldGroupVM {
  category: FieldCategory;
  title: string;
  fields: FieldVM[];
}

const CANONICAL = new Set<string>([
  'cardPoints',
  'cardsInHand',
  'naturalCanastas',
  'mixedCanastas',
  'redThrees',
  'opened',
  'wentOut',
  'concealedGoingOut',
]);

/**
 * Resolves the options of a `multiselect` from the configuration path it points
 * at. The option value is the entry's `id`, matching `sumOver`'s default
 * `idKey`, so a selection lines up with the scoring rule that consumes it.
 */
function resolveOptions(ruleSet: RuleSet, field: FieldDefinition): FieldOptionVM[] {
  if (field.options) {
    return field.options.map((option) => ({ value: option.value, label: option.label }));
  }
  if (!field.optionsFrom) return [];

  const entries = getPath(ruleSet.configuration, field.optionsFrom);
  if (!Array.isArray(entries)) return [];

  const labelKey = field.optionsLabelKey ?? 'label';
  const options: FieldOptionVM[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const value = record.id;
    if (typeof value !== 'string') continue;
    const label = record[labelKey];
    options.push({ value, label: typeof label === 'string' ? label : value });
  }

  return options;
}

export function toFieldVM(ruleSet: RuleSet, field: FieldDefinition): FieldVM {
  return {
    id: field.id,
    type: field.type,
    label: field.label,
    hint: field.hint,
    category: field.category,
    order: field.order,
    defaultValue: field.defaultValue,
    min: field.min,
    max: field.max,
    step: field.step,
    options: resolveOptions(ruleSet, field),
    isExtra: !CANONICAL.has(field.id),
    inputMode: FIELD_TYPE_INPUT_MODE[field.type] ?? 'none',
  };
}

/** The visible fields of a rule set, grouped and ordered for display. */
export function buildFieldLayout(ruleSet: RuleSet, modules?: RuleModuleRegistry): FieldGroupVM[] {
  const visible = ruleSet.fields
    .filter((field) => isVisible(ruleSet, field.visibleWhen, modules))
    .map((field) => toFieldVM(ruleSet, field))
    .sort((a, b) => a.order - b.order);

  const byCategory = new Map<FieldCategory, FieldVM[]>();
  for (const field of visible) {
    const bucket = byCategory.get(field.category);
    if (bucket) bucket.push(field);
    else byCategory.set(field.category, [field]);
  }

  const groups: FieldGroupVM[] = [];
  for (const category of FIELD_CATEGORY_ORDER) {
    const fields = byCategory.get(category);
    if (!fields || fields.length === 0) continue;
    groups.push({ category, title: FIELD_CATEGORY_LABELS[category], fields });
  }

  // A category the order list does not mention still gets rendered, at the end,
  // rather than disappearing.
  for (const [category, fields] of byCategory) {
    if (FIELD_CATEGORY_ORDER.includes(category)) continue;
    groups.push({ category, title: FIELD_CATEGORY_LABELS[category] ?? category, fields });
  }

  return groups;
}

/** Flat list of the visible fields, for seeding a blank input. */
export function visibleFields(ruleSet: RuleSet, modules?: RuleModuleRegistry): FieldVM[] {
  return buildFieldLayout(ruleSet, modules).flatMap((group) => group.fields);
}
