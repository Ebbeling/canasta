import type { PartyShape } from '@/application/viewmodels/setup';

/**
 * The editable state behind the players-and-teams step.
 *
 * Seats are indices into `playerNames`; a team is the list of seats sitting in
 * it. That is the same shape `GameSetupDraft` takes, so the wizard hands it
 * straight on without translating anything.
 */
export interface PartyDraft {
  playerNames: string[];
  teamNames: string[];
  teamSeats: number[][];
  mode: 'partnership' | 'individual';
}

/** Spreads seats over teams round-robin, so partners are not seated together. */
export function seatsForLayout(playerCount: number, teamCount: number): number[][] {
  const seats: number[][] = Array.from({ length: teamCount }, () => []);
  for (let seat = 0; seat < playerCount; seat += 1) seats[seat % teamCount]!.push(seat);
  return seats;
}

/**
 * Grows or trims the team names to match a new number of teams.
 *
 * Slicing alone only ever shortened the list, so going from two teams to four
 * left two entries `undefined` while the first two were empty strings. Two
 * different flavours of "no name" then produced two different messages for the
 * same situation. Padding keeps every team represented by an empty string, and
 * the names that were already typed keep their place.
 */
export function resizeTeamNames(current: readonly string[], teamCount: number): string[] {
  return Array.from({ length: teamCount }, (_unused, index) => current[index] ?? '');
}

/** A fresh draft for a rule set's own declared shape. */
export function draftForShape(shape: PartyShape, names: string[] = []): PartyDraft {
  return {
    playerNames: Array.from({ length: shape.playerCount }, (_unused, seat) => names[seat] ?? ''),
    teamNames: Array.from({ length: shape.teamCount }, () => ''),
    teamSeats: seatsForLayout(shape.playerCount, shape.teamCount),
    mode: shape.mode,
  };
}
