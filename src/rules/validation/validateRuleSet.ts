import type { ValidationIssue } from '@/domain/result';
import { CANONICAL_FIELDS } from '@/rules/schema/field';
import type { RuleSet } from '@/rules/schema/ruleSet';
import { hasPath } from '@/rules/expression/paths';
import { collectRefs, newRefs, type ExpressionRefs } from '@/rules/expression/staticCheck';
import { createRuleModuleRegistry } from '@/rules/registry/moduleRegistry';
import { DEFAULT_RULE_MODULES } from '@/rules/registry/modules';
import type { RuleModuleRegistry } from '@/rules/registry/ruleModule';
import { validateConfiguration } from './validateConfiguration';

/**
 * Proves before runtime that a rule set is complete and consistent (spec §30.1).
 *
 * Every built-in must return zero errors. A typo in a field id inside a
 * hand-written expression then breaks the build instead of the card table.
 */
export function validateRuleSet(
  ruleSet: RuleSet,
  modules: RuleModuleRegistry = createRuleModuleRegistry(DEFAULT_RULE_MODULES),
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  issues.push(...checkDuplicateIds(ruleSet));
  issues.push(...checkFields(ruleSet));
  issues.push(...checkSettings(ruleSet));
  issues.push(...checkExpressions(ruleSet, modules));
  issues.push(...validateConfiguration(ruleSet, ruleSet.configuration, modules));

  return issues;
}

function checkDuplicateIds(ruleSet: RuleSet): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const duplicate = <T>(items: readonly T[], key: (item: T) => string, label: string): void => {
    const seen = new Set<string>();
    for (const item of items) {
      const id = key(item);
      if (seen.has(id)) {
        issues.push({
          code: 'ruleSet.duplicateId',
          severity: 'error',
          message: `Dubbele ${label}-id: '${id}'.`,
        });
      }
      seen.add(id);
    }
  };

  duplicate(ruleSet.fields, (field) => field.id, 'veld');
  duplicate(ruleSet.scoringRules, (rule) => rule.id, 'scoreregel');
  duplicate(ruleSet.settings, (setting) => setting.key, 'instelling');
  duplicate(ruleSet.constraints, (constraint) => constraint.id, 'constraint');
  duplicate(ruleSet.roundRules, (rule) => rule.id, 'ronderegel');

  return issues;
}

function checkFields(ruleSet: RuleSet): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const field of ruleSet.fields) {
    if (field.type === 'choice' && (!field.options || field.options.length === 0)) {
      issues.push({
        code: 'field.missingOptions',
        severity: 'error',
        message: `Keuzeveld '${field.id}' heeft geen opties.`,
        fieldId: field.id,
      });
    }

    if (field.type === 'multiselect' && !field.optionsFrom) {
      issues.push({
        code: 'field.missingOptionsFrom',
        severity: 'error',
        message: `Multiselectveld '${field.id}' heeft geen 'optionsFrom'.`,
        fieldId: field.id,
      });
    }

    if (field.optionsFrom && !hasPath(ruleSet.configuration, field.optionsFrom)) {
      issues.push({
        code: 'field.unknownOptionsPath',
        severity: 'error',
        message: `Veld '${field.id}' verwijst naar onbekend configuratiepad '${field.optionsFrom}'.`,
        fieldId: field.id,
        paths: [field.optionsFrom],
      });
    }

    if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
      issues.push({
        code: 'field.invalidRange',
        severity: 'error',
        message: `Veld '${field.id}' heeft een minimum dat boven het maximum ligt.`,
        fieldId: field.id,
      });
    }
  }

  return issues;
}

