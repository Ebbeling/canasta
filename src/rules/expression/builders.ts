import type { ConfigPath, FieldId } from '@/domain/ids';
import type { BoolExpr, KeyExpr, NumExpr } from '@/rules/schema/expression';

/** Small constructors so built-in rule sets read as rules, not as JSON. */

export const num = (value: number): NumExpr => ({ op: 'num', value });

export const input = (field: FieldId, fallback?: number): NumExpr => ({
  op: 'input',
  field,
  ...(fallback === undefined ? {} : { fallback }),
});

export const count = (field: FieldId): NumExpr => ({ op: 'count', field });

export const config = (path: ConfigPath, fallback?: number): NumExpr => ({
  op: 'config',
  path,
  ...(fallback === undefined ? {} : { fallback }),
});

export const lookup = (path: ConfigPath, index: NumExpr, clamp = true): NumExpr => ({
  op: 'lookup',
  path,
  index,
  clamp,
});

export const mapLookup = (path: ConfigPath, key: KeyExpr, fallback = 0): NumExpr => ({
  op: 'mapLookup',
  path,
  key,
  fallback,
});

export const sumOver = (field: FieldId, path: ConfigPath, pick: string, idKey = 'id'): NumExpr => ({
  op: 'sumOver',
  field,
  path,
  pick,
  idKey,
});

export const sumTeams = (field: FieldId): NumExpr => ({ op: 'sumTeams', field });

export const countTeamsWhere = (where: BoolExpr): NumExpr => ({ op: 'countTeamsWhere', where });

export const add = (...args: NumExpr[]): NumExpr => ({ op: 'add', args });
export const sub = (...args: NumExpr[]): NumExpr => ({ op: 'sub', args });
export const mul = (...args: NumExpr[]): NumExpr => ({ op: 'mul', args });
export const neg = (arg: NumExpr): NumExpr => ({ op: 'neg', arg });

export const ifElse = (cond: BoolExpr, then: NumExpr, otherwise: NumExpr): NumExpr => ({
  op: 'if',
  cond,
  then,
  else: otherwise,
});

export const str = (value: string): KeyExpr => ({ op: 'str', value });
export const inputKey = (field: FieldId): KeyExpr => ({ op: 'inputKey', field });

export const bool = (value: boolean): BoolExpr => ({ op: 'bool', value });
export const inputBool = (field: FieldId): BoolExpr => ({ op: 'inputBool', field });
export const configBool = (path: ConfigPath): BoolExpr => ({ op: 'configBool', path });
export const capability = (name: string): BoolExpr => ({ op: 'capability', name });
export const includes = (field: FieldId, value: string): BoolExpr => ({
  op: 'includes',
  field,
  value,
});

export const and = (...args: BoolExpr[]): BoolExpr => ({ op: 'and', args });
export const or = (...args: BoolExpr[]): BoolExpr => ({ op: 'or', args });
export const not = (arg: BoolExpr): BoolExpr => ({ op: 'not', arg });

export const cmp = (
  operator: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte',
  left: NumExpr,
  right: NumExpr,
): BoolExpr => ({ op: 'cmp', cmp: operator, left, right });

export const gte = (left: NumExpr, right: NumExpr): BoolExpr => cmp('gte', left, right);
export const lte = (left: NumExpr, right: NumExpr): BoolExpr => cmp('lte', left, right);
export const gt = (left: NumExpr, right: NumExpr): BoolExpr => cmp('gt', left, right);
export const eq = (left: NumExpr, right: NumExpr): BoolExpr => cmp('eq', left, right);
