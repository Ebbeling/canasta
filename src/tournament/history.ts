import type { ParticipantId, Tournament, TournamentRound } from '@/domain/tournament';

/**
 * Who has already sat with, and against, whom.
 *
 * Derived from the rounds whose tables are fixed — never stored. A counter kept
 * alongside the matches would be a second copy of the same fact, and the two
 * would disagree the first time a round was corrected.
 */

export interface PairingHistory {
  /** How often two participants were partners, keyed by `pairKey`. */
  partners: ReadonlyMap<string, number>;
  /** How often two participants sat at the same table on opposite sides. */
  opponents: ReadonlyMap<string, number>;
  /** How many settled rounds each participant actually played. */
  played: ReadonlyMap<ParticipantId, number>;
  /** How often each participant has had a bye. */
  byes: ReadonlyMap<ParticipantId, number>;
  /** Which table numbers each participant has sat at. */
  tables: ReadonlyMap<ParticipantId, number[]>;
  /** How many rounds the history was built from. */
  rounds: number;
}

/** An order-independent key for a pair, so A–B and B–A count as the same. */
export function pairKey(a: ParticipantId, b: ParticipantId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Who sits on which side of a table.
 *
 * Seats go round the table, so side `i` holds seats `i`, `i + sides`, and so
 * on. That is the same arrangement the new-game wizard uses, which is why
 * partners end up opposite each other rather than next to each other.
 */
export function sidesOf(
  participantIds: readonly ParticipantId[],
  sides: number,
): ParticipantId[][] {
  const grouped: ParticipantId[][] = Array.from({ length: Math.max(sides, 1) }, () => []);
  participantIds.forEach((id, seat) => {
    grouped[seat % grouped.length]!.push(id);
  });
  return grouped;
}

function bump(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

export function emptyHistory(): PairingHistory {
  return {
    partners: new Map(),
    opponents: new Map(),
    played: new Map(),
    byes: new Map(),
    tables: new Map(),
    rounds: 0,
  };
}

/** Builds the history from a list of rounds and how many sides a table has. */
export function buildPairingHistory(
  rounds: readonly TournamentRound[],
  sidesPerMatch: number,
): PairingHistory {
  const partners = new Map<string, number>();
  const opponents = new Map<string, number>();
  const played = new Map<ParticipantId, number>();
  const byes = new Map<ParticipantId, number>();
  const tables = new Map<ParticipantId, number[]>();

  for (const round of rounds) {
    for (const match of round.matches) {
      if (match.kind === 'bye') {
        for (const id of match.participantIds) {
          byes.set(id, (byes.get(id) ?? 0) + 1);
        }
        continue;
      }

      for (const id of match.participantIds) {
        played.set(id, (played.get(id) ?? 0) + 1);
        tables.set(id, [...(tables.get(id) ?? []), match.tableNumber]);
      }

      const sides = sidesOf(match.participantIds, sidesPerMatch);

      for (const side of sides) {
        for (let i = 0; i < side.length; i += 1) {
          for (let j = i + 1; j < side.length; j += 1) {
            bump(partners, pairKey(side[i]!, side[j]!));
          }
        }
      }

      for (let a = 0; a < sides.length; a += 1) {
        for (let b = a + 1; b < sides.length; b += 1) {
          for (const one of sides[a]!) {
            for (const other of sides[b]!) {
              bump(opponents, pairKey(one, other));
            }
          }
        }
      }
    }
  }

  return { partners, opponents, played, byes, tables, rounds: rounds.length };
}

/** The history of a tournament up to now. */
export function historyOf(tournament: Tournament): PairingHistory {
  return buildPairingHistory(
    tournament.rounds.filter((round) => round.status !== 'planned'),
    tournament.gameSettings.teamsPerMatch,
  );
}

export function partnerCount(history: PairingHistory, a: ParticipantId, b: ParticipantId): number {
  return history.partners.get(pairKey(a, b)) ?? 0;
}

export function opponentCount(history: PairingHistory, a: ParticipantId, b: ParticipantId): number {
  return history.opponents.get(pairKey(a, b)) ?? 0;
}
