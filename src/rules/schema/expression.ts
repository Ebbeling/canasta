import type { ConfigPath, FieldId, Json, RuleModuleId } from '@/domain/ids';

/**
 * A small, closed, JSON-serialisable expression language.
 *
 * This is what makes scoring declarative without putting JavaScript in JSON:
 * every rule computes its value from `config`, `capabilities` and the round
 * input. There is no `eval`, the tree survives IndexedDB and JSON export
 * unchanged, and `staticCheck` can prove at build time that every referenced
 * field and config path exists.
 *
 * See CANASTA_PWA_SPECIFICATION.md §15.
 */
export type NumExpr =
  | { op: 'num'; value: number }
  /** Numeric value of a round-input field for the current team. */
  | { op: 'input'; field: FieldId; fallback?: number }
  /** Number of selected options in a multiselect field. */
  | { op: 'count'; field: FieldId }
  /** Numeric value at a configuration path. */
  | { op: 'config'; path: ConfigPath; fallback?: number }
  /** Index into a numeric array in the configuration, e.g. the red-three table. */
  | { op: 'lookup'; path: ConfigPath; index: NumExpr; clamp?: boolean; fallback?: number }
  /** Look up a keyed numeric map in the configuration, e.g. the going-out map. */
  | { op: 'mapLookup'; path: ConfigPath; key: KeyExpr; fallback?: number }
  /**
   * Sum a property over the configuration entries selected by a multiselect
   * field. This is what makes special hands and incomplete-meld penalties data
   * rather than code.
   */
  | { op: 'sumOver'; field: FieldId; path: ConfigPath; idKey?: string; pick: string }
  /** Sum a field across every team in the round (round scope). */
  | { op: 'sumTeams'; field: FieldId }
  /** Count the teams for which a condition holds (round scope). */
  | { op: 'countTeamsWhere'; where: BoolExpr }
  | { op: 'add' | 'sub' | 'mul' | 'div' | 'min' | 'max'; args: NumExpr[] }
  | { op: 'neg'; arg: NumExpr }
  | { op: 'clamp'; arg: NumExpr; min?: number; max?: number }
  | { op: 'if'; cond: BoolExpr; then: NumExpr; else: NumExpr }
  /** Escape hatch: a named module, looked up by id — never by variant. */
  | { op: 'module'; module: RuleModuleId; params?: Json };

export type KeyExpr =
  | { op: 'str'; value: string }
  | { op: 'inputKey'; field: FieldId }
  | { op: 'configKey'; path: ConfigPath };

export type BoolExpr =
  | { op: 'bool'; value: boolean }
  | { op: 'inputBool'; field: FieldId }
  | { op: 'configBool'; path: ConfigPath }
  | { op: 'capability'; name: string }
  /** True when a multiselect field contains the given option value. */
  | { op: 'includes'; field: FieldId; value: string }
  | { op: 'eqKey'; left: KeyExpr; right: KeyExpr }
  | { op: 'cmp'; cmp: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte'; left: NumExpr; right: NumExpr }
  | { op: 'and' | 'or'; args: BoolExpr[] }
  | { op: 'not'; arg: BoolExpr }
  | { op: 'moduleBool'; module: RuleModuleId; params?: Json };

/** Operations that need a team context; using them in round scope throws. */
export const TEAM_SCOPED_OPS = new Set([
  'input',
  'count',
  'inputBool',
  'includes',
  'inputKey',
  'sumOver',
]);
