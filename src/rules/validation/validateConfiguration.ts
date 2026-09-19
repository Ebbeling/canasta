import { hasErrors, type ValidationIssue } from '@/domain/result';
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

  issues.push(...partyStructure(configuration));
  issues.push(...capabilityConsistency(ruleSet, configuration));
  return issues;
}

/**
 * The party shape: how many people play, and how they are grouped.
 *
 * `players.default`, `teams.count` and `teams.teamSize` are three numbers that
 * describe one thing, so they can disagree. A custom rule set that says six
 * players in two teams of two would deal a game nobody can play, and nothing
 * downstream would notice: the score engine loops over whatever teams the game
 * happens to carry and would simply score four of the six.
 *
 * Checked here rather than in the editor, so every route into a rule set — the
 * preset editor, game-level house rules, an imported snapshot — gets the same
 * answer from the same place.
 */
function partyStructure(configuration: RuleSetConfiguration): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { players, teams } = configuration;

  if (!Number.isInteger(players.default) || players.default < 1) {
    issues.push({
      code: 'party.playerCount',
      severity: 'error',
      message: 'Een partij heeft minstens één speler nodig.',
      paths: ['players.default'],
    });
  }

  if (players.min > players.max) {
    issues.push({
      code: 'party.playerRange',
      severity: 'error',
      message: `Het minimum aantal spelers (${players.min}) ligt boven het maximum (${players.max}).`,
      paths: ['players.min', 'players.max'],
    });
  }

  if (players.default < players.min || players.default > players.max) {
    issues.push({
      code: 'party.playerDefault',
      severity: 'error',
      message: `Deze regelset speelt met ${players.default} spelers, maar staat er ${players.min} tot ${players.max} toe.`,
      paths: ['players.default'],
    });
  }

  if (!Number.isInteger(teams.count) || teams.count < 1) {
    issues.push({
      code: 'party.teamCount',
      severity: 'error',
      message: 'Een partij heeft minstens één team nodig.',
      paths: ['teams.count'],
    });
  }

  if (!Number.isInteger(teams.teamSize) || teams.teamSize < 1) {
    issues.push({
      code: 'party.teamSize',
      severity: 'error',
      message: 'Een team heeft minstens één speler nodig.',
      paths: ['teams.teamSize'],
    });
  }

  if (teams.mode === 'individual' && teams.teamSize !== 1) {
    issues.push({
      code: 'party.individualTeamSize',
      severity: 'error',
      message: 'Bij individueel spel telt elk team precies één speler.',
      paths: ['teams.mode', 'teams.teamSize'],
    });
  }

  // Only worth saying once the three numbers are individually sane.
  if (!hasErrors(issues) && teams.count * teams.teamSize !== players.default) {
    issues.push({
      code: 'party.mismatch',
      severity: 'error',
      message: `${teams.count} ${teams.count === 1 ? 'team' : 'teams'} van ${teams.teamSize} ${
        teams.teamSize === 1 ? 'speler' : 'spelers'
      } is ${teams.count * teams.teamSize} spelers, maar deze regelset speelt met ${players.default}.`,
      paths: ['players.default', 'teams.count', 'teams.teamSize'],
    });
  }

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
