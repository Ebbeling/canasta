import type { ScoreRuleId } from '@/domain/ids';
import type { BoolExpr, NumExpr } from './expression';

export type ScoreLineKind = 'cards' | 'bonus' | 'penalty';

/**
 * One line in the breakdown (spec §22). Deliberately distinct from
 * `FieldDefinition`: a field is what the UI *asks*, a scoring rule is what the
 * breakdown *shows*. They are linked only through field ids inside expressions,
 * which is what lets one input feed several rules.
 */
export interface ScoreRuleDefinition {
  id: ScoreRuleId;
  /** Dutch, user-facing; appears in the breakdown. */
  label: string;
  kind: ScoreLineKind;
  /** Already signed: a penalty rule computes a negative value. */
  compute: NumExpr;
  /** When present and false, the rule is skipped entirely — no line at all. */
  appliesWhen?: BoolExpr;
  /** Emit a line even when the value is 0. Default false. */
  includeZero?: boolean;
  /**
   * Named sub-values resolved alongside the total, so the UI can render the
   * tap-to-explain panel of spec §38 without the engine producing prose.
   */
  detail?: Record<string, NumExpr>;
  /** e.g. "{count} natuurlijke Canasta('s)\nBonus: +{unitValue} per stuk" */
  explainTemplate?: string;
  order: number;
}
