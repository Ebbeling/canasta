import type { ValidationIssue } from '@/domain/result';
import type { OddParticipantMode, ParticipantId } from '@/domain/tournament';
import {
  opponentCount,
  pairKey,
  partnerCount,
  sidesOf,
  type PairingHistory,
} from './history';

/**
 * Who sits where, next round.
 *
 * The engine is a search, not a shuffle. It arranges the participants into
 * tables, scores the arrangement against everything that has already been
 * played, and keeps the best one it finds. It is deterministic: the same
 * tournament state always produces the same proposal, so "Opnieuw indelen"
 * after a withdrawal gives a considered answer rather than a different roll of
 * the dice.
 *
 * ## What it may never do
 *
 * Validity is not traded for quality. A proposal that seats somebody twice, or
 * splits a permanent team, or fills a table wrongly is not a worse answer — it
 * is not an answer. When no perfect arrangement exists, and after a few rounds
 * none usually does, the engine returns the least bad *valid* one.
 *
 * ## What it optimises, in order
 *
 *   1. repeated partners        — much the worst thing to repeat
 *   2. repeated opponents
 *   3. an even spread of encounters, rather than a few heavy ones
 *   4. an even share of byes and of table numbers
 *
 * The weights below are steep enough that a single repeated partnership
 * outweighs any number of improvements further down the list.
 */

export interface PairingRequest {
  /** Everyone available for this round, in a stable order. */
  participantIds: readonly ParticipantId[];
  /** How many participants a table seats. */
  participantsPerMatch: number;
  /** How many sides play against each other at a table. */
  teamsPerMatch: number;
  oddParticipantMode: OddParticipantMode;
  /** True when a table may hold one participant more than planned. */
  allowExtraAtTable: boolean;
  history: PairingHistory;
  /** Tables the organiser has fixed by hand; the engine fills the rest. */
  locked?: readonly LockedTable[];
  /** How hard to search. Higher is slower and rarely better. */
  effort?: number;
}

export interface LockedTable {
  tableNumber: number;
  participantIds: readonly ParticipantId[];
}

export interface ProposedMatch {
  tableNumber: number;
  kind: 'game' | 'bye';
  participantIds: ParticipantId[];
}

export interface PairingProposal {
  matches: ProposedMatch[];
  /** What the arrangement costs; lower is better. Comparable within one round. */
  cost: number;
  /** Repeated partnerships this arrangement could not avoid. */
  repeatedPartners: number;
  /** Repeated opponents it could not avoid. */
  repeatedOpponents: number;
  /** Anything worth telling the organiser. Never contains errors. */
  issues: ValidationIssue[];
}

export type PairingOutcome =
  | { ok: true; proposal: PairingProposal }
  | { ok: false; issues: ValidationIssue[] };

/* ------------------------------------------------------------------ weights */

const REPEAT_PARTNER = 1_000;
const REPEAT_OPPONENT = 40;
/** Each further repeat of the same pair hurts more than the one before it. */
const REPEAT_GROWTH = 3;
const UNEVEN_BYES = 12;
const REPEAT_TABLE = 1;

/* ----------------------------------------------------------------- planning */

export interface TablePlan {
  /** Seats per table, in table order. */
  sizes: number[];
  /** Participants who sit this round out. */
  byeCount: number;
  issues: ValidationIssue[];
}

/**
 * How many tables there are and how many seats each one has.
 *
 * With a remainder, the tournament's own setting decides: either one table
 * takes an extra participant, or the remainder sits out. An extra seat is only
 * possible at a table of individuals — a rule set has one team size, so three
 * against two is not a shape a game can be given.
 */
