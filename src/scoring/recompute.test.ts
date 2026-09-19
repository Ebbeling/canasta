import { describe, expect, it } from 'vitest';
import { recomputeGame } from './recompute';
import { ENGINE_VERSION } from './scoreEngine';
import type { Round, TeamRoundInput } from '@/domain/round';
import { classic } from '@/rules/builtin';
import { cloneRuleSet, freezeForGame, resolveRuleSet } from '@/rules/resolve/resolveRuleSet';
import { makeGame, TEAM_A, TEAM_B, teamInput } from '@/test/fixtures';

function round(
  sequence: number,
  a: Partial<TeamRoundInput>,
  b: Partial<TeamRoundInput> = {},
): Round {
  return {
    id: `round-${sequence}`,
    gameId: 'game-1',
    sequence,
    status: 'committed',
    createdAt: '2026-09-19T10:00:00.000Z',
    updatedAt: '2026-09-19T10:00:00.000Z',
    input: { teams: [teamInput(TEAM_A, a), teamInput(TEAM_B, b)] },
  };
}

const game = makeGame(freezeForGame(classic));

/** Five rounds of 400 for team A and 300 for team B. */
function fiveRounds(): Round[] {
  return [1, 2, 3, 4, 5].map((sequence) =>
    round(sequence, { cardPoints: 400, opened: true }, { cardPoints: 300, opened: true }),
  );
}

describe('recomputeGame — the fold', () => {
  it('accumulates totals across rounds', () => {
    const { projection } = recomputeGame({ game, rounds: fiveRounds() });

    expect(projection.totalsByTeam[TEAM_A]).toBe(2000);
    expect(projection.totalsByTeam[TEAM_B]).toBe(1500);
  });

  it('ranks the standings highest first', () => {
    const { projection } = recomputeGame({ game, rounds: fiveRounds() });

    expect(projection.standings.map((entry) => [entry.teamId, entry.rank])).toEqual([
      [TEAM_A, 1],
      [TEAM_B, 2],
    ]);
  });

  it('stamps the engine version on every computation', () => {
    const { rounds } = recomputeGame({ game, rounds: fiveRounds() });

    for (const item of rounds) {
      expect(item.computed?.engineVersion).toBe(ENGINE_VERSION);
    }
  });

  it('orders by sequence regardless of the input order', () => {
    const shuffled = [...fiveRounds()].reverse();
    const { rounds } = recomputeGame({ game, rounds: shuffled });

    expect(rounds.map((item) => item.sequence)).toEqual([1, 2, 3, 4, 5]);
  });

  it('is pure: it neither mutates its arguments nor varies between runs', () => {
    const input = fiveRounds();
    const snapshot = structuredClone(input);

    const first = recomputeGame({ game, rounds: input });
    const second = recomputeGame({ game, rounds: input });

    expect(input).toEqual(snapshot);
    expect(first.projection.totalsByTeam).toEqual(second.projection.totalsByTeam);
  });

  it('handles a game with no rounds', () => {
    const { projection } = recomputeGame({ game, rounds: [] });

    expect(projection.totalsByTeam).toEqual({ [TEAM_A]: 0, [TEAM_B]: 0 });
    expect(projection.status).toBe('active');
    expect(projection.next.roundNumber).toBe(1);
  });
});

