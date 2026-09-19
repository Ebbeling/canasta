import type { ConfigPath, FieldId, TeamId } from './ids';

export type IssueSeverity = 'error' | 'warning';

/**
 * A single validation finding. `message` is Dutch and user-facing; `code` is the
 * stable identifier tests assert on.
 */
export interface ValidationIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
  /** Configuration paths this issue points at, so a form can attach it to a field. */
  paths?: ConfigPath[];
  /** Round-input field this issue points at. */
  fieldId?: FieldId;
  teamId?: TeamId;
}

export type Result<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T>(issues: ValidationIssue[]): Result<T> {
  return { ok: false, issues };
}

export function hasErrors(issues: readonly ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}

/** Substitutes `{name}` placeholders in a message with the given values. */
export function formatMessage(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/** Thrown when an expression uses a team-scoped operation outside a team context. */
export class EvalScopeError extends Error {
  constructor(op: string) {
    super(`Expressie-operatie '${op}' vereist een teamcontext maar draait in rondecontext.`);
    this.name = 'EvalScopeError';
  }
}

/** Thrown when an expression references a rule module that is not registered. */
export class UnknownRuleModuleError extends Error {
  constructor(moduleId: string) {
    super(`Onbekende rule module: '${moduleId}'.`);
    this.name = 'UnknownRuleModuleError';
  }
}

/** Thrown when an expression node has an `op` the evaluator does not know. */
export class UnknownExpressionError extends Error {
  constructor(op: string) {
    super(`Onbekende expressie-operatie: '${op}'.`);
    this.name = 'UnknownExpressionError';
  }
}