export function planTables(
  count: number,
  participantsPerMatch: number,
  oddParticipantMode: OddParticipantMode,
  allowExtraAtTable: boolean,
): TablePlan {
  const issues: ValidationIssue[] = [];

  if (participantsPerMatch < 2) {
    return {
      sizes: [],
      byeCount: count,
      issues: [
        {
          code: 'pairing.tableSize',
          severity: 'error',
          message: 'Een tafel heeft minstens twee deelnemers nodig.',
        },
      ],
    };
  }

  const fullTables = Math.floor(count / participantsPerMatch);
  const remainder = count % participantsPerMatch;

  if (fullTables === 0) {
    return {
      sizes: [],
      byeCount: count,
      issues: [
        {
          code: 'pairing.tooFew',
          severity: 'error',
          message: `Er zijn minstens ${participantsPerMatch} deelnemers nodig voor één tafel.`,
        },
      ],
    };
  }

  const sizes = Array.from({ length: fullTables }, () => participantsPerMatch);
  if (remainder === 0) return { sizes, byeCount: 0, issues };

  if (oddParticipantMode === 'extra-player-at-table' && allowExtraAtTable) {
    // Spread the remainder over the last tables, one seat each; more than one
    // extra per table would leave the same table lopsided twice over.
    if (remainder > fullTables) {
      issues.push({
        code: 'pairing.remainderTooLarge',
        severity: 'warning',
        message: `${remainder - fullTables} deelnemers zijn deze ronde vrij: er is niet genoeg ruimte om iedereen bij te schuiven.`,
      });
    }
    const extras = Math.min(remainder, fullTables);
    for (let i = 0; i < extras; i += 1) {
      sizes[sizes.length - 1 - i]! += 1;
    }
    return { sizes, byeCount: remainder - extras, issues };
  }

  if (oddParticipantMode === 'extra-player-at-table' && !allowExtraAtTable) {
    issues.push({
      code: 'pairing.extraNotPossible',
      severity: 'warning',
      message:
        'Aan een tafel met vaste teams kan er niemand bijschuiven, dus de overgebleven deelnemers zijn deze ronde vrij.',
    });
  }

  return { sizes, byeCount: remainder, issues };
}

/* ---------------------------------------------------------------- the search */

interface Context {
  history: PairingHistory;
  sides: number;
}

/** What one table costs against everything already played. */
function tableCost(seats: readonly ParticipantId[], context: Context): number {
  const sides = sidesOf(seats, context.sides);
  let cost = 0;

  for (const side of sides) {
    for (let i = 0; i < side.length; i += 1) {
      for (let j = i + 1; j < side.length; j += 1) {
        const seen = partnerCount(context.history, side[i]!, side[j]!);
        if (seen > 0) cost += REPEAT_PARTNER * REPEAT_GROWTH ** (seen - 1);
      }
    }
  }

  for (let a = 0; a < sides.length; a += 1) {
    for (let b = a + 1; b < sides.length; b += 1) {
      for (const one of sides[a]!) {
        for (const other of sides[b]!) {
          const seen = opponentCount(context.history, one, other);
          if (seen > 0) cost += REPEAT_OPPONENT * REPEAT_GROWTH ** (seen - 1);
        }
      }
    }
  }

  return cost;
}

function byeCost(id: ParticipantId, history: PairingHistory): number {
  const had = history.byes.get(id) ?? 0;
  return UNEVEN_BYES * (had + 1) ** 2;
}

function tablePreferenceCost(
  seats: readonly ParticipantId[],
  tableNumber: number,
  history: PairingHistory,
): number {
  let cost = 0;
  for (const id of seats) {
    const before = history.tables.get(id) ?? [];
    cost += REPEAT_TABLE * before.filter((table) => table === tableNumber).length;
  }
  return cost;
}

/** Counts the repeats an arrangement did not manage to avoid. */
function countRepeats(
  matches: readonly ProposedMatch[],
  context: Context,
): { partners: number; opponents: number } {
  let partners = 0;
  let opponents = 0;

  for (const match of matches) {
    if (match.kind === 'bye') continue;
    const sides = sidesOf(match.participantIds, context.sides);

    for (const side of sides) {
      for (let i = 0; i < side.length; i += 1) {
        for (let j = i + 1; j < side.length; j += 1) {
          if (partnerCount(context.history, side[i]!, side[j]!) > 0) partners += 1;
        }
      }
    }
    for (let a = 0; a < sides.length; a += 1) {
      for (let b = a + 1; b < sides.length; b += 1) {
        for (const one of sides[a]!) {
          for (const other of sides[b]!) {
            if (opponentCount(context.history, one, other) > 0) opponents += 1;
          }
        }
      }
    }
  }

  return { partners, opponents };
}

/**
 * A deterministic shuffle.
 *
 * The search needs to try more than one starting order, but "more than one"
 * must not mean "a different one every time". A small integer generator seeded
 * with the attempt number gives a reproducible spread of orders.
 */
function reorder(ids: readonly ParticipantId[], seed: number): ParticipantId[] {
  const out = [...ids];
  let state = seed * 2_654_435_761 + 1;

  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (state * 1_103_515_245 + 12_345) & 0x7fffffff;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }

  return out;
}

/**
 * Fills the tables greedily from one ordering.
 *
 * Seats are filled one at a time, and each seat takes whichever remaining
 * participant costs least there. That keeps the work proportional to the number
 * of seats rather than to every possible arrangement, which matters: eight
 * tables of four have more arrangements than there are atoms to count them
 * with.
 */
