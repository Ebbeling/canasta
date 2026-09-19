import { describe, expect, it } from 'vitest';
import { evalBool, evalKey, evalNum } from './evaluate';
import type { EvalContext } from './context';
import { EvalScopeError, UnknownRuleModuleError } from '@/domain/result';
import type { BoolExpr, NumExpr } from '@/rules/schema/expression';
import { createRuleModuleRegistry } from '@/rules/registry/moduleRegistry';
import type { RuleModule } from '@/rules/registry/ruleModule';
import type { RuleSet } from '@/rules/schema/ruleSet';
import { classic } from '@/rules/builtin';
import { TEAM_A, TEAM_B, teamInput } from '@/test/fixtures';

const doubler: RuleModule = {
  id: 'test.doubler',
  version: 1,
  description: 'Verdubbelt een parameter; alleen voor tests.',
  computeNumber: (_ctx, params) => ((params as { value: number }).value ?? 0) * 2,
  computeBoolean: (_ctx, params) => (params as { yes: boolean }).yes === true,
};

function makeContext(options: { withTeam?: boolean } = {}): EvalContext {
  const inputA = teamInput(TEAM_A, {
    cardPoints: 420,
    naturalCanastas: 2,
    redThrees: 3,
    opened: true,
    wentOut: true,
    extra: { specialHands: ['garbage', 'pairs'], label: 'normal' },
  });
  const inputB = teamInput(TEAM_B, { redThrees: 1 });

  const ctx: EvalContext = {
    ruleSet: classic as RuleSet,
    config: classic.configuration,
    capabilities: classic.capabilities,
    modules: createRuleModuleRegistry([doubler]),
    round: {
      number: 1,
      teamIds: [TEAM_A, TEAM_B],
      inputsByTeam: new Map([
        [TEAM_A, inputA],
        [TEAM_B, inputB],
      ]),
    },
    standings: { scoreBefore: { [TEAM_A]: 0, [TEAM_B]: 0 } },
    issues: [],
  };

  return options.withTeam === false ? ctx : { ...ctx, team: { id: TEAM_A, input: inputA } };
}

const n = (expr: NumExpr) => evalNum(expr, makeContext());
const b = (expr: BoolExpr) => evalBool(expr, makeContext());

