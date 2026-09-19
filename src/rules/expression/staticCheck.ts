import type { ConfigPath, FieldId, RuleModuleId } from '@/domain/ids';
import type { BoolExpr, KeyExpr, NumExpr } from '@/rules/schema/expression';

export interface ExpressionRefs {
  fields: Set<FieldId>;
  configPaths: Set<ConfigPath>;
  modules: Set<RuleModuleId>;
  /** Field references that require a team context. */
  teamScopedFields: Set<FieldId>;
  /** True when the expression contains any team-scoped operation. */
  usesTeamScope: boolean;
}

function emptyRefs(): ExpressionRefs {
  return {
    fields: new Set(),
    configPaths: new Set(),
    modules: new Set(),
    teamScopedFields: new Set(),
    usesTeamScope: false,
  };
}

function markTeamField(refs: ExpressionRefs, field: FieldId): void {
  refs.fields.add(field);
  refs.teamScopedFields.add(field);
  refs.usesTeamScope = true;
}

/**
 * Walks an expression tree and collects everything it references.
 *
 * This is what makes a hand-written rule set fail at build time rather than at
 * the card table: `validateRuleSet` checks these references against the rule
 * set's own fields, configuration and module registry.
 */
export function collectRefs(
  expr: NumExpr | BoolExpr | KeyExpr,
  refs: ExpressionRefs = emptyRefs(),
): ExpressionRefs {
  switch (expr.op) {
    case 'num':
    case 'bool':
    case 'str':
      break;

    case 'input':
    case 'count':
    case 'inputBool':
    case 'inputKey':
      markTeamField(refs, expr.field);
      break;

    case 'includes':
      markTeamField(refs, expr.field);
      break;

    case 'sumOver':
      markTeamField(refs, expr.field);
      refs.configPaths.add(expr.path);
      break;

    case 'sumTeams':
      refs.fields.add(expr.field);
      break;

    case 'config':
    case 'configBool':
    case 'configKey':
      refs.configPaths.add(expr.path);
      break;

    case 'lookup':
      refs.configPaths.add(expr.path);
      collectRefs(expr.index, refs);
      break;

    case 'mapLookup':
      refs.configPaths.add(expr.path);
      collectRefs(expr.key, refs);
      break;

    case 'countTeamsWhere':
      // The inner condition runs per team, so its team scope does not leak out.
      collectRefs(expr.where, { ...refs, usesTeamScope: false });
      collectInner(expr.where, refs);
      break;

    case 'capability':
      break;

    case 'add':
    case 'sub':
    case 'mul':
    case 'div':
    case 'min':
    case 'max':
    case 'and':
    case 'or':
      for (const arg of expr.args) collectRefs(arg, refs);
      break;

    case 'neg':
    case 'not':
      collectRefs(expr.arg, refs);
      break;

    case 'clamp':
      collectRefs(expr.arg, refs);
      break;

    case 'if':
      collectRefs(expr.cond, refs);
      collectRefs(expr.then, refs);
      collectRefs(expr.else, refs);
      break;

    case 'eqKey':
      collectRefs(expr.left, refs);
      collectRefs(expr.right, refs);
      break;

    case 'cmp':
      collectRefs(expr.left, refs);
      collectRefs(expr.right, refs);
      break;

    case 'module':
    case 'moduleBool':
      refs.modules.add(expr.module);
      break;
  }

  return refs;
}

/**
 * Collects field and config references from a nested expression without letting
 * its team scope propagate to the parent.
 */
function collectInner(expr: NumExpr | BoolExpr | KeyExpr, target: ExpressionRefs): void {
  const inner = collectRefs(expr);
  for (const field of inner.fields) target.fields.add(field);
  for (const path of inner.configPaths) target.configPaths.add(path);
  for (const moduleId of inner.modules) target.modules.add(moduleId);
}

export function newRefs(): ExpressionRefs {
  return emptyRefs();
}
