import { newId, type GameId, type RoundId } from '@/domain/ids';
import type { Game } from '@/domain/game';
import type { Round, RoundComputation, TeamRoundInput } from '@/domain/round';
import type { ValidationIssue } from '@/domain/result';
import { hasErrors } from '@/domain/result';
import { recomputeGame } from '@/scoring/recompute';
import { validateRound } from '@/scoring/validateRound';
import type { Clock, IsoTimestamp, Repositories } from '@/application/ports';
import { applyProjection } from './gameService';

export type SaveRoundOutcome =
  | { ok: true; game: Game; rounds: Round[] }
  | { ok: false; reason: 'validation'; issues: ValidationIssue[] }
  | { ok: false; reason: 'notFound' }
  | { ok: false; reason: 'conflict'; message: string }
  | { ok: false; reason: 'storage'; message: string };

export interface RoundDraftData {
  inputs: TeamRoundInput[];
  note?: string;
}

export interface RoundService {
  saveNew(args: {
    gameId: GameId;
    inputs: readonly TeamRoundInput[];
    note?: string;
    expectedUpdatedAt?: IsoTimestamp;
  }): Promise<SaveRoundOutcome>;

  correct(args: {
    gameId: GameId;
    roundId: RoundId;
    inputs: readonly TeamRoundInput[];
    note?: string;
    expectedUpdatedAt?: IsoTimestamp;
  }): Promise<SaveRoundOutcome>;

  remove(args: { gameId: GameId; roundId: RoundId }): Promise<SaveRoundOutcome>;

  saveDraft(key: string, gameId: GameId, data: RoundDraftData): Promise<void>;
  loadDraft(key: string): Promise<RoundDraftData | undefined>;
  discardDraft(key: string): Promise<void>;
}

export interface RoundServiceDeps {
  repositories: Repositories;
  clock: Clock;
}

/** Draft key for a new round, or for a correction of an existing one. */
export function roundDraftKey(gameId: GameId, roundId?: RoundId): string {
  return roundId ? `roundEntry:${gameId}:${roundId}` : `roundEntry:${gameId}`;
}

/**
 * Whether a round's computation actually changed.
 *
 * `computedAt` is deliberately excluded: `evaluateRound` stamps it with the
 * current time on every call, so a deep comparison would always differ and
 * every round would be rewritten on every save.
 */
function computationChanged(before: Round | undefined, after: Round): boolean {
  if (!before?.computed || !after.computed) return true;

  const strip = (computation: RoundComputation) => ({
    scores: computation.scores,
    scoreBefore: computation.scoreBefore,
    scoreAfter: computation.scoreAfter,
    initialMeldRequirement: computation.initialMeldRequirement,
    issues: computation.issues,
    engineVersion: computation.engineVersion,
  });

  return JSON.stringify(strip(before.computed)) !== JSON.stringify(strip(after.computed));
}

export function createRoundService(deps: RoundServiceDeps): RoundService {
  const { repositories, clock } = deps;

  /**
   * Replays the game against a patched round list and writes everything that
   * moved, in one transaction. `drafts` is in the store list because the draft
   * is cleared here — Dexie only reuses a parent transaction when the child's
   * table set is a subset of it.
   */
  async function commit(
    gameId: GameId,
    expectedUpdatedAt: IsoTimestamp | undefined,
    patch: (game: Game, stored: Round[]) => Round[] | { issues: ValidationIssue[] },
    draftKey: string,
  ): Promise<SaveRoundOutcome> {
    try {
      return await repositories.transaction(['games', 'rounds', 'drafts'], async () => {
        const game = await repositories.games.get(gameId);
        if (!game) return { ok: false, reason: 'notFound' } as const;

        if (expectedUpdatedAt && game.updatedAt !== expectedUpdatedAt) {
          return {
            ok: false,
            reason: 'conflict',
            message: 'Dit spel is ondertussen elders gewijzigd. Ververs en probeer opnieuw.',
          } as const;
        }

        const stored = await repositories.rounds.listByGame(gameId);
        const patched = patch(game, stored);
        if (!Array.isArray(patched)) {
          return { ok: false, reason: 'validation', issues: patched.issues } as const;
        }

        const { rounds, projection } = recomputeGame({ game, rounds: patched });
        const storedById = new Map(stored.map((round) => [round.id, round]));

        for (const round of rounds) {
          if (!storedById.has(round.id)) {
            await repositories.rounds.create(round);
          } else if (computationChanged(storedById.get(round.id), round)) {
            await repositories.rounds.update(round);
          }
        }

        for (const round of stored) {
          if (!rounds.some((item) => item.id === round.id)) {
            await repositories.rounds.delete(round.id);
          }
        }

        const next = applyProjection(game, projection, rounds.length, clock.now());
        await repositories.games.update(next);
        await repositories.drafts.delete(draftKey);

        return { ok: true, game: next, rounds } as const;
      });
    } catch (error) {
      return { ok: false, reason: 'storage', message: (error as Error).message };
    }
  }

  /** Blocking validation. Warnings deliberately do not block (spec §14.1). */
  function blockingIssues(game: Game, roundNumber: number, inputs: readonly TeamRoundInput[]) {
    const issues = validateRound({
      ruleSet: game.effectiveRuleSet,
      teamIds: game.teams.map((team) => team.id),
      roundNumber,
      inputs,
      scoreBefore: game.summary?.totalsByTeam ?? {},
    });
    return hasErrors(issues) ? issues.filter((issue) => issue.severity === 'error') : undefined;
  }

  return {
    saveNew({ gameId, inputs, note, expectedUpdatedAt }) {
      return commit(
        gameId,
        expectedUpdatedAt,
        (game, stored) => {
          const errors = blockingIssues(game, stored.length + 1, inputs);
          if (errors) return { issues: errors };

          const timestamp = clock.now();
          const nextSequence = stored.reduce((max, round) => Math.max(max, round.sequence), 0) + 1;

          const round: Round = {
            id: newId(),
            gameId,
            sequence: nextSequence,
            status: 'committed',
            createdAt: timestamp,
            updatedAt: timestamp,
            input: { teams: inputs.map((input) => ({ ...input, extra: { ...input.extra } })) },
            note,
          };

          return [...stored, round];
        },
        roundDraftKey(gameId),
      );
    },

    correct({ gameId, roundId, inputs, note, expectedUpdatedAt }) {
      return commit(
        gameId,
        expectedUpdatedAt,
        (game, stored) => {
          const index = stored.findIndex((round) => round.id === roundId);
          if (index === -1) return { issues: [] };

          const errors = blockingIssues(game, index + 1, inputs);
          if (errors) return { issues: errors };

          return stored.map((round) =>
            round.id === roundId
              ? {
                  ...round,
                  input: {
                    teams: inputs.map((input) => ({ ...input, extra: { ...input.extra } })),
                  },
                  note,
                  updatedAt: clock.now(),
                }
              : round,
          );
        },
        roundDraftKey(gameId, roundId),
      );
    },

    remove({ gameId, roundId }) {
      return commit(
        gameId,
        undefined,
        // Sequences are never renumbered; only the display position shifts.
        (_game, stored) => stored.filter((round) => round.id !== roundId),
        roundDraftKey(gameId, roundId),
      );
    },

    async saveDraft(key, gameId, data) {
      await repositories.drafts.put({ key, kind: 'roundEntry', gameId, data });
    },

    async loadDraft(key) {
      const draft = await repositories.drafts.get<RoundDraftData>(key);
      return draft?.data;
    },

    async discardDraft(key) {
      await repositories.drafts.delete(key);
    },
  };
}