describe('numeric operations', () => {
  it('reads literals and inputs', () => {
    expect(n({ op: 'num', value: 7 })).toBe(7);
    expect(n({ op: 'input', field: 'cardPoints' })).toBe(420);
  });

  it('falls back when an input field is absent', () => {
    expect(n({ op: 'input', field: 'nietBestaand', fallback: 42 })).toBe(42);
    expect(n({ op: 'input', field: 'nietBestaand' })).toBe(0);
  });

  it('counts the selections of a multiselect field', () => {
    expect(n({ op: 'count', field: 'specialHands' })).toBe(2);
    expect(n({ op: 'count', field: 'nietBestaand' })).toBe(0);
  });

  it('reads configuration values and falls back on unknown paths', () => {
    expect(n({ op: 'config', path: 'scoring.canastas.natural' })).toBe(500);
    expect(n({ op: 'config', path: 'scoring.canastas.samba', fallback: 99 })).toBe(99);
  });

  it('looks up an indexed table', () => {
    const table = (index: number, clamp = true): NumExpr => ({
      op: 'lookup',
      path: 'threes.red.valueByCount',
      index: { op: 'num', value: index },
      clamp,
    });

    expect(n(table(0))).toBe(0);
    expect(n(table(4))).toBe(800);
  });

  it('clamps an out-of-range index and records a warning', () => {
    const ctx = makeContext();
    const value = evalNum(
      {
        op: 'lookup',
        path: 'threes.red.valueByCount',
        index: { op: 'num', value: 9 },
        clamp: true,
      },
      ctx,
    );

    expect(value).toBe(800);
    expect(ctx.issues.map((issue) => issue.code)).toEqual(['lookup.clamped']);
  });

  it('returns the fallback for an out-of-range index when clamping is off', () => {
    expect(
      n({
        op: 'lookup',
        path: 'threes.red.valueByCount',
        index: { op: 'num', value: 9 },
        clamp: false,
        fallback: -1,
      }),
    ).toBe(-1);
  });

  it('looks up a keyed map, with a fallback for a missing key', () => {
    expect(
      n({
        op: 'mapLookup',
        path: 'scoring.goingOut',
        key: { op: 'str', value: 'concealed' },
      }),
    ).toBe(200);

    expect(
      n({
        op: 'mapLookup',
        path: 'scoring.goingOut',
        key: { op: 'str', value: 'onbekend' },
        fallback: 17,
      }),
    ).toBe(17);
  });

  it('sums a property over the selected configuration entries', () => {
    const ctx = makeContext();
    ctx.config = {
      ...classic.configuration,
      specialHands: {
        enabled: true,
        mode: 'replace',
        hands: [
          { id: 'garbage', label: 'Garbage', bonus: 3000 },
          { id: 'pairs', label: 'Pairs', bonus: 2500 },
        ],
      },
    };

    const value = evalNum(
      { op: 'sumOver', field: 'specialHands', path: 'specialHands.hands', pick: 'bonus' },
      ctx,
    );

    expect(value).toBe(5500);
  });

  it('scores an unknown selection as zero and warns', () => {
    const ctx = makeContext();
    ctx.config = {
      ...classic.configuration,
      specialHands: {
        enabled: true,
        mode: 'replace',
        hands: [{ id: 'garbage', label: 'Garbage', bonus: 3000 }],
      },
    };

    const value = evalNum(
      { op: 'sumOver', field: 'specialHands', path: 'specialHands.hands', pick: 'bonus' },
      ctx,
    );

    expect(value).toBe(3000);
    expect(ctx.issues.map((issue) => issue.code)).toEqual(['sumOver.unknownOption']);
  });

  it('sums a field across every team', () => {
    expect(n({ op: 'sumTeams', field: 'redThrees' })).toBe(4);
  });

  it('counts the teams matching a condition', () => {
    expect(n({ op: 'countTeamsWhere', where: { op: 'inputBool', field: 'wentOut' } })).toBe(1);
  });

  it('applies arithmetic in the right order', () => {
    const args = [
      { op: 'num', value: 10 },
      { op: 'num', value: 3 },
      { op: 'num', value: 2 },
    ] satisfies NumExpr[];

    expect(n({ op: 'add', args })).toBe(15);
    expect(n({ op: 'sub', args })).toBe(5);
    expect(n({ op: 'mul', args })).toBe(60);
    expect(n({ op: 'div', args })).toBeCloseTo(10 / 3 / 2);
    expect(n({ op: 'min', args })).toBe(2);
    expect(n({ op: 'max', args })).toBe(10);
  });

  it('never divides by zero', () => {
    expect(
      n({
        op: 'div',
        args: [
          { op: 'num', value: 10 },
          { op: 'num', value: 0 },
        ],
      }),
    ).toBe(10);
  });

  it('negates and clamps', () => {
    expect(n({ op: 'neg', arg: { op: 'num', value: 5 } })).toBe(-5);
    expect(n({ op: 'clamp', arg: { op: 'num', value: 15 }, min: 0, max: 10 })).toBe(10);
    expect(n({ op: 'clamp', arg: { op: 'num', value: -5 }, min: 0, max: 10 })).toBe(0);
  });

  it('takes both branches of a conditional', () => {
    const conditional = (cond: boolean): NumExpr => ({
      op: 'if',
      cond: { op: 'bool', value: cond },
      then: { op: 'num', value: 1 },
      else: { op: 'num', value: 2 },
    });

    expect(n(conditional(true))).toBe(1);
    expect(n(conditional(false))).toBe(2);
  });

  it('evaluates a deeply nested expression', () => {
    expect(
      n({
        op: 'add',
        args: [
          {
            op: 'mul',
            args: [
              { op: 'num', value: 3 },
              { op: 'num', value: 4 },
            ],
          },
          {
            op: 'neg',
            arg: {
              op: 'sub',
              args: [
                { op: 'num', value: 10 },
                { op: 'num', value: 4 },
              ],
            },
          },
        ],
      }),
    ).toBe(6);
  });
});

