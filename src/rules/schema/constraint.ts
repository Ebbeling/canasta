import type { ConfigPath, FieldId, Json, RuleModuleId } from '@/domain/ids';
import type { IssueSeverity } from '@/domain/result';
import type { BoolExpr } from './expression';

/** A check on the configuration itself (spec §30). */
export type ConstraintDefinition =
  | {
      id: string;
      kind: 'expr';
      severity: IssueSeverity;
      message: string;
      assert: BoolExpr;
      paths: readonly ConfigPath[];
    }
  | {
      id: string;
      kind: 'module';
      severity: IssueSeverity;
      module: RuleModuleId;
      params?: Json;
      paths: readonly ConfigPath[];
    };

/**
 * A check on a round's input (spec §14.1, `validateRound`). Never affects the
 * score — warnings in particular must not block entry at the card table.
 */
export type RoundRuleDefinition =
  | {
      id: string;
      kind: 'expr';
      scope: 'team' | 'round';
      severity: IssueSeverity;
      message: string;
      assert: BoolExpr;
      appliesWhen?: BoolExpr;
      fieldId?: FieldId;
      /** Values available to `{placeholder}` substitution in `message`. */
      messageValues?: Record<string, ConfigPath>;
    }
  | {
      id: string;
      kind: 'module';
      scope: 'team' | 'round';
      severity: IssueSeverity;
      module: RuleModuleId;
      params?: Json;
    };
