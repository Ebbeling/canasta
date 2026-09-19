import { EvalScopeError, UnknownExpressionError } from '@/domain/result';
import type { BoolExpr, KeyExpr, NumExpr } from '@/rules/schema/expression';
import { getPath } from '@/rules/expression/paths';
import { readField, type EvalContext } from './context';

function requireTeam(ctx: EvalContext, op: string): NonNullable<EvalContext['team']> {
  if (!ctx.team) throw new EvalScopeError(op);
  return ctx.team;
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return fallback;
}

function toStringList(value: unknown): readonly string[] {
  return Array.isArray(value) ? (value.filter((v) => typeof v === 'string') as string[]) : [];
}

export function evalNum(expr: NumExpr, ctx: EvalContext): number {
  switch (expr.op) {
    case 'num':
      return expr.value;

    case 'input': {
      const team = requireTeam(ctx, 'input');
      return toNumber(readField(team.input, expr.field), expr.fallback ?? 0);
    }

    case 'count': {
      const team = requireTeam(ctx, 'count');
      return toStringList(readField(team.input, expr.field)).length;
    }

    case 'config':
      return toNumber(getPath(ctx.config, expr.path), expr.fallback ?? 0);

    case 'lookup': {
      const table = getPath(ctx.config, expr.path);
      if (!Array.isArray(table)) return expr.fallback ?? 0;
      const raw = Math.trunc(evalNum(expr.index, ctx));
      let index = raw;
      if (expr.clamp) {
        index = Math.min(Math.max(raw, 0), table.length - 1);
        if (index !== raw) {
          ctx.issues.push({
            code: 'lookup.clamped',
            severity: 'warning',
            message: `Waarde ${raw} valt buiten het bereik van '${expr.path}' en is begrensd op ${index}.`,
            paths: [expr.path],
            teamId: ctx.team?.id,
          });
        }
      }
      if (index < 0 || index >= table.length) return expr.fallback ?? 0;
      return toNumber(table[index], expr.fallback ?? 0);
    }

    case 'mapLookup': {
      const map = getPath(ctx.config, expr.path);
      if (map === null || typeof map !== 'object') return expr.fallback ?? 0;
      const key = evalKey(expr.key, ctx);
      return toNumber((map as Record<string, unknown>)[key], expr.fallback ?? 0);
    }

    case 'sumOver': {
      const team = requireTeam(ctx, 'sumOver');
      const selected = toStringList(readField(team.input, expr.field));
      if (selected.length === 0) return 0;

      const entries = getPath(ctx.config, expr.path);
      if (!Array.isArray(entries)) return 0;

      const idKey = expr.idKey ?? 'id';
      const byId = new Map<string, Record<string, unknown>>();
      for (const entry of entries) {
        if (entry && typeof entry === 'object') {
          const record = entry as Record<string, unknown>;
          const id = record[idKey];
          if (typeof id === 'string') byId.set(id, record);
        }
      }

      let sum = 0;
      for (const id of selected) {
        const entry = byId.get(id);
        if (!entry) {
          ctx.issues.push({
            code: 'sumOver.unknownOption',
            severity: 'warning',
            message: `Onbekende keuze '${id}' voor '${expr.path}'; telt als 0.`,
            paths: [expr.path],
            fieldId: expr.field,
            teamId: team.id,
          });
          continue;
        }
        sum += toNumber(entry[expr.pick], 0);
      }
      return sum;
    }

    case 'sumTeams': {
      let sum = 0;
      for (const teamId of ctx.round.teamIds) {
        const input = ctx.round.inputsByTeam.get(teamId);
        if (input) sum += toNumber(readField(input, expr.field), 0);
      }
      return sum;
    }

    case 'countTeamsWhere': {
      let count = 0;
      for (const teamId of ctx.round.teamIds) {
        const input = ctx.round.inputsByTeam.get(teamId);
        if (!input) continue;
        if (evalBool(expr.where, { ...ctx, team: { id: teamId, input } })) count += 1;
      }
      return count;
    }

    case 'add':
      return expr.args.reduce((sum, arg) => sum + evalNum(arg, ctx), 0);

    case 'sub': {
      if (expr.args.length === 0) return 0;
      const [first, ...rest] = expr.args;
      return rest.reduce((acc, arg) => acc - evalNum(arg, ctx), evalNum(first!, ctx));
    }

    case 'mul':
      return expr.args.reduce((product, arg) => product * evalNum(arg, ctx), 1);

    case 'div': {
      if (expr.args.length === 0) return 0;
      const [first, ...rest] = expr.args;
      return rest.reduce(
        (acc, arg) => {
          const divisor = evalNum(arg, ctx);
          return divisor === 0 ? acc : acc / divisor;
        },
        evalNum(first!, ctx),
      );
    }

    case 'min':
      return Math.min(...expr.args.map((arg) => evalNum(arg, ctx)));

    case 'max':
      return Math.max(...expr.args.map((arg) => evalNum(arg, ctx)));

    case 'neg':
      return -evalNum(expr.arg, ctx);

    case 'clamp': {
      let value = evalNum(expr.arg, ctx);
      if (expr.min !== undefined) value = Math.max(value, expr.min);
      if (expr.max !== undefined) value = Math.min(value, expr.max);
      return value;
    }

    case 'if':
      return evalBool(expr.cond, ctx) ? evalNum(expr.then, ctx) : evalNum(expr.else, ctx);

    case 'module': {
      const module = ctx.modules.get(expr.module);
      if (!module.computeNumber) {
        throw new UnknownExpressionError(`module '${expr.module}' levert geen computeNumber`);
      }
      return module.computeNumber(ctx, expr.params);
    }

    default: {
      const exhaustive: never = expr;
      throw new UnknownExpressionError((exhaustive as { op: string }).op);
    }
  }
}

