import type { ValidationIssue } from '@/domain/result';
import type { RuleModule } from '../ruleModule';

/**
 * Only one team can go out in a round.
 *
 * Expressible as `countTeamsWhere(wentOut) <= 1` too; this module exists as the
 * registry's proving fixture and as the cross-team check that does not belong to
 * any single team's expression.
 */
export const atMostOneGoOut: RuleModule = {
  id: 'core.atMostOneGoOut',
  version: 1,
  description: 'Controleert dat hoogstens één team in een ronde is uitgegaan.',
  validateRound(ctx) {
    const wentOut = ctx.round.teamIds.filter(
      (teamId) => ctx.round.inputsByTeam.get(teamId)?.wentOut === true,
    );
    if (wentOut.length <= 1) return [];

    return wentOut.map<ValidationIssue>((teamId) => ({
      code: 'round.multipleGoOut',
      severity: 'error',
      message: 'Slechts één team kan in een ronde uitgaan.',
      fieldId: 'wentOut',
      teamId,
    }));
  },
};
