import { describe, expect, it } from 'vitest';
import type { TournamentRound } from '@/domain/tournament';
import { buildPairingHistory, emptyHistory, pairKey, sidesOf } from './history';
import { planTables, proposePairing, validatePairing, type ProposedMatch } from './pairing';

/**
 * The pairing engine.
 *
 * Two things are being proved here. The first is that a proposal is always
 * *valid*: everybody seated once, tables the right size, nobody who has
 * withdrawn. The second is that it is *good*: over a series of rounds people
 * meet new partners rather than the same one again, and when that becomes
 * impossible the engine still answers.
 */

const names = (count: number) =>
  Array.from({ length: count }, (_unused, index) => `p${index + 1}`);

function round(sequence: number, matches: ProposedMatch[]): TournamentRound {
  return {
    id: `r${sequence}`,
    dayId: 'd1',
    sequence,
    status: 'completed',
    matches: matches.map((match, index) => ({
      id: `r${sequence}m${index}`,
      tableNumber: match.tableNumber,
      kind: match.kind,
      participantIds: match.participantIds,
    })),
  };
}

/** Plays `count` rounds, feeding each proposal back in as history. */
function playSeries(participantIds: string[], count: number, perMatch = 4, sides = 2) {
  const rounds: TournamentRound[] = [];

  for (let n = 1; n <= count; n += 1) {
    const outcome = proposePairing({
      participantIds,
      participantsPerMatch: perMatch,
      teamsPerMatch: sides,
      oddParticipantMode: 'bye',
      allowExtraAtTable: false,
      history: buildPairingHistory(rounds, sides),
    });
    if (!outcome.ok) throw new Error(`ronde ${n} kon niet worden ingedeeld`);
    rounds.push(round(n, outcome.proposal.matches));
  }

  return rounds;
}

describe('planning the tables', () => {
  it('fills whole tables when the number divides', () => {
    expect(planTables(16, 4, 'bye', false).sizes).toEqual([4, 4, 4, 4]);
    expect(planTables(16, 4, 'bye', false).byeCount).toBe(0);
  });

  it('seats the remainder at a table when that is allowed', () => {
    const plan = planTables(13, 4, 'extra-player-at-table', true);
    expect(plan.sizes).toEqual([4, 4, 5]);
    expect(plan.byeCount).toBe(0);
  });

  it('spreads more than one extra over the last tables', () => {
    const plan = planTables(14, 4, 'extra-player-at-table', true);
    expect(plan.sizes).toEqual([4, 5, 5]);
    expect(plan.byeCount).toBe(0);
  });

  it('gives the remainder a bye when that is the setting', () => {
    const plan = planTables(13, 4, 'bye', false);
    expect(plan.sizes).toEqual([4, 4, 4]);
    expect(plan.byeCount).toBe(1);
  });

  it('falls back to a bye at a table of partnerships, and says why', () => {
    const plan = planTables(13, 4, 'extra-player-at-table', false);
    expect(plan.byeCount).toBe(1);
    expect(plan.issues.map((issue) => issue.code)).toContain('pairing.extraNotPossible');
  });

  it('refuses when there are not enough for one table', () => {
    const plan = planTables(3, 4, 'bye', false);
    expect(plan.issues.some((issue) => issue.severity === 'error')).toBe(true);
  });
});

