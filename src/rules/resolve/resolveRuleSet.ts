import type { ConfigPath, RuleSetId } from '@/domain/ids';
import { type ValidationIssue } from '@/domain/result';
import type { ConfigOverride, CustomRuleSetRecord, RuleSet } from '@/rules/schema/ruleSet';
import { deepFreeze, hasPath, setPath } from '@/rules/expression/paths';

export interface CloneOptions {
  id: RuleSetId;
  name: string;
  description?: string;
  now?: string;
}

/**
 * Copies a rule set into a new custom one (spec §12).
 *
 * The clone keeps a frozen snapshot of its source, so it never changes
 * underneath the user when a built-in is updated in a later release. Cloning a
 * clone flattens against the *resolved* parent, so there is never a chain to
 * walk at read time.
 */
export function cloneRuleSet(source: RuleSet, options: CloneOptions): CustomRuleSetRecord {
  const now = options.now ?? new Date().toISOString();
  const snapshot = structuredClone(source) as RuleSet;

  return {
    id: options.id,
    name: options.name,
    description: options.description ?? `Gebaseerd op ${source.name}.`,
    version: 1,
    origin: 'custom',
    locked: false,
    derivedFrom: {
      ruleSetId: source.id,
      version: source.version,
      snapshot: deepFreeze(snapshot) as RuleSet,
    },
    overrides: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Applies overrides onto a rule set's configuration.
 *
 * An override replaces the value at its path wholesale — overriding
 * `threes.red.valueByCount` swaps the whole table rather than merging it
 * element-wise. That semantic is pinned down by a test.
 */
export function applyOverrides(ruleSet: RuleSet, overrides: readonly ConfigOverride[]): RuleSet {
  let configuration = structuredClone(ruleSet.configuration);
  for (const override of overrides) {
    configuration = setPath(configuration, override.path, override.value);
  }
  return { ...structuredClone(ruleSet), configuration };
}

/** Rejects overrides that point at paths the configuration does not have. */
export function validateOverrides(
  ruleSet: RuleSet,
  overrides: readonly ConfigOverride[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const override of overrides) {
    if (!hasPath(ruleSet.configuration, override.path)) {
      issues.push({
        code: 'override.unknownPath',
        severity: 'error',
        message: `Huisregel verwijst naar onbekend configuratiepad '${override.path}'.`,
        paths: [override.path],
      });
    }
  }
  return issues;
}

/** Resolves a stored custom rule set into the form the engine and UI consume. */
export function resolveRuleSet(record: CustomRuleSetRecord): RuleSet {
  const resolved = applyOverrides(record.derivedFrom.snapshot, record.overrides);
  return {
    ...resolved,
    id: record.id,
    name: record.name,
    description: record.description,
    version: record.version,
    origin: 'custom',
    locked: false,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Which configuration paths a custom rule set actually changed. Drives the
 * "Classic Canasta · 2 huisregels" label of spec §11.
 */
export function overriddenPaths(record: CustomRuleSetRecord): ConfigPath[] {
  return record.overrides.map((override) => override.path);
}

/**
 * Freezes the rule set a game starts with (spec §13).
 *
 * The whole resolved rule set is frozen, not just its configuration: the round
 * form comes from `fields`, the settings screens from `settings` and the rules
 * screen from both.
 */
export function freezeForGame(ruleSet: RuleSet, gameOverrides: readonly ConfigOverride[] = []) {
  const withOverrides = gameOverrides.length > 0 ? applyOverrides(ruleSet, gameOverrides) : ruleSet;
  return deepFreeze(structuredClone(withOverrides)) as Readonly<RuleSet>;
}