function checkSettings(ruleSet: RuleSet): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const setting of ruleSet.settings) {
    if (!hasPath(ruleSet.configuration, setting.key)) {
      issues.push({
        code: 'setting.unknownPath',
        severity: 'error',
        message: `Instelling '${setting.key}' verwijst naar een pad dat niet in de configuratie bestaat.`,
        paths: [setting.key],
      });
    }

    if (setting.type === 'select' && (!setting.options || setting.options.length === 0)) {
      issues.push({
        code: 'setting.missingOptions',
        severity: 'error',
        message: `Instelling '${setting.key}' is een keuzelijst zonder opties.`,
        paths: [setting.key],
      });
    }

    if (setting.status !== 'verified' && !setting.statusNote) {
      issues.push({
        code: 'setting.missingStatusNote',
        severity: 'warning',
        message: `Instelling '${setting.key}' heeft status '${setting.status}' maar geen toelichting.`,
        paths: [setting.key],
      });
    }
  }

  return issues;
}

function checkExpressions(ruleSet: RuleSet, modules: RuleModuleRegistry): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const knownFields = new Set<string>([
    ...CANONICAL_FIELDS,
    ...ruleSet.fields.map((field) => field.id),
  ]);

  const check = (refs: ExpressionRefs, where: string, roundScope: boolean): void => {
    for (const field of refs.fields) {
      if (!knownFields.has(field)) {
        issues.push({
          code: 'expression.unknownField',
          severity: 'error',
          message: `${where} verwijst naar onbekend veld '${field}'.`,
          fieldId: field,
        });
      }
    }

    for (const path of refs.configPaths) {
      if (!hasPath(ruleSet.configuration, path)) {
        issues.push({
          code: 'expression.unknownConfigPath',
          severity: 'error',
          message: `${where} verwijst naar onbekend configuratiepad '${path}'.`,
          paths: [path],
        });
      }
    }

    for (const moduleId of refs.modules) {
      if (!modules.has(moduleId)) {
        issues.push({
          code: 'expression.unknownModule',
          severity: 'error',
          message: `${where} verwijst naar niet-geregistreerde rule module '${moduleId}'.`,
        });
      }
    }

    if (roundScope && refs.usesTeamScope) {
      issues.push({
        code: 'expression.teamScopeInRoundScope',
        severity: 'error',
        message: `${where} gebruikt een team-gebonden operatie in rondecontext.`,
      });
    }
  };

  for (const rule of ruleSet.scoringRules) {
    const refs = newRefs();
    collectRefs(rule.compute, refs);
    if (rule.appliesWhen) collectRefs(rule.appliesWhen, refs);
    for (const expr of Object.values(rule.detail ?? {})) collectRefs(expr, refs);
    check(refs, `Scoreregel '${rule.id}'`, false);

    if (rule.explainTemplate && !rule.detail) {
      issues.push({
        code: 'scoreRule.explainWithoutDetail',
        severity: 'warning',
        message: `Scoreregel '${rule.id}' heeft een uitleg-sjabloon maar geen detailwaarden.`,
      });
    }
  }

  for (const rule of ruleSet.roundRules) {
    if (rule.kind === 'module') {
      if (!modules.has(rule.module)) {
        issues.push({
          code: 'expression.unknownModule',
          severity: 'error',
          message: `Ronderegel '${rule.id}' verwijst naar niet-geregistreerde module '${rule.module}'.`,
        });
      }
      continue;
    }

    const refs = newRefs();
    collectRefs(rule.assert, refs);
    if (rule.appliesWhen) collectRefs(rule.appliesWhen, refs);
    check(refs, `Ronderegel '${rule.id}'`, rule.scope === 'round');

    for (const path of Object.values(rule.messageValues ?? {})) {
      if (!hasPath(ruleSet.configuration, path)) {
        issues.push({
          code: 'expression.unknownConfigPath',
          severity: 'error',
          message: `Ronderegel '${rule.id}' gebruikt onbekend configuratiepad '${path}' in zijn melding.`,
          paths: [path],
        });
      }
    }
  }

  for (const field of ruleSet.fields) {
    if (!field.visibleWhen) continue;
    const refs = newRefs();
    collectRefs(field.visibleWhen, refs);
    check(refs, `Zichtbaarheid van veld '${field.id}'`, true);
  }

  for (const setting of ruleSet.settings) {
    if (!setting.visibleWhen) continue;
    const refs = newRefs();
    collectRefs(setting.visibleWhen, refs);
    check(refs, `Zichtbaarheid van instelling '${setting.key}'`, true);
  }

  return issues;
}