describe('a proposal is always valid', () => {
  for (const count of [4, 8, 12, 13, 16, 20]) {
    it(`seats all ${count} participants exactly once`, () => {
      const participantIds = names(count);
      const outcome = proposePairing({
        participantIds,
        participantsPerMatch: 4,
        teamsPerMatch: 2,
        oddParticipantMode: 'bye',
        allowExtraAtTable: false,
        history: emptyHistory(),
      });

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;

      const seated = outcome.proposal.matches.flatMap((match) => match.participantIds);
      expect(seated).toHaveLength(count);
      expect(new Set(seated).size).toBe(count);

      const issues = validatePairing(outcome.proposal.matches, {
        participantIds,
        participantsPerMatch: 4,
        allowExtraAtTable: false,
      });
      expect(issues).toEqual([]);
    });
  }

  it('numbers its tables from one, without gaps', () => {
    const outcome = proposePairing({
      participantIds: names(12),
      participantsPerMatch: 4,
      teamsPerMatch: 2,
      oddParticipantMode: 'bye',
      allowExtraAtTable: false,
      history: emptyHistory(),
    });
    if (!outcome.ok) throw new Error('geen indeling');
    expect(outcome.proposal.matches.map((match) => match.tableNumber)).toEqual([1, 2, 3]);
  });

  it('leaves withdrawn participants out entirely', () => {
    const playing = names(8);
    const outcome = proposePairing({
      participantIds: playing,
      participantsPerMatch: 4,
      teamsPerMatch: 2,
      oddParticipantMode: 'bye',
      allowExtraAtTable: false,
      history: emptyHistory(),
    });
    if (!outcome.ok) throw new Error('geen indeling');

    const seated = outcome.proposal.matches.flatMap((match) => match.participantIds);
    expect(seated).not.toContain('p9');
    expect(seated.every((id) => playing.includes(id))).toBe(true);
  });

  it('gives the odd one out a table of their own, marked as a bye', () => {
    const outcome = proposePairing({
      participantIds: names(13),
      participantsPerMatch: 4,
      teamsPerMatch: 2,
      oddParticipantMode: 'bye',
      allowExtraAtTable: false,
      history: emptyHistory(),
    });
    if (!outcome.ok) throw new Error('geen indeling');

    const byes = outcome.proposal.matches.filter((match) => match.kind === 'bye');
    expect(byes).toHaveLength(1);
    expect(byes[0]!.participantIds).toHaveLength(1);
  });

  it('seats thirteen at three tables when an extra may join one', () => {
    const outcome = proposePairing({
      participantIds: names(13),
      participantsPerMatch: 4,
      teamsPerMatch: 4,
      oddParticipantMode: 'extra-player-at-table',
      allowExtraAtTable: true,
      history: emptyHistory(),
    });
    if (!outcome.ok) throw new Error('geen indeling');

    const sizes = outcome.proposal.matches
      .filter((match) => match.kind === 'game')
      .map((match) => match.participantIds.length)
      .sort();
    expect(sizes).toEqual([4, 4, 5]);
    expect(outcome.proposal.matches.some((match) => match.kind === 'bye')).toBe(false);
  });

  it('refuses when a table cannot be filled at all', () => {
    const outcome = proposePairing({
      participantIds: names(3),
      participantsPerMatch: 4,
      teamsPerMatch: 2,
      oddParticipantMode: 'bye',
      allowExtraAtTable: false,
      history: emptyHistory(),
    });
    expect(outcome.ok).toBe(false);
  });

  it('is deterministic: the same state gives the same tables', () => {
    const request = {
      participantIds: names(16),
      participantsPerMatch: 4,
      teamsPerMatch: 2,
      oddParticipantMode: 'bye' as const,
      allowExtraAtTable: false,
      history: emptyHistory(),
    };

    const first = proposePairing(request);
    const second = proposePairing(request);
    expect(JSON.stringify(first)).toEqual(JSON.stringify(second));
  });
});

describe('permanent teams stay together', () => {
  it('treats a team as one participant that cannot be split', () => {
    // Four teams, two per table: a table seats two participants, not four.
    const teams = ['A', 'B', 'C', 'D'];
    const outcome = proposePairing({
      participantIds: teams,
      participantsPerMatch: 2,
      teamsPerMatch: 2,
      oddParticipantMode: 'bye',
      allowExtraAtTable: false,
      history: emptyHistory(),
    });
    if (!outcome.ok) throw new Error('geen indeling');

    expect(outcome.proposal.matches).toHaveLength(2);
    for (const match of outcome.proposal.matches) {
      expect(match.participantIds).toHaveLength(2);
    }
    const seated = outcome.proposal.matches.flatMap((match) => match.participantIds).sort();
    expect(seated).toEqual(teams);
  });
});

describe('the arrangement improves on what has been played', () => {
  it('never repeats a partner while a fresh one is available', () => {
    // Eight players, two tables of four. Three rounds fit without repeats.
    const rounds = playSeries(names(8), 3);
    const history = buildPairingHistory(rounds, 2);

    for (const [, count] of history.partners) expect(count).toBe(1);
  });

  it('spreads partners over a long series rather than stacking them', () => {
    const rounds = playSeries(names(16), 5);
    const history = buildPairingHistory(rounds, 2);

    // Nobody sits with the same partner three times in five rounds.
    expect(Math.max(...history.partners.values())).toBeLessThanOrEqual(2);
  });

  it('still answers when no repeat-free arrangement is left', () => {
    // Four players at one table: after three rounds every partnership has been
    // played, so the fourth must repeat one — and must still be valid.
    const participantIds = names(4);
    const rounds = playSeries(participantIds, 4);
    const fourth = rounds[3]!;

    const seated = fourth.matches.flatMap((match) => match.participantIds);
    expect(new Set(seated).size).toBe(4);

    const issues = validatePairing(
      fourth.matches.map((match) => ({
        tableNumber: match.tableNumber,
        kind: match.kind,
        participantIds: match.participantIds,
      })),
      { participantIds, participantsPerMatch: 4, allowExtraAtTable: false },
    );
    expect(issues).toEqual([]);
  });

  it('warns when it has to repeat a partnership', () => {
    const participantIds = names(4);
    const rounds = playSeries(participantIds, 3);

    const outcome = proposePairing({
      participantIds,
      participantsPerMatch: 4,
      teamsPerMatch: 2,
      oddParticipantMode: 'bye',
      allowExtraAtTable: false,
      history: buildPairingHistory(rounds, 2),
    });
    if (!outcome.ok) throw new Error('geen indeling');

    expect(outcome.proposal.repeatedPartners).toBeGreaterThan(0);
    expect(outcome.proposal.issues.map((issue) => issue.code)).toContain(
      'pairing.repeatedPartners',
    );
  });

  it('prefers a new opponent once partners are settled', () => {
    const rounds = playSeries(names(8), 3);
    const history = buildPairingHistory(rounds, 2);

    // With eight players over three rounds everyone has met plenty of people,
    // but no single opposing pair should have met more than twice.
    expect(Math.max(...history.opponents.values())).toBeLessThanOrEqual(2);
  });

  it('shares the byes out rather than picking on one person', () => {
    const rounds = playSeries(names(9), 6, 4, 2);
    const history = buildPairingHistory(rounds, 2);

    const counts = names(9).map((id) => history.byes.get(id) ?? 0);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });
});

