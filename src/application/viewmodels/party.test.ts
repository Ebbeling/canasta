import { describe, expect, it } from 'vitest';
import { classic, twoHanded } from '@/rules/builtin';
import { applyOverrides } from '@/rules/resolve/resolveRuleSet';
import { validateConfiguration } from '@/rules/validation/validateConfiguration';
import { hasErrors } from '@/domain/result';
import {
  assignSeat,
  partyOverrides,
  partyShapeOf,
  teamLayoutsFor,
  teamSizeFor,
  validateGameSetup,
  type PartyShape,
  type GameSetupDraft,
} from './setup';

/**
 * The party shape: how many people play and how they are grouped.
 *
 * Everything here is deliberately expressed in numbers rather than in variant
 * names — the point of the phase is that six players in three teams is not a
 * special case but a configuration the same engine already understands.
 */

const shape = (playerCount: number, teamCount: number): PartyShape => ({
  playerCount,
  teamCount,
  mode: playerCount / teamCount === 1 ? 'individual' : 'partnership',
});

function draft(playerCount: number, teamSeats: number[][]): GameSetupDraft {
  return {
    ruleSetId: classic.id,
    ruleSetOrigin: 'builtin',
    playerNames: Array.from({ length: playerCount }, (_unused, seat) => `Speler ${seat + 1}`),
    teamNames: teamSeats.map((_seats, index) => `Team ${index + 1}`),
    teamSeats,
    overrides: [],
  };
}

describe('team layouts', () => {
  it.each([
    [2, [[2, 1]]],
    [3, [[3, 1]]],
    [4, [
      [2, 2],
      [4, 1],
    ]],
    [6, [
      [2, 3],
      [3, 2],
      [6, 1],
    ]],
    [8, [
      [2, 4],
      [4, 2],
      [8, 1],
    ]],
  ])('offers every exact division of %i players', (playerCount, expected) => {
    const layouts = teamLayoutsFor(playerCount);
    expect(layouts.map((layout) => [layout.teamCount, teamSizeFor(layout)])).toEqual(expected);
  });

  it('offers a prime number of players only individual play', () => {
    for (const playerCount of [3, 5, 7]) {
      const layouts = teamLayoutsFor(playerCount);
      expect(layouts).toHaveLength(1);
      expect(layouts[0]?.mode).toBe('individual');
    }
  });

  it('never offers a single team: somebody has to play against you', () => {
    for (let playerCount = 2; playerCount <= 8; playerCount += 1) {
      expect(teamLayoutsFor(playerCount).every((layout) => layout.teamCount >= 2)).toBe(true);
    }
  });

  it('marks a layout of one-player teams as individual play', () => {
    expect(teamLayoutsFor(6).find((layout) => layout.teamCount === 6)?.mode).toBe('individual');
    expect(teamLayoutsFor(6).find((layout) => layout.teamCount === 3)?.mode).toBe('partnership');
  });
});

describe('party overrides', () => {
  it('describes the built-in shapes it was derived from', () => {
    expect(partyShapeOf(classic)).toEqual({ playerCount: 4, teamCount: 2, mode: 'partnership' });
    expect(partyShapeOf(twoHanded)).toEqual({ playerCount: 2, teamCount: 2, mode: 'individual' });
  });

  it('produces a configuration the rule set validator accepts', () => {
    for (const layout of [shape(6, 3), shape(8, 4), shape(6, 6), shape(4, 2)]) {
      const resolved = applyOverrides(classic, partyOverrides(layout));
      const issues = validateConfiguration(resolved, resolved.configuration);
      expect(hasErrors(issues), `${layout.playerCount} in ${layout.teamCount}`).toBe(false);
    }
  });

  it('moves the player range along with the count, so six players stay legal', () => {
    const resolved = applyOverrides(classic, partyOverrides(shape(6, 3)));
    expect(resolved.configuration.players).toEqual({ min: 6, max: 6, default: 6 });
    expect(resolved.configuration.teams).toEqual({
      mode: 'partnership',
      count: 3,
      teamSize: 2,
    });
  });
});