export function evalKey(expr: KeyExpr, ctx: EvalContext): string {
  switch (expr.op) {
    case 'str':
      return expr.value;
    case 'inputKey': {
      const team = requireTeam(ctx, 'inputKey');
      const value = readField(team.input, expr.field);
      return value === undefined || value === null ? '' : String(value);
    }
    case 'configKey': {
      const value = getPath(ctx.config, expr.path);
      return value === undefined || value === null ? '' : String(value);
    }
    default: {
      const exhaustive: never = expr;
      throw new UnknownExpressionError((exhaustive as { op: string }).op);
    }
  }
}

export function evalBool(expr: BoolExpr, ctx: EvalContext): boolean {
  switch (expr.op) {
    case 'bool':
      return expr.value;

    case 'inputBool': {
      const team = requireTeam(ctx, 'inputBool');
      const value = readField(team.input, expr.field);
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      if (typeof value === 'string') return value.length > 0 && value !== 'none';
      return false;
    }

    case 'configBool':
      return getPath(ctx.config, expr.path) === true;

    case 'capability':
      return ctx.capabilities[expr.name] === true;

    case 'includes': {
      const team = requireTeam(ctx, 'includes');
      return toStringList(readField(team.input, expr.field)).includes(expr.value);
    }

    case 'eqKey':
      return evalKey(expr.left, ctx) === evalKey(expr.right, ctx);

    case 'cmp': {
      const left = evalNum(expr.left, ctx);
      const right = evalNum(expr.right, ctx);
      switch (expr.cmp) {
        case 'eq':
          return left === right;
        case 'ne':
          return left !== right;
        case 'lt':
          return left < right;
        case 'lte':
          return left <= right;
        case 'gt':
          return left > right;
        case 'gte':
          return left >= right;
      }
      return false;
    }

    case 'and':
      return expr.args.every((arg) => evalBool(arg, ctx));

    case 'or':
      return expr.args.some((arg) => evalBool(arg, ctx));

    case 'not':
      return !evalBool(expr.arg, ctx);

    case 'moduleBool': {
      const module = ctx.modules.get(expr.module);
      if (!module.computeBoolean) {
        throw new UnknownExpressionError(`module '${expr.module}' levert geen computeBoolean`);
      }
      return module.computeBoolean(ctx, expr.params);
    }

    default: {
      const exhaustive: never = expr;
      throw new UnknownExpressionError((exhaustive as { op: string }).op);
    }
  }
}