function greedy(
  available: readonly ParticipantId[],
  sizes: readonly number[],
  firstTable: number,
  context: Context,
): ProposedMatch[] {
  const pool = [...available];
  const matches: ProposedMatch[] = [];

  sizes.forEach((size, index) => {
    const tableNumber = firstTable + index;
    const seats: ParticipantId[] = [];

    for (let seat = 0; seat < size; seat += 1) {
      let bestIndex = 0;
      let bestCost = Number.POSITIVE_INFINITY;

      for (let candidate = 0; candidate < pool.length; candidate += 1) {
        const trial = [...seats, pool[candidate]!];
        const cost =
          tableCost(trial, context) + tablePreferenceCost(trial, tableNumber, context.history);
        if (cost < bestCost) {
          bestCost = cost;
          bestIndex = candidate;
        }
      }

      const chosen = pool.splice(bestIndex, 1)[0];
      if (chosen !== undefined) seats.push(chosen);
    }

    matches.push({ tableNumber, kind: 'game', participantIds: seats });
  });

  return matches;
}

/**
 * Improves an arrangement by swapping two seats at a time.
 *
 * Greedy filling gets the early tables right and leaves the last one with
 * whoever is left. Swapping pairs of seats until nothing improves fixes most of
 * that, and it cannot break validity: a swap moves two participants between
 * seats that both already existed.
 */
function improve(matches: ProposedMatch[], context: Context): ProposedMatch[] {
  const playable = matches.filter((match) => match.kind === 'game');
  let improved = true;
  let guard = 0;

  while (improved && guard < 40) {
    improved = false;
    guard += 1;

    for (let a = 0; a < playable.length; a += 1) {
      for (let b = a; b < playable.length; b += 1) {
        const first = playable[a]!;
        const second = playable[b]!;

        for (let i = 0; i < first.participantIds.length; i += 1) {
          for (let j = 0; j < second.participantIds.length; j += 1) {
            if (a === b && j <= i) continue;

            const before =
              a === b
                ? tableCost(first.participantIds, context)
                : tableCost(first.participantIds, context) +
                  tableCost(second.participantIds, context);

            const firstSeats = [...first.participantIds];
            const secondSeats = a === b ? firstSeats : [...second.participantIds];
            [firstSeats[i], secondSeats[j]] = [secondSeats[j]!, firstSeats[i]!];

            const after =
              a === b
                ? tableCost(firstSeats, context)
                : tableCost(firstSeats, context) + tableCost(secondSeats, context);

            if (after < before) {
              first.participantIds = firstSeats;
              if (a !== b) second.participantIds = secondSeats;
              improved = true;
            }
          }
        }
      }
    }
  }

  return matches;
}

function totalCost(matches: readonly ProposedMatch[], context: Context): number {
  let cost = 0;
  for (const match of matches) {
    if (match.kind === 'bye') {
      for (const id of match.participantIds) cost += byeCost(id, context.history);
      continue;
    }
    cost +=
      tableCost(match.participantIds, context) +
      tablePreferenceCost(match.participantIds, match.tableNumber, context.history);
  }
  return cost;
}

/**
 * Who sits out, when somebody must.
 *
 * Whoever has sat out least often; ties go to the order the participants are
 * listed in, so the choice is reproducible.
 */
function chooseByes(
  available: readonly ParticipantId[],
  count: number,
  history: PairingHistory,
): { byes: ParticipantId[]; playing: ParticipantId[] } {
  if (count <= 0) return { byes: [], playing: [...available] };

  const ordered = available
    .map((id, index) => ({ id, index, had: history.byes.get(id) ?? 0 }))
    .sort((a, b) => a.had - b.had || a.index - b.index);

  const byes = ordered.slice(0, count).map((entry) => entry.id);
  const chosen = new Set(byes);
  return { byes, playing: available.filter((id) => !chosen.has(id)) };
}

/* --------------------------------------------------------------- validation */

export interface PairingConstraints {
  participantIds: readonly ParticipantId[];
  participantsPerMatch: number;
  allowExtraAtTable: boolean;
}

/**
 * Whether an arrangement may be confirmed.
 *
 * Used for the engine's own proposals and, more importantly, for anything the
 * organiser has rearranged by hand. A pairing that fails here is never stored.
 */
