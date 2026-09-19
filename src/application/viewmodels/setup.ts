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

/**
 * How many people play and how they are grouped.
 *
 * Three configuration values describe one decision, so they are chosen together
 * and written together. Everything downstream — the wizard, the preset editor,
 * the score engine — reads them back off the rule set as it always has; this
 * type only exists so the three cannot be set to disagree.
 */
export interface PartyShape {
  playerCount: number;
  teamCount: number;
  mode: 'partnership' | 'individual';
}

/** The team size a shape implies. Always exact: a layout is only offered when it divides. */
export function teamSizeFor(shape: PartyShape): number {
  return shape.playerCount / shape.teamCount;
}

/**
 * Every way a given number of players can be grouped, largest teams first.
 *
 * Only exact divisions are offered, and never a single team — a game needs
 * someone to play against. A prime number of players therefore offers only
 * individual play, which is the honest answer rather than a silent remainder.
 */
export function teamLayoutsFor(playerCount: number): PartyShape[] {
  const layouts: PartyShape[] = [];

  for (let teamCount = 2; teamCount <= playerCount; teamCount += 1) {
    if (playerCount % teamCount !== 0) continue;
    const size = playerCount / teamCount;
    layouts.push({
      playerCount,
      teamCount,
      mode: size === 1 ? 'individual' : 'partnership',
    });
  }

  return layouts;
}

/** Turns a chosen shape into overrides for the one configuration pipeline. */
export function partyOverrides(shape: PartyShape): ConfigOverride[] {
  const size = teamSizeFor(shape);
  return [
    { path: 'players.min', value: shape.playerCount },
    { path: 'players.max', value: shape.playerCount },
    { path: 'players.default', value: shape.playerCount },
    { path: 'teams.mode', value: shape.mode },
    { path: 'teams.count', value: shape.teamCount },
    { path: 'teams.teamSize', value: size },
  ];
}

/** The shape a rule set currently describes. */
export function partyShapeOf(ruleSet: RuleSet): PartyShape {
  const { players, teams } = ruleSet.configuration;
  return { playerCount: players.default, teamCount: teams.count, mode: teams.mode };
}

const TEAM_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

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

/**
 * Moves a player into another team, keeping the teams the same size.
 *
 * Teams in a rule set have one declared size, so a plain move would always
 * leave one team short and another over. When both teams are already at size,
 * this swaps instead: the player joins the target and someone from the target
 * takes their place. Every intermediate state stays valid, so the user is never
 * shown an error for a move the interface invited them to make.
 *
 * Pure, and returns a fresh structure — the caller's array is untouched.
 */
export function assignSeat(
  teamSeats: readonly (readonly number[])[],
  seat: number,
  toTeamIndex: number,
): number[][] {
  const next = teamSeats.map((seats) => [...seats]);
  const from = next.findIndex((seats) => seats.includes(seat));
  const target = next[toTeamIndex];

  if (from === -1 || target === undefined || from === toTeamIndex) return next;

  const source = next[from]!;
  source.splice(source.indexOf(seat), 1);

  // Swap only when the target was full and the source has room to take someone
  // back; otherwise this is a plain move into a team that had space.
  if (target.length >= source.length + 1) {
    const displaced = target.shift();
    if (displaced !== undefined) source.push(displaced);
  }

  target.push(seat);
  source.sort((a, b) => a - b);
  target.sort((a, b) => a - b);
  return next;
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

/**
 * Checks the people, not the rules — the rules are checked by the pipeline.
 *
 * `shape` is for a custom game, which is judged against the party it is about
 * to be played with rather than the one its base rule set declares. Passing it
 * here rather than having the caller assemble a modified rule set keeps the
 * configuration out of the interface entirely.
 */
export function validateGameSetup(
  ruleSet: RuleSet,
  draft: GameSetupDraft,
  shape?: PartyShape,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { players, teams } = shape
    ? {
        players: { default: shape.playerCount },
        teams: { mode: shape.mode, count: shape.teamCount, teamSize: teamSizeFor(shape) },
      }
    : ruleSet.configuration;

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

  // A seat that names nobody would silently produce a team with fewer members
  // than it claims, because the game service drops ids it cannot resolve.
  const unknown = assigned.filter(
    (seat) => !Number.isInteger(seat) || seat < 0 || seat >= draft.playerNames.length,
  );
  if (unknown.length > 0) {
    issues.push({
      code: 'setup.unknownSeat',
      severity: 'error',
      message: 'Een team verwijst naar een speler die niet bestaat.',
    });
  }

  const seated = new Set(assigned);
  const unseated = draft.playerNames
    .map((_name, seat) => seat)
    .filter((seat) => !seated.has(seat));
  if (unseated.length > 0) {
    const names = unseated.map((seat) => draft.playerNames[seat]?.trim() || `Speler ${seat + 1}`);
    issues.push({
      code: 'setup.unassignedPlayer',
      severity: 'error',
      message: `${names.join(', ')} ${names.length === 1 ? 'is' : 'zijn'} nog niet ingedeeld.`,
    });
  }

  draft.teamSeats.forEach((seats, index) => {
    if (seats.length === 0) {
      issues.push({
        code: 'setup.emptyTeam',
        severity: 'error',
        message: `${draft.teamNames[index]?.trim() || `Team ${index + 1}`} heeft nog geen spelers.`,
      });
    }
  });

  // Team names are deliberately not checked: an empty one is allowed, and the
  // game service falls back to "Team n".
  return issues;
}
