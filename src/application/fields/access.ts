import type { FieldId, TeamId } from '@/domain/ids';
import { emptyTeamRoundInput, type TeamRoundInput } from '@/domain/round';
import { isCanonicalField, type FieldType, type ScoreInputValue } from '@/rules/schema/field';

/**
 * Reading and writing a round input **by field id**.
 *
 * This is the only place that knows about the canonical/`extra` split. The UI
 * holds a `TeamRoundInput` and a `FieldDefinition` and never asks which half a
 * field lives in.
 */

/** A field's identity and type — the minimum needed to read or write it. */
export interface FieldRef {
  id: FieldId;
  type: FieldType;
  min?: number;
  max?: number;
  defaultValue: ScoreInputValue;
}

export function readFieldValue(
  input: TeamRoundInput,
  fieldId: FieldId,
): ScoreInputValue | undefined {
  if (isCanonicalField(fieldId)) return input[fieldId];
  return input.extra[fieldId];
}

/**
 * Coerces raw UI input into the shape the field declares.
 *
 * Anything unparseable falls back to the field's default rather than producing
 * `NaN`, which would silently poison a score.
 */
export function coerceFieldValue(field: FieldRef, raw: unknown): ScoreInputValue {
  switch (field.type) {
    case 'points':
    case 'count': {
      const parsed = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? ''));
      if (!Number.isFinite(parsed))
        return typeof field.defaultValue === 'number' ? field.defaultValue : 0;
      let value = field.type === 'count' ? Math.round(parsed) : parsed;
      if (field.min !== undefined) value = Math.max(value, field.min);
      if (field.max !== undefined) value = Math.min(value, field.max);
      return value;
    }

    case 'boolean':
      return raw === true || raw === 'true';

    case 'choice':
      return typeof raw === 'string' ? raw : String(raw ?? '');

    case 'multiselect':
      return Array.isArray(raw)
        ? raw.filter((item): item is string => typeof item === 'string')
        : [];

    default:
      // An unknown type reaches here only from a rule set this build does not
      // understand; hand the value back untouched rather than mangling it.
      return raw as ScoreInputValue;
  }
}

/**
 * Returns a copy of `input` with one field set.
 *
 * Crucially, it writes exactly one key and leaves the rest of `extra` alone. A
 * field this app version cannot render therefore survives an edit to a
 * neighbouring field instead of being dropped on save.
 */
export function writeFieldValue(
  input: TeamRoundInput,
  field: FieldRef,
  value: ScoreInputValue,
): TeamRoundInput {
  if (isCanonicalField(field.id)) {
    return { ...input, extra: { ...input.extra }, [field.id]: value } as TeamRoundInput;
  }
  return { ...input, extra: { ...input.extra, [field.id]: value } };
}

/** A blank input with every declared field seeded from its default. */
export function blankInput(teamId: TeamId, fields: readonly FieldRef[]): TeamRoundInput {
  let input = emptyTeamRoundInput(teamId);
  for (const field of fields) {
    input = writeFieldValue(input, field, field.defaultValue);
  }
  return input;
}