export function validatePairing(
  matches: readonly ProposedMatch[],
  constraints: PairingConstraints,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const eligible = new Set(constraints.participantIds);
  const seen = new Map<ParticipantId, number>();

  for (const match of matches) {
    for (const id of match.participantIds) {
      seen.set(id, (seen.get(id) ?? 0) + 1);
      if (!eligible.has(id)) {
        issues.push({
          code: 'pairing.notEligible',
          severity: 'error',
          message: 'Een deelnemer die niet meedoet is toch ingedeeld.',
        });
      }
    }
  }

  const twice = [...seen.entries()].filter(([, count]) => count > 1);
  if (twice.length > 0) {
    issues.push({
      code: 'pairing.duplicate',
      severity: 'error',
      message: `${twice.length === 1 ? 'Een deelnemer zit' : `${twice.length} deelnemers zitten`} aan meer dan één tafel.`,
    });
  }

  const missing = [...eligible].filter((id) => !seen.has(id));
  if (missing.length > 0) {
    issues.push({
      code: 'pairing.unassigned',
      severity: 'error',
      message: `${missing.length === 1 ? 'Eén deelnemer is' : `${missing.length} deelnemers zijn`} nog niet ingedeeld.`,
    });
  }

  const maximum = constraints.participantsPerMatch + (constraints.allowExtraAtTable ? 1 : 0);
  for (const match of matches) {
    if (match.kind === 'bye') {
      if (match.participantIds.length !== 1) {
        issues.push({
          code: 'pairing.byeSize',
          severity: 'error',
          message: 'Een vrije ronde geldt voor één deelnemer tegelijk.',
        });
      }
      continue;
    }

    if (match.participantIds.length < constraints.participantsPerMatch) {
      issues.push({
        code: 'pairing.tableTooSmall',
        severity: 'error',
        message: `Tafel ${match.tableNumber} heeft te weinig deelnemers.`,
      });
    }
    if (match.participantIds.length > maximum) {
      issues.push({
        code: 'pairing.tableTooLarge',
        severity: 'error',
        message: `Tafel ${match.tableNumber} heeft te veel deelnemers.`,
      });
    }
  }

  return issues;
}

/* ----------------------------------------------------------------- the entry */

/** Arranges the next round. */
export function proposePairing(request: PairingRequest): PairingOutcome {
  const {
    participantIds,
    participantsPerMatch,
    teamsPerMatch,
    oddParticipantMode,
    allowExtraAtTable,
    history,
  } = request;

  const lockedTables = request.locked ?? [];
  const lockedIds = new Set(lockedTables.flatMap((table) => table.participantIds));
  const free = participantIds.filter((id) => !lockedIds.has(id));

  const stranger = [...lockedIds].filter((id) => !participantIds.includes(id));
  if (stranger.length > 0) {
    return {
      ok: false,
      issues: [
        {
          code: 'pairing.lockedNotEligible',
          severity: 'error',
          message: 'Een vastgezette tafel bevat iemand die niet meedoet.',
        },
      ],
    };
  }

  const plan = planTables(
    free.length,
    participantsPerMatch,
    oddParticipantMode,
    allowExtraAtTable,
  );

  const blocking = plan.issues.filter((issue) => issue.severity === 'error');
  if (blocking.length > 0 && lockedTables.length === 0) {
    return { ok: false, issues: plan.issues };
  }

  const context: Context = { history, sides: teamsPerMatch };
  const { byes, playing } = chooseByes(free, plan.byeCount, history);

  const firstTable = lockedTables.length + 1;
  const effort = request.effort ?? 24;

  let best: ProposedMatch[] | undefined;
  let bestCost = Number.POSITIVE_INFINITY;

  for (let attempt = 0; attempt < Math.max(effort, 1); attempt += 1) {
    const ordering = attempt === 0 ? playing : reorder(playing, attempt);
    const filled = improve(greedy(ordering, plan.sizes, firstTable, context), context);
    const cost = totalCost(filled, context);

    if (cost < bestCost) {
      bestCost = cost;
      best = filled;
      // Nothing repeats: no further search can do better.
      if (cost === 0) break;
    }
  }

  const matches: ProposedMatch[] = [
    ...lockedTables.map((table) => ({
      tableNumber: table.tableNumber,
      kind: 'game' as const,
      participantIds: [...table.participantIds],
    })),
    ...(best ?? []),
    ...byes.map((id, index) => ({
      tableNumber: firstTable + plan.sizes.length + index,
      kind: 'bye' as const,
      participantIds: [id],
    })),
  ];

  const repeats = countRepeats(matches, context);
  const warnings = plan.issues.filter((issue) => issue.severity !== 'error');

  if (repeats.partners > 0) {
    warnings.push({
      code: 'pairing.repeatedPartners',
      severity: 'warning',
      message: `${repeats.partners === 1 ? 'Eén paar speelt' : `${repeats.partners} paren spelen`} opnieuw samen; een indeling zonder herhaling is met deze deelnemers niet meer mogelijk.`,
    });
  }

  return {
    ok: true,
    proposal: {
      matches,
      cost: totalCost(matches, context),
      repeatedPartners: repeats.partners,
      repeatedOpponents: repeats.opponents,
      issues: warnings,
    },
  };
}

export { pairKey };