describe('boolean operations', () => {
  it('reads booleans from input, configuration and capabilities', () => {
    expect(b({ op: 'inputBool', field: 'wentOut' })).toBe(true);
    expect(b({ op: 'inputBool', field: 'concealedGoingOut' })).toBe(false);
    expect(b({ op: 'configBool', path: 'threes.red.requiresMeld' })).toBe(true);
    expect(b({ op: 'capability', name: 'redThrees' })).toBe(true);
    expect(b({ op: 'capability', name: 'specialHands' })).toBe(false);
  });

  it('treats a non-zero number and a meaningful string as true', () => {
    expect(b({ op: 'inputBool', field: 'redThrees' })).toBe(true);
    expect(b({ op: 'inputBool', field: 'label' })).toBe(true);
  });

  it('tests membership of a multiselect', () => {
    expect(b({ op: 'includes', field: 'specialHands', value: 'garbage' })).toBe(true);
    expect(b({ op: 'includes', field: 'specialHands', value: 'straight' })).toBe(false);
  });

  it('compares numbers with every operator', () => {
    const compare = (op: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte'): boolean =>
      b({ op: 'cmp', cmp: op, left: { op: 'num', value: 3 }, right: { op: 'num', value: 5 } });

    expect([compare('eq'), compare('ne'), compare('lt')]).toEqual([false, true, true]);
    expect([compare('lte'), compare('gt'), compare('gte')]).toEqual([true, false, false]);
  });

  it('combines conditions', () => {
    const yes: BoolExpr = { op: 'bool', value: true };
    const no: BoolExpr = { op: 'bool', value: false };

    expect(b({ op: 'and', args: [yes, no] })).toBe(false);
    expect(b({ op: 'or', args: [yes, no] })).toBe(true);
    expect(b({ op: 'not', arg: no })).toBe(true);
  });

  it('compares keys', () => {
    expect(
      b({
        op: 'eqKey',
        left: { op: 'inputKey', field: 'label' },
        right: { op: 'str', value: 'normal' },
      }),
    ).toBe(true);
  });
});

describe('key operations', () => {
  it('reads literal, input and configuration keys', () => {
    const ctx = makeContext();
    expect(evalKey({ op: 'str', value: 'x' }, ctx)).toBe('x');
    expect(evalKey({ op: 'inputKey', field: 'label' }, ctx)).toBe('normal');
    expect(evalKey({ op: 'configKey', path: 'teams.mode' }, ctx)).toBe('partnership');
    expect(evalKey({ op: 'inputKey', field: 'nietBestaand' }, ctx)).toBe('');
  });
});

describe('scope is enforced, not silently defaulted', () => {
  const roundCtx = makeContext({ withTeam: false });

  it.each([
    ['input', { op: 'input', field: 'cardPoints' } as NumExpr],
    ['count', { op: 'count', field: 'specialHands' } as NumExpr],
    [
      'sumOver',
      {
        op: 'sumOver',
        field: 'specialHands',
        path: 'specialHands.hands',
        pick: 'bonus',
      } as NumExpr,
    ],
  ])('throws EvalScopeError for %s in round scope', (_name, expr) => {
    expect(() => evalNum(expr, roundCtx)).toThrow(EvalScopeError);
  });

  it('throws EvalScopeError for inputBool and includes in round scope', () => {
    expect(() => evalBool({ op: 'inputBool', field: 'wentOut' }, roundCtx)).toThrow(EvalScopeError);
    expect(() =>
      evalBool({ op: 'includes', field: 'specialHands', value: 'garbage' }, roundCtx),
    ).toThrow(EvalScopeError);
  });

  it('still allows round-scoped operations without a team', () => {
    expect(evalNum({ op: 'sumTeams', field: 'redThrees' }, roundCtx)).toBe(4);
    expect(evalNum({ op: 'config', path: 'endGame.targetScore' }, roundCtx)).toBe(5000);
  });
});

describe('rule modules', () => {
  it('dispatches numeric and boolean calls to the registry', () => {
    expect(n({ op: 'module', module: 'test.doubler', params: { value: 21 } })).toBe(42);
    expect(b({ op: 'moduleBool', module: 'test.doubler', params: { yes: true } })).toBe(true);
  });

  it('throws for an unregistered module id', () => {
    expect(() => n({ op: 'module', module: 'test.ontbreekt' })).toThrow(UnknownRuleModuleError);
  });
});
