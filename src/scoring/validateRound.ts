import { formatMessage, type ValidationIssue } from '@/domain/result';
import type { RoundRuleDefinition } from '@/rules/schema/constraint';
import { getPath } from '@/rules/expression/paths';
import { evalBool } from './evaluate';
import { withTeam, type EvalContext } from './context';
import { buildContext, type BuildContextArgs } from './scoreEngine';

function messageFor(rule: RoundRuleDefinition, ctx: EvalContext): string {
  if (rule.kind !== 'expr') return '';
  if (!rule.messageValues) return rule.message;

  const values: Record<string, unknown> = {};
  for (const [name, path] of Object.entries(rule.messageValues)) {
    values[name] = getPath(ctx.config, path);
  }
  return formatMessage(rule.message, values);
}

/**
 * `validateRound` — rule checking only, no scoring (spec §14.1).
 *
 * Warnings never block entry: at the card table a plausible-but-odd number must
 * still be recordable. Errors are surfaced and confirmed, not silently dropped.
 */
export function validateRound(args: BuildContextArgs): ValidationIssue[] {
  const ctx = buildContext(args);
  return validateRoundWithContext(ctx);
}

export function validateRoundWithContext(ctx: EvalContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const rule of ctx.ruleSet.roundRules) {
    if (rule.kind === 'module') {
      const module = ctx.modules.get(rule.module);
      if (!module.validateRound) continue;

      if (rule.scope === 'round') {
        issues.push(...module.validateRound(ctx, rule.params));
      } else {
        for (const teamId of ctx.round.teamIds) {
          issues.push(...module.validateRound(withTeam(ctx, teamId), rule.params));
        }
      }
      continue;
    }

    if (rule.scope === 'round') {
      if (rule.appliesWhen && !evalBool(rule.appliesWhen, ctx)) continue;
      if (!evalBool(rule.assert, ctx)) {
        issues.push({
          code: rule.id,
          severity: rule.severity,
          message: messageFor(rule, ctx),
          fieldId: rule.fieldId,
        });
      }
      continue;
    }

    for (const teamId of ctx.round.teamIds) {
      const teamCtx = withTeam(ctx, teamId);
      if (rule.appliesWhen && !evalBool(rule.appliesWhen, teamCtx)) continue;
      if (!evalBool(rule.assert, teamCtx)) {
        issues.push({
          code: rule.id,
          severity: rule.severity,
          message: messageFor(rule, teamCtx),
          fieldId: rule.fieldId,
          teamId,
        });
      }
    }
  }

  return issues;
}
