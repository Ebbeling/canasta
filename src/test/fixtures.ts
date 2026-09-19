import type { TeamId } from '@/domain/ids';
import { emptyTeamRoundInput, type TeamRoundInput } from '@/domain/round';
import type { Game } from '@/domain/game';
import type { RuleSet } from '@/rules/schema/ruleSet';
import { isCanonicalField, type ScoreInputValue } from '@/rules/schema/field';

export const TEAM_A = 'team-a';
export const TEAM_B = 'team-b';

type InputOverrides = Partial<Omit<TeamRoundInput, 'teamId' | 'extra'>> & {
  extra?: Record<string, ScoreInputValue>;
} & Record<string, unknown>;

/**
 * Builds a team's round input, routing canonical fields to their named
 * properties and everything else into `extra` — the same split the round form
 * makes when it writes a field by id.
 */
export function teamInput(teamId: TeamId, overrides: InputOverrides = {}): TeamRoundInput {
  const input = emptyTeamRoundInput(teamId);

  for (const [key, value] of Object.entries(overrides)) {
    if (key === 'extra') {
      Object.assign(input.extra, value as Record<string, ScoreInputValue>);
    } else if (isCanonicalField(key)) {
      (input as unknown as Record<string, unknown>)[key] = value;
    } else {
      input.extra[key] = value as ScoreInputValue;
    }
  }

  return input;
}

export function makeGame(ruleSet: RuleSet, overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    status: 'active',
    createdAt: '2026-09-19T10:00:00.000Z',
    updatedAt: '2026-09-19T10:00:00.000Z',
    players: [
      { id: 'p1', name: 'Michel', seat: 0 },
      { id: 'p2', name: 'Paul', seat: 1 },
      { id: 'p3', name: 'Anne', seat: 2 },
      { id: 'p4', name: 'Karin', seat: 3 },
    ],
    teams: [
      { id: TEAM_A, name: 'Michel / Anne', memberIds: ['p1', 'p3'], order: 0 },
      { id: TEAM_B, name: 'Paul / Karin', memberIds: ['p2', 'p4'], order: 1 },
    ],
    ruleSetRef: {
      id: ruleSet.id,
      version: ruleSet.version,
      name: ruleSet.name,
      origin: ruleSet.origin,
    },
    effectiveRuleSet: ruleSet,
    gameOverrides: [],
    engineVersion: ruleSet.engineVersion,
    ...overrides,
  };
}
