import type { ConfigPath, FieldId } from '@/domain/ids';
import type { BoolExpr } from './expression';

/**
 * The canonical field catalogue: concepts every Canasta variant shares
 * (spec §14.3, §35 "shared concepts"). RoundInput carries these as named
 * properties so it is rule-set independent; a rule set decides which of them
 * are visible, required or relevant.
 */
export const CANONICAL_FIELDS = [
  'cardPoints',
  'cardsInHand',
  'naturalCanastas',
  'mixedCanastas',
  'redThrees',
  'opened',
  'wentOut',
  'concealedGoingOut',
] as const;

export type CanonicalFieldId = (typeof CANONICAL_FIELDS)[number];

export function isCanonicalField(id: string): id is CanonicalFieldId {
  return (CANONICAL_FIELDS as readonly string[]).includes(id);
}

export type FieldType = 'points' | 'count' | 'choice' | 'boolean' | 'multiselect';

export type ScoreInputValue = number | string | boolean | readonly string[];

export type FieldCategory = 'cards' | 'canastas' | 'threes' | 'goingOut' | 'penalties' | 'special';

export interface FieldOption {
  value: string;
  label: string;
}

/**
 * What the UI asks for in a round (spec §21). Rendered from a registry keyed by
 * `type`, so no Classic- or Modern-specific field ever appears in React code.
 */
export interface FieldDefinition {
  id: FieldId;
  type: FieldType;
  /** Dutch, user-facing. */
  label: string;
  hint?: string;
  category: FieldCategory;
  order: number;
  defaultValue: ScoreInputValue;
  min?: number;
  max?: number;
  step?: number;
  /** For `choice`. */
  options?: readonly FieldOption[];
  /** For `multiselect`: read the options from this configuration path. */
  optionsFrom?: ConfigPath;
  /** Property on those configuration entries to use as the label. */
  optionsLabelKey?: string;
  /** Shown only when this evaluates true. Declarative, never a function. */
  visibleWhen?: BoolExpr;
}
