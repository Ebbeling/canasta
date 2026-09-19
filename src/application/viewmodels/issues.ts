import type { ConfigPath, FieldId, TeamId } from '@/domain/ids';
import type { Team } from '@/domain/game';
import type { ValidationIssue } from '@/domain/result';
import type { SettingDefinition } from '@/rules/schema/setting';
import type { RuleSet } from '@/rules/schema/ruleSet';
import { getPath } from '@/rules/expression/paths';
import { isVisible } from '@/application/fields/visibility';
import { formatBoolean, formatPoints } from '@/application/labels/format';

/**
 * One shape for everything the user is told about their input.
 *
 * Three channels, not two. `IssueSeverity` only has `error` and `warning`;
 * `advisory` is a `RuleEffect` — a rule the engine cannot check at all, such as
 * how many cards you draw. Widening the severity union would be wrong, so
 * advisories arrive here as a separate, non-blocking channel.
 */
export type IssueChannel = 'error' | 'warning' | 'advisory';

export interface IssueVM {
  code: string;
  channel: IssueChannel;
  /** A Dutch prefix, so severity is never conveyed by colour alone. */
  channelLabel: string;
  message: string;
  fieldId?: FieldId;
  teamId?: TeamId;
  teamName?: string;
  paths?: ConfigPath[];
}

export const CHANNEL_LABELS: Record<IssueChannel, string> = {
  error: 'Fout',
  warning: 'Let op',
  advisory: 'Info',
};

export function toIssueVMs(issues: readonly ValidationIssue[], teams: readonly Team[]): IssueVM[] {
  const nameById = new Map(teams.map((team) => [team.id, team.name]));

  return issues.map((issue) => ({
    code: issue.code,
    channel: issue.severity,
    channelLabel: CHANNEL_LABELS[issue.severity],
    message: issue.message,
    fieldId: issue.fieldId,
    teamId: issue.teamId,
    teamName: issue.teamId ? nameById.get(issue.teamId) : undefined,
    paths: issue.paths,
  }));
}

function describeSettingValue(setting: SettingDefinition, raw: unknown): string {
  if (setting.type === 'boolean') return formatBoolean(raw === true);
  if (typeof raw === 'number') return formatPoints(raw);
  if (typeof raw === 'string') {
    const option = setting.options?.find((item) => item.value === raw);
    return option?.label ?? raw;
  }
  return '';
}

/**
 * The advisory channel: rules that are part of the game but that a score card
 * cannot observe. They are shown as information, never as something the app
 * has verified.
 */
export function advisoryIssues(ruleSet: RuleSet): IssueVM[] {
  return ruleSet.settings
    .filter((setting) => setting.effect === 'advisory')
    .filter((setting) => isVisible(ruleSet, setting.visibleWhen))
    .sort((a, b) => a.order - b.order)
    .map((setting) => {
      const valueText = describeSettingValue(setting, getPath(ruleSet.configuration, setting.key));
      return {
        code: `advisory.${setting.key}`,
        channel: 'advisory' as const,
        channelLabel: CHANNEL_LABELS.advisory,
        message: valueText ? `${setting.label}: ${valueText}` : setting.label,
        paths: [setting.key],
      };
    });
}

export function splitByChannel(issues: readonly IssueVM[]): {
  errors: IssueVM[];
  warnings: IssueVM[];
  advisories: IssueVM[];
} {
  return {
    errors: issues.filter((issue) => issue.channel === 'error'),
    warnings: issues.filter((issue) => issue.channel === 'warning'),
    advisories: issues.filter((issue) => issue.channel === 'advisory'),
  };
}