describe('party structure validation', () => {
  const broken = (overrides: Record<string, number | string>) => {
    const resolved = applyOverrides(
      classic,
      Object.entries(overrides).map(([path, value]) => ({ path, value })),
    );
    return validateConfiguration(resolved, resolved.configuration);
  };

  it('rejects a count that does not divide over the teams', () => {
    const issues = broken({ 'players.default': 6, 'players.min': 6, 'players.max': 6 });
    expect(issues.map((issue) => issue.code)).toContain('party.mismatch');
  });

  it('rejects a default outside the allowed range', () => {
    const issues = broken({ 'players.default': 6, 'teams.count': 3 });
    expect(issues.map((issue) => issue.code)).toContain('party.playerDefault');
  });

  it('rejects individual play with teams of more than one', () => {
    const issues = broken({ 'teams.mode': 'individual' });
    expect(issues.map((issue) => issue.code)).toContain('party.individualTeamSize');
  });

  it('rejects a game with no teams at all', () => {
    const issues = broken({ 'teams.count': 0 });
    expect(issues.map((issue) => issue.code)).toContain('party.teamCount');
  });

  it('leaves every built-in rule set valid', () => {
    for (const ruleSet of [classic, twoHanded]) {
      expect(hasErrors(validateConfiguration(ruleSet, ruleSet.configuration))).toBe(false);
    }
  });
});

describe('moving a player between teams', () => {
  it('swaps when both teams are already at size, so the teams stay even', () => {
    const seats = [
      [0, 2],
      [1, 3],
    ];
    const next = assignSeat(seats, 0, 1);

    expect(next.map((team) => team.length)).toEqual([2, 2]);
    expect(next[1]).toContain(0);
    expect(next[0]).not.toContain(0);
    // Somebody came back the other way.
    expect(next.flat().sort()).toEqual([0, 1, 2, 3]);
  });

  it('is a plain move when the target has room', () => {
    const next = assignSeat([[0, 1, 2], [3]], 0, 1);
    expect(next).toEqual([
      [1, 2],
      [0, 3],
    ]);
  });

  it('leaves everything alone when the player is already there', () => {
    const seats = [
      [0, 2],
      [1, 3],
    ];
    expect(assignSeat(seats, 0, 0)).toEqual(seats);
  });

  it('does not mutate the array it was given', () => {
    const seats = [
      [0, 2],
      [1, 3],
    ];
    assignSeat(seats, 0, 1);
    expect(seats).toEqual([
      [0, 2],
      [1, 3],
    ]);
  });

  it('never loses or duplicates a player, whatever the move', () => {
    let seats = [
      [0, 3],
      [1, 4],
      [2, 5],
    ];
    for (const [seat, team] of [
      [0, 1],
      [4, 2],
      [5, 0],
      [3, 1],
    ] as const) {
      seats = assignSeat(seats, seat, team);
      expect([...seats.flat()].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });
});

describe('game setup validation', () => {
  const sixInThree = shape(6, 3);

  it('accepts six players in three teams when that is the shape being played', () => {
    const seats = [
      [0, 3],
      [1, 4],
      [2, 5],
    ];
    expect(validateGameSetup(classic, draft(6, seats), sixInThree)).toEqual([]);
  });

  it('rejects a player who is in no team at all', () => {
    const seats = [
      [0, 3],
      [1, 4],
      [2],
    ];
    const issues = validateGameSetup(classic, draft(6, seats), sixInThree);
    expect(issues.map((issue) => issue.code)).toContain('setup.unassignedPlayer');
    expect(issues.find((issue) => issue.code === 'setup.unassignedPlayer')?.message).toContain(
      'Speler 6',
    );
  });

  it('rejects a player who is in two teams at once', () => {
    const seats = [
      [0, 3],
      [0, 4],
      [2, 5],
    ];
    const issues = validateGameSetup(classic, draft(6, seats), sixInThree);
    expect(issues.map((issue) => issue.code)).toContain('setup.duplicateSeat');
  });

  it('rejects a team that names a player who does not exist', () => {
    const seats = [
      [0, 3],
      [1, 4],
      [2, 99],
    ];
    const issues = validateGameSetup(classic, draft(6, seats), sixInThree);
    expect(issues.map((issue) => issue.code)).toContain('setup.unknownSeat');
  });

  it('rejects an empty team', () => {
    const seats = [[0, 1, 2, 3, 4, 5], [], []];
    const issues = validateGameSetup(classic, draft(6, seats), sixInThree);
    expect(issues.map((issue) => issue.code)).toContain('setup.emptyTeam');
  });

  it('rejects a player without a name', () => {
    const base = draft(4, [
      [0, 2],
      [1, 3],
    ]);
    const issues = validateGameSetup(classic, { ...base, playerNames: ['A', '', 'C', 'D'] });
    expect(issues.map((issue) => issue.code)).toContain('setup.playerName');
  });

  it('still judges a standard game by its own rule set', () => {
    const issues = validateGameSetup(classic, draft(6, [[0, 3], [1, 4], [2, 5]]));
    expect(issues.map((issue) => issue.code)).toContain('setup.playerCount');
  });
});
