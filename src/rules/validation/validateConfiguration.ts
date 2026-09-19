import type { ValidationIssue } from '@/domain/result';
import { emptyTeamRoundInput } from '@/domain/round';
import type { RuleSetConfiguration } from '@/rules/schema/configuration';
import type { RuleSet } from '@/rules/schema/ruleSet';
import { createRuleModuleRegistry } from '@/rules/registry/moduleRegistry';
import { DEFAULT_RULE_MODULES } from '@/rules/registry/modules';
import type { RuleModuleRegistry } from '@/rules/registry/ruleModule';
import { evalBool } from '@/scoring/evaluate';
import { staticContext, type EvalContext } from '@/scoring/context';

/**
 * Runs the rule set's own constraints against a configuration (spec §30).
 *
 * Used live in the rule set editor and as part of `validateRuleSet`, so a
 * built-in cannot ship with a configuration its own constraints reject.
 */
export function validateConfiguration(
  ruleSet: RuleSet,
  configuration: RuleSetConfiguration,
  modules: RuleModuleRegistry = createRuleModuleRegistry(DEFAULT_RULE_MODULES),
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  // The configuration under test may differ from the rule set's own (the editor
  // validates a candidate), so the context is built against `configuration`.
  const ctx: EvalContext = { ...staticContext(ruleSet, modules), config: configuration };

  for (const constraint of ruleSet.constraints) {
    if (constraint.kind === 'module') {
      const module = modules.get(constraint.module);
      if (!module.validateConfiguration) continue;
      issues.push(...module.validateConfiguration(ruleSet, configuration, constraint.params));
      continue;
    }

    if (!evalBool(constraint.assert, ctx)) {
      issues.push({
        code: constraint.id,
        severity: constraint.severity,
        message: constraint.message,
        paths: [...constraint.paths],
      });
    }
  }

  issues.push(...capabilityConsistency(ruleSet, configuration));
  return issues;
}

/**
 * Capabilities and configuration answer different questions — "can this variant
 * ever do X" versus "is X switched on" — but they must not contradict each
 * other. A feature switched on while its capability is false would silently
 * never fire.
 */
function capabilityConsistency(
  ruleSet: RuleSet,
  configuration: RuleSetConfiguration,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const pairs: { capability: string; enabled: boolean; path: string }[] = [
    {
      capability: 'redThrees',
      enabled: configuration.threes.red.enabled,
      path: 'threes.red.enabled',
    },
    {
      capability: 'blackThrees',
      enabled: configuration.threes.black.enabled,
      path: 'threes.black.enabled',
    },
    {
      capability: 'specialHands',
      enabled: configuration.specialHands.enabled,
      path: 'specialHands.enabled',
    },
    {
      capability: 'concealedGoingOut',
      enabled: configuration.goOut.concealedEnabled,
      path: 'goOut.concealedEnabled',
    },
    { capability: 'talon', enabled: configuration.talon.enabled, path: 'talon.enabled' },
  ];

  for (const pair of pairs) {
    if (pair.enabled && ruleSet.capabilities[pair.capability] !== true) {
      issues.push({
        code: 'capability.mismatch',
        severity: 'warning',
        message: `'${pair.path}' staat aan terwijl capability '${pair.capability}' uit staat; de functie zou nooit werken.`,
        paths: [pair.path],
      });
    }
  }

  return issues;
}

/** Kept next to the validator so tests can build a neutral input quickly. */
export { emptyTeamRoundInput };