describe('recomputeGame — corrections cascade (§23)', () => {
  it('shifts every downstream total by exactly the delta', () => {
    const before = recomputeGame({ game, rounds: fiveRounds() });

    const edited = fiveRounds();
    edited[1] = round(2, { cardPoints: 600, opened: true }, { cardPoints: 300, opened: true });
    const after = recomputeGame({ game, rounds: edited });

    expect(after.projection.totalsByTeam[TEAM_A]! - before.projection.totalsByTeam[TEAM_A]!).toBe(
      200,
    );
    // Rounds 1 is untouched; rounds 2..5 all move.
    expect(after.rounds[0]!.computed!.scoreAfter[TEAM_A]).toBe(
      before.rounds[0]!.computed!.scoreAfter[TEAM_A],
    );
    for (const index of [1, 2, 3, 4]) {
      expect(after.rounds[index]!.computed!.scoreAfter[TEAM_A]).toBe(
        before.rounds[index]!.computed!.scoreAfter[TEAM_A]! + 200,
      );
    }
    // The opposing team is unaffected.
    expect(after.projection.totalsByTeam[TEAM_B]).toBe(before.projection.totalsByTeam[TEAM_B]);
  });

  it('changes a later round‘s initial-meld requirement when the edit crosses a boundary', () => {
    const below = [round(1, { cardPoints: 1490, opened: true })];
    const above = [round(1, { cardPoints: 1510, opened: true })];

    expect(
      recomputeGame({ game, rounds: below }).projection.next.initialMeldRequirement[TEAM_A],
    ).toBe(50);
    expect(
      recomputeGame({ game, rounds: above }).projection.next.initialMeldRequirement[TEAM_A],
    ).toBe(90);
  });

  it('records the requirement that applied in each round, not the current one', () => {
    const rounds = [
      round(1, { cardPoints: 1600, opened: true }),
      round(2, { cardPoints: 100, opened: true }),
    ];
    const { rounds: computed } = recomputeGame({ game, rounds });

    // Round 1 was played from 0 (→ 50); round 2 from 1600 (→ 90).
    expect(computed[0]!.computed!.initialMeldRequirement[TEAM_A]).toBe(50);
    expect(computed[1]!.computed!.initialMeldRequirement[TEAM_A]).toBe(90);
  });

  it('does not renumber sequences when a round is removed', () => {
    const remaining = fiveRounds().filter((item) => item.sequence !== 2);
    const { rounds } = recomputeGame({ game, rounds: remaining });

    expect(rounds.map((item) => item.sequence)).toEqual([1, 3, 4, 5]);
    expect(rounds.at(-1)!.computed!.scoreAfter[TEAM_A]).toBe(1600);
  });
});

describe('recomputeGame — end of game', () => {
  const reachTarget = (aPoints: number, bPoints: number): Round[] => [
    round(1, { cardPoints: aPoints, opened: true }, { cardPoints: bPoints, opened: true }),
  ];

  it('finishes the game and names the higher total as winner', () => {
    const { projection } = recomputeGame({ game, rounds: reachTarget(5200, 4800) });

    expect(projection.status).toBe('finished');
    expect(projection.result?.winnerTeamIds).toEqual([TEAM_A]);
    expect(projection.result?.tie).toBe(false);
  });

  it('stays active until someone reaches the target', () => {
    const { projection } = recomputeGame({ game, rounds: reachTarget(4000, 3000) });

    expect(projection.status).toBe('active');
    expect(projection.result).toBeUndefined();
  });

  it('plays another round on an exact tie, which is the app policy', () => {
    const { projection } = recomputeGame({ game, rounds: reachTarget(5200, 5200) });

    expect(projection.status).toBe('active');
    expect(projection.result).toBeUndefined();
  });

  it('declares a shared win when the rule set is configured that way', () => {
    const sharedWin = makeGame(
      freezeForGame(classic, [{ path: 'endGame.winner.tie', value: 'shared-win' }]),
    );
    const { projection } = recomputeGame({ game: sharedWin, rounds: reachTarget(5200, 5200) });

    expect(projection.status).toBe('finished');
    expect(projection.result?.tie).toBe(true);
    expect(projection.result?.winnerTeamIds.sort()).toEqual([TEAM_A, TEAM_B].sort());
  });

  it('un-finishes a game when a correction takes the leader back below the target', () => {
    const finished = recomputeGame({ game, rounds: reachTarget(5200, 4800) });
    expect(finished.projection.status).toBe('finished');

    const corrected = recomputeGame({ game, rounds: reachTarget(4200, 4800) });
    expect(corrected.projection.status).toBe('active');
    expect(corrected.projection.result).toBeUndefined();
  });
});

describe('a started game is immune to later rule set edits (§13)', () => {
  it('keeps its own target score when the preset moves on', () => {
    const preset = {
      ...cloneRuleSet(classic, { id: 'custom-1', name: 'Mijn Canasta' }),
      overrides: [{ path: 'endGame.targetScore', value: 5000 }],
    };
    const started = makeGame(freezeForGame(resolveRuleSet(preset)));

    // The preset is edited after the game began.
    const edited = resolveRuleSet({
      ...preset,
      overrides: [{ path: 'endGame.targetScore', value: 7000 }],
    });

    expect(edited.configuration.endGame.targetScore).toBe(7000);
    expect(started.effectiveRuleSet.configuration.endGame.targetScore).toBe(5000);

    // And the game still finishes at its own target, not the new one.
    const { projection } = recomputeGame({
      game: started,
      rounds: [round(1, { cardPoints: 5200, opened: true })],
    });
    expect(projection.status).toBe('finished');
  });
});