describe('an arrangement the organiser has changed', () => {
  const participantIds = names(8);
  const constraints = { participantIds, participantsPerMatch: 4, allowExtraAtTable: false };

  it('accepts a valid rearrangement', () => {
    const matches: ProposedMatch[] = [
      { tableNumber: 1, kind: 'game', participantIds: ['p1', 'p2', 'p3', 'p4'] },
      { tableNumber: 2, kind: 'game', participantIds: ['p5', 'p6', 'p7', 'p8'] },
    ];
    expect(validatePairing(matches, constraints)).toEqual([]);
  });

  it('refuses a participant seated twice', () => {
    const matches: ProposedMatch[] = [
      { tableNumber: 1, kind: 'game', participantIds: ['p1', 'p2', 'p3', 'p4'] },
      { tableNumber: 2, kind: 'game', participantIds: ['p1', 'p6', 'p7', 'p8'] },
    ];
    const codes = validatePairing(matches, constraints).map((issue) => issue.code);
    expect(codes).toContain('pairing.duplicate');
    expect(codes).toContain('pairing.unassigned');
  });

  it('refuses a table with the wrong number of seats', () => {
    const matches: ProposedMatch[] = [
      { tableNumber: 1, kind: 'game', participantIds: ['p1', 'p2', 'p3'] },
      { tableNumber: 2, kind: 'game', participantIds: ['p4', 'p5', 'p6', 'p7', 'p8'] },
    ];
    const codes = validatePairing(matches, constraints).map((issue) => issue.code);
    expect(codes).toContain('pairing.tableTooSmall');
    expect(codes).toContain('pairing.tableTooLarge');
  });

  it('refuses somebody who is not taking part', () => {
    const matches: ProposedMatch[] = [
      { tableNumber: 1, kind: 'game', participantIds: ['p1', 'p2', 'p3', 'p9'] },
      { tableNumber: 2, kind: 'game', participantIds: ['p5', 'p6', 'p7', 'p8'] },
    ];
    expect(validatePairing(matches, constraints).map((issue) => issue.code)).toContain(
      'pairing.notEligible',
    );
  });

  it('keeps a table the organiser has fixed', () => {
    const outcome = proposePairing({
      participantIds,
      participantsPerMatch: 4,
      teamsPerMatch: 2,
      oddParticipantMode: 'bye',
      allowExtraAtTable: false,
      history: emptyHistory(),
      locked: [{ tableNumber: 1, participantIds: ['p1', 'p3', 'p5', 'p7'] }],
    });
    if (!outcome.ok) throw new Error('geen indeling');

    const first = outcome.proposal.matches.find((match) => match.tableNumber === 1);
    expect(first?.participantIds).toEqual(['p1', 'p3', 'p5', 'p7']);
    expect(validatePairing(outcome.proposal.matches, constraints)).toEqual([]);
  });
});

describe('seating', () => {
  it('puts partners opposite each other', () => {
    expect(sidesOf(['a', 'b', 'c', 'd'], 2)).toEqual([
      ['a', 'c'],
      ['b', 'd'],
    ]);
  });

  it('gives everyone their own side when the table plays individually', () => {
    expect(sidesOf(['a', 'b', 'c', 'd'], 4)).toEqual([['a'], ['b'], ['c'], ['d']]);
  });

  it('keys a pair the same way round either way', () => {
    expect(pairKey('a', 'b')).toBe(pairKey('b', 'a'));
  });
});
