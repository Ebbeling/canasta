import type { ValidationIssue } from '@/domain/result';
import type { ConfigOverride, RuleSet } from '@/rules/schema/ruleSet';
import type { RuleSectionVM } from './rulesView';
import { describeRuleSet } from './rulesView';

/**
 * The new-game wizard (spec §5–§8), derived from the rule set.
 *
 * Two-Handed plays with individual players rather than partnerships, so the
 * wizard calls them "speler" instead of "team". That wording comes from
 * `teams.mode` in the configuration — never from a check on which variant it is.
 */

export interface PlayerSlotVM {
  seat: number;
  label: string;
  placeholder: string;
}

export interface GameSetupVM {
  ruleSetId: string;
  ruleSetName: string;
  summaryLine: string;
  playerSlots: PlayerSlotVM[];
  teamNoun: { singular: string; plural: string };
  teamCount: number;
  teamSize: number;
  /** False for individual play: there is nothing to arrange. */
  hasTeams: boolean;
  /** Default team names, e.g. ["Team A", "Team B"] or the players' own names. */
  defaultTeamNames: string[];
  /** Step 4: only the settings this rule set allows a game to deviate on. */
  editableSections: RuleSectionVM[];
}

export interface GameSetupDraft {
  ruleSetId: string;
  ruleSetOrigin: 'builtin' | 'custom';
  playerNames: string[];
  teamNames: string[];
  /** Which seats sit in which team, by team index. */
  teamSeats: number[][];
  overrides: ConfigOverride[];
  gameName?: string;
}

const TEAM_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function buildGameSetup(ruleSet: RuleSet): GameSetupVM {
  const { players, teams } = ruleSet.configuration;
  const description = describeRuleSet(ruleSet);
  const individual = teams.mode === 'individual';

  const playerSlots: PlayerSlotVM[] = Array.from({ length: players.default }, (_unused, index) => ({
    seat: index,
    label: `Speler ${index + 1}`,
    placeholder: `Speler ${index + 1}`,
  }));

  return {
    ruleSetId: ruleSet.id,
    ruleSetName: ruleSet.name,
    summaryLine: description.summaryLine,
    playerSlots,
    teamNoun: individual
      ? { singular: 'speler', plural: 'spelers' }
      : { singular: 'team', plural: 'teams' },
    teamCount: teams.count,
    teamSize: teams.teamSize,
    hasTeams: !individual,
    defaultTeamNames: Array.from({ length: teams.count }, (_unused, index) =>
      individual ? `Speler ${index + 1}` : `Team ${TEAM_LETTERS[index] ?? index + 1}`,
    ),
    editableSections: description.sections
      .map((section) => ({
        ...section,
        values: section.values.filter((value) => value.editable),
      }))
      .filter((section) => section.values.length > 0),
  };
}

/** Default seat assignment: partners sit opposite each other. */
export function defaultTeamSeats(ruleSet: RuleSet): number[][] {
  const { teams, players } = ruleSet.configuration;
  const seats: number[][] = Array.from({ length: teams.count }, () => []);

  for (let seat = 0; seat < players.default; seat += 1) {
    seats[seat % teams.count]!.push(seat);
  }

  return seats;
}

/** Checks the people, not the rules — the rules are checked by the pipeline. */
export function validateGameSetup(ruleSet: RuleSet, draft: GameSetupDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { players, teams } = ruleSet.configuration;

  if (draft.playerNames.length !== players.default) {
    issues.push({
      code: 'setup.playerCount',
      severity: 'error',
      message: `Deze regelset wordt met ${players.default} spelers gespeeld.`,
    });
  }

  draft.playerNames.forEach((name, index) => {
    if (name.trim().length === 0) {
      issues.push({
        code: 'setup.playerName',
        severity: 'error',
        message: `Speler ${index + 1} heeft nog geen naam.`,
      });
    }
  });

  const trimmed = draft.playerNames.map((name) => name.trim().toLowerCase()).filter(Boolean);
  if (new Set(trimmed).size !== trimmed.length) {
    issues.push({
      code: 'setup.duplicatePlayer',
      severity: 'warning',
      message:
        'Twee spelers hebben dezelfde naam. Dat mag, maar het scorebord wordt lastiger te lezen.',
    });
  }

  if (draft.teamSeats.length !== teams.count) {
    issues.push({
      code: 'setup.teamCount',
      severity: 'error',
      message: `Deze regelset speelt met ${teams.count} ${teams.mode === 'individual' ? 'spelers' : 'teams'}.`,
    });
  }

  for (const [index, seats] of draft.teamSeats.entries()) {
    if (seats.length !== teams.teamSize) {
      issues.push({
        code: 'setup.teamSize',
        severity: 'error',
        message: `${draft.teamNames[index] ?? `Team ${index + 1}`} moet ${teams.teamSize} ${
          teams.teamSize === 1 ? 'speler' : 'spelers'
        } hebben.`,
      });
    }
  }

  const assigned = draft.teamSeats.flat();
  if (new Set(assigned).size !== assigned.length) {
    issues.push({
      code: 'setup.duplicateSeat',
      severity: 'error',
      message: 'Een speler is aan meer dan één team toegewezen.',
    });
  }

  return issues;
}
