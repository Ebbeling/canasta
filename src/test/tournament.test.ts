import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestStorage, type TestStorage } from '@/storage/testing';
import { fixedClock } from '@/storage/time';
import { BUILTIN_RULE_SETS, classic } from '@/rules/builtin';
import { createServices, type Services } from '@/application/services';
import { buildFieldLayout } from '@/application/viewmodels/roundForm';
import { blankInput } from '@/application/fields/access';
import { partyOverrides } from '@/application/viewmodels/setup';
import type { Tournament, TournamentGameSettings, TournamentSettings } from '@/domain/tournament';
import { historyOf } from '@/tournament/history';
import type { ProposedMatch } from '@/tournament/pairing';
import {
  buildDashboard,
  buildRound,
  buildStandingsView,
} from '@/application/viewmodels/tournamentView';

/**
 * A tournament, end to end.
 *
 * Everything here goes through the real services and a real database. What is
 * being proved is that a tournament organises ordinary games: the tables create
 * games through the ordinary game service, those games are scored by the
 * ordinary engine, and the standings are a reading of the results — never a
 * second copy of them.
 */

let storage: TestStorage;
let services: Services;

beforeEach(async () => {
  storage = await createTestStorage();
  services = createServices({
    repositories: storage.repositories,
    clock: fixedClock(),
    builtins: BUILTIN_RULE_SETS,
  });
});

afterEach(async () => {
  await storage.close();
});

const FOUR_PLAYER_TABLE: TournamentGameSettings = {
  ruleSetId: classic.id,
  ruleSetOrigin: 'builtin',
  ruleSetName: 'Classic Canasta',
  participantsPerMatch: 4,
  teamsPerMatch: 2,
  overrides: [],
};

/** A table of four individuals, each playing for themselves. */
const FOUR_INDIVIDUALS: TournamentGameSettings = {
  ...FOUR_PLAYER_TABLE,
  teamsPerMatch: 4,
  overrides: partyOverrides({ playerCount: 4, teamCount: 4, mode: 'individual' }),
};

const FIXED: TournamentSettings = {
  mode: 'fixed',
  scoringMode: 'tournament-points',
  drawAllowed: true,
  oddParticipantMode: 'bye',
  manualPairingAllowed: true,
  plannedDays: 2,
  plannedRoundsPerDay: 2,
};

const OPEN: TournamentSettings = {
  mode: 'open',
  scoringMode: 'canasta-score',
  drawAllowed: false,
  oddParticipantMode: 'bye',
  manualPairingAllowed: false,
};

function players(count: number) {
  return Array.from({ length: count }, (_unused, index) => ({
    kind: 'player' as const,
    name: `Speler ${index + 1}`,
    memberNames: [`Speler ${index + 1}`],
  }));
}

async function createTournament(
  settings: TournamentSettings = FIXED,
  gameSettings: TournamentGameSettings = FOUR_PLAYER_TABLE,
  participantCount = 8,
): Promise<Tournament> {
  const outcome = await services.tournaments.create({
    name: 'Clubkampioenschap',
    settings,
    gameSettings,
    participants: players(participantCount),
  });
  if (!outcome.ok) throw new Error('kon geen toernooi maken');
  return outcome.tournament;
}

/** Proposes and confirms the next round. */
async function playRound(tournament: Tournament): Promise<Tournament> {
  const proposal = await services.tournaments.propose(tournament.id);
  if (!proposal.ok) throw new Error('geen indeling');

  const matches: ProposedMatch[] = proposal.proposal.matches;
  const confirmed = await services.tournaments.confirmRound(tournament.id, matches);
  if (!confirmed.ok) throw new Error('ronde niet bevestigd');
  return confirmed.tournament;
}

/** Plays every table of the open round to a finish, with the given scores. */
async function finishRound(
  tournament: Tournament,
  scoreFor: (tableNumber: number, side: number) => number,
): Promise<Tournament> {
  let current = tournament;
  const round = current.rounds.at(-1)!;

  for (const match of round.matches) {
    if (match.kind === 'bye') continue;

    const started = await services.tournaments.startMatch(current.id, match.id);
    if (!started.ok) throw new Error('partij niet gestart');
    current = started.tournament;

    const game = started.game;
    const fields = buildFieldLayout(game.effectiveRuleSet).flatMap((group) => group.fields);

    // Enough rounds to carry one side past the target and finish the game.
    for (let n = 0; n < 6; n += 1) {
      await services.rounds.saveNew({
        gameId: game.id,
        inputs: game.teams.map((team, index) => ({
          ...blankInput(team.id, fields),
          cardPoints: scoreFor(match.tableNumber, index),
          opened: true,
        })),
      });
    }
  }

  return (await services.tournaments.get(current.id))!;
}

async function loaded(tournament: Tournament) {
  const result = await services.tournaments.load(tournament.id);
  if (!result) throw new Error('toernooi niet gevonden');
  return result;
}

describe('creating a tournament', () => {
  it('starts as upcoming, with no days and no rounds', async () => {
    const tournament = await createTournament();

    expect(tournament.status).toBe('upcoming');
    expect(tournament.days).toEqual([]);
    expect(tournament.rounds).toEqual([]);
    expect(tournament.participants).toHaveLength(8);
    expect(tournament.participants.every((entry) => entry.status === 'active')).toBe(true);
  });

  it('keeps a fixed tournament’s plan', async () => {
    const tournament = await createTournament(FIXED);
    expect(tournament.settings.plannedDays).toBe(2);
    expect(tournament.settings.plannedRoundsPerDay).toBe(2);
  });

  it('gives an open tournament no plan to run out of', async () => {
    const tournament = await createTournament(OPEN);
    expect(tournament.settings.plannedDays).toBeUndefined();
    expect(tournament.settings.mode).toBe('open');
  });

  it('refuses a tournament with too few participants for one table', async () => {
    const outcome = await services.tournaments.create({
      name: 'Te klein',
      settings: FIXED,
      gameSettings: FOUR_PLAYER_TABLE,
      participants: players(3),
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('validation');
  });

  it('refuses a tournament without a name', async () => {
    const outcome = await services.tournaments.create({
      name: '   ',
      settings: FIXED,
      gameSettings: FOUR_PLAYER_TABLE,
      participants: players(8),
    });
    expect(outcome.ok).toBe(false);
  });

  it('keeps permanent teams as one participant each', async () => {
    const outcome = await services.tournaments.create({
      name: 'Teams',
      settings: FIXED,
      gameSettings: { ...FOUR_PLAYER_TABLE, participantsPerMatch: 2, teamsPerMatch: 2 },
      participants: [
        { kind: 'team', name: 'Rood', memberNames: ['Anna', 'Bram'] },
        { kind: 'team', name: 'Groen', memberNames: ['Cees', 'Dana'] },
        { kind: 'team', name: 'Blauw', memberNames: ['Els', 'Frank'] },
        { kind: 'team', name: 'Geel', memberNames: ['Gijs', 'Hanna'] },
      ],
    });
    if (!outcome.ok) throw new Error('kon geen toernooi maken');

    expect(outcome.tournament.participants).toHaveLength(4);
    expect(outcome.tournament.participants[0]!.memberNames).toEqual(['Anna', 'Bram']);
  });
});

describe('a round', () => {
  it('opens the first day when it is confirmed', async () => {
    const tournament = await playRound(await createTournament());

    expect(tournament.status).toBe('active');
    expect(tournament.days).toHaveLength(1);
    expect(tournament.days[0]!.status).toBe('active');
    expect(tournament.rounds).toHaveLength(1);
    expect(tournament.rounds[0]!.status).toBe('confirmed');
    expect(tournament.rounds[0]!.matches).toHaveLength(2);
  });

  it('will not open a second round while one is still running', async () => {
    const tournament = await playRound(await createTournament());
    const proposal = await services.tournaments.propose(tournament.id);
    if (!proposal.ok) throw new Error('geen indeling');

    const outcome = await services.tournaments.confirmRound(
      tournament.id,
      proposal.proposal.matches,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('validation');
  });

  it('refuses an arrangement that seats somebody twice', async () => {
    const tournament = await createTournament();
    const ids = tournament.participants.map((entry) => entry.id);

    const outcome = await services.tournaments.confirmRound(tournament.id, [
      { tableNumber: 1, kind: 'game', participantIds: [ids[0]!, ids[1]!, ids[2]!, ids[3]!] },
      { tableNumber: 2, kind: 'game', participantIds: [ids[0]!, ids[5]!, ids[6]!, ids[7]!] },
    ]);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('validation');
  });

  it('creates an ordinary game behind a table, and only one', async () => {
    const tournament = await playRound(await createTournament());
    const match = tournament.rounds[0]!.matches[0]!;

    const first = await services.tournaments.startMatch(tournament.id, match.id);
    if (!first.ok) throw new Error('partij niet gestart');

    const second = await services.tournaments.startMatch(tournament.id, match.id);
    if (!second.ok) throw new Error('partij niet gevonden');

    expect(second.game.id).toBe(first.game.id);
    expect(first.game.players).toHaveLength(4);
    expect(first.game.teams).toHaveLength(2);
    // The game is a Classic game like any other, with its own frozen snapshot.
    expect(first.game.effectiveRuleSet.id).toBe(classic.id);
    expect(first.game.name).toContain('tafel');
  });

  it('cannot be closed while a table is still playing', async () => {
    const tournament = await playRound(await createTournament());
    const round = tournament.rounds[0]!;
    await services.tournaments.startMatch(tournament.id, round.matches[0]!.id);

    const outcome = await services.tournaments.completeRound(tournament.id, round.id);
    expect(outcome.ok).toBe(false);
  });

  it('closes once every table has a finished game', async () => {
    let tournament = await playRound(await createTournament());
    tournament = await finishRound(tournament, (_table, side) => (side === 0 ? 900 : 300));

    const outcome = await services.tournaments.completeRound(
      tournament.id,
      tournament.rounds[0]!.id,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.tournament.rounds[0]!.status).toBe('completed');
  });
});

describe('the pairing history', () => {
  it('grows out of the rounds that have been confirmed', async () => {
    let tournament = await playRound(await createTournament());
    tournament = await finishRound(tournament, (_table, side) => (side === 0 ? 900 : 300));
    const completed = await services.tournaments.completeRound(
      tournament.id,
      tournament.rounds[0]!.id,
    );
    if (!completed.ok) throw new Error('ronde niet afgesloten');

    const history = historyOf(completed.tournament);
    expect(history.rounds).toBe(1);
    // Two tables of four, two partnerships each: four partnerships in all.
    expect([...history.partners.values()]).toHaveLength(4);
    expect(history.played.size).toBe(8);
  });

  it('gives the next round different partners', async () => {
    let tournament = await playRound(await createTournament());
    tournament = await finishRound(tournament, (_table, side) => (side === 0 ? 900 : 300));
    const completed = await services.tournaments.completeRound(
      tournament.id,
      tournament.rounds[0]!.id,
    );
    if (!completed.ok) throw new Error('ronde niet afgesloten');

    const second = await playRound(completed.tournament);
    const history = historyOf(second);

    // Nobody has sat with the same partner twice after two rounds.
    expect(Math.max(...history.partners.values())).toBe(1);
  });
});

describe('withdrawing', () => {
  it('leaves a withdrawn participant out of the next pairing', async () => {
    const tournament = await createTournament(FIXED, FOUR_PLAYER_TABLE, 9);
    const victim = tournament.participants[8]!;

    const withdrawn = await services.tournaments.withdraw(tournament.id, victim.id);
    if (!withdrawn.ok) throw new Error('kon niet stoppen');

    const proposal = await services.tournaments.propose(tournament.id);
    if (!proposal.ok) throw new Error('geen indeling');

    const seated = proposal.proposal.matches.flatMap((match) => match.participantIds);
    expect(seated).not.toContain(victim.id);
    expect(seated).toHaveLength(8);
  });

  it('refuses to withdraw somebody who is sitting at a table right now', async () => {
    const tournament = await playRound(await createTournament());
    const seated = tournament.rounds[0]!.matches[0]!.participantIds[0]!;

    const outcome = await services.tournaments.withdraw(tournament.id, seated);
    expect(outcome.ok).toBe(false);
  });

  it('keeps what a withdrawn participant already played', async () => {
    let tournament = await playRound(await createTournament());
    tournament = await finishRound(tournament, (_table, side) => (side === 0 ? 900 : 300));
    const completed = await services.tournaments.completeRound(
      tournament.id,
      tournament.rounds[0]!.id,
    );
    if (!completed.ok) throw new Error('ronde niet afgesloten');

    const victim = completed.tournament.participants[0]!;
    const withdrawn = await services.tournaments.withdraw(completed.tournament.id, victim.id);
    if (!withdrawn.ok) throw new Error('kon niet stoppen');

    const view = buildStandingsView(await loaded(withdrawn.tournament));
    const row = view.rows.find((entry) => entry.participantId === victim.id);
    expect(row?.played).toBe(1);
    expect(row?.withdrawn).toBe(true);
  });
});

describe('the standings', () => {
  it('count two points for a win and none for a loss', async () => {
    let tournament = await playRound(await createTournament());
    tournament = await finishRound(tournament, (_table, side) => (side === 0 ? 900 : 300));

    const view = buildStandingsView(await loaded(tournament));
    const winners = view.rows.filter((row) => row.wins === 1);
    const losers = view.rows.filter((row) => row.losses === 1);

    expect(winners).toHaveLength(4);
    expect(losers).toHaveLength(4);
    expect(winners.every((row) => row.pointsText === '2')).toBe(true);
    expect(losers.every((row) => row.pointsText === '0')).toBe(true);
  });

  it('adds up the Canasta scores when that is the mode', async () => {
    let tournament = await playRound(await createTournament(OPEN));
    tournament = await finishRound(tournament, (_table, side) => (side === 0 ? 900 : 300));

    const view = buildStandingsView(await loaded(tournament));
    expect(view.pointsHeader).toBe('Score');
    // Six rounds at 900 a side, so the winning side is on 5.400.
    expect(view.rows[0]!.pointsText).toBe('5.400');
  });

  it('is provisional while a table is still playing', async () => {
    const tournament = await playRound(await createTournament());
    await services.tournaments.startMatch(tournament.id, tournament.rounds[0]!.matches[0]!.id);

    const view = buildStandingsView(await loaded(tournament));
    expect(view.provisional).toBe(true);
  });

  it('gives a bye no points and does not count it as a game', async () => {
    const tournament = await playRound(await createTournament(FIXED, FOUR_PLAYER_TABLE, 9));
    const bye = tournament.rounds[0]!.matches.find((match) => match.kind === 'bye');
    expect(bye).toBeDefined();

    const view = buildStandingsView(await loaded(tournament));
    const row = view.rows.find((entry) => entry.participantId === bye!.participantIds[0]);
    expect(row?.byes).toBe(1);
    expect(row?.played).toBe(0);
    expect(row?.pointsText).toBe('0');
  });

  it('counts a round somebody took no part in as missed, not as a bye', async () => {
    // Nine participants, one of whom withdraws before the round is arranged.
    const tournament = await createTournament(FIXED, FOUR_PLAYER_TABLE, 9);
    const absent = tournament.participants[8]!;
    const withdrawn = await services.tournaments.withdraw(tournament.id, absent.id);
    if (!withdrawn.ok) throw new Error('kon niet stoppen');

    const played = await playRound(withdrawn.tournament);
    const view = buildStandingsView(await loaded(played));
    const row = view.rows.find((entry) => entry.participantId === absent.id);

    expect(row?.missed).toBe(1);
    expect(row?.byes).toBe(0);
    expect(row?.played).toBe(0);
  });

  it('adds up over several rounds and several days', async () => {
    let tournament = await playRound(await createTournament());
    tournament = await finishRound(tournament, (_table, side) => (side === 0 ? 900 : 300));
    let step = await services.tournaments.completeRound(tournament.id, tournament.rounds[0]!.id);
    if (!step.ok) throw new Error('ronde niet afgesloten');

    const ended = await services.tournaments.endDay(step.tournament.id);
    if (!ended.ok) throw new Error('dag niet afgesloten');

    tournament = await playRound(ended.tournament);
    tournament = await finishRound(tournament, (_table, side) => (side === 0 ? 900 : 300));
    step = await services.tournaments.completeRound(tournament.id, tournament.rounds[1]!.id);
    if (!step.ok) throw new Error('ronde niet afgesloten');

    expect(step.tournament.days).toHaveLength(2);
    expect(step.tournament.rounds).toHaveLength(2);

    const view = buildStandingsView(await loaded(step.tournament));
    expect(view.rows.every((row) => row.played === 2)).toBe(true);
    // Two rounds, two points a win: the best possible is four.
    expect(Number(view.rows[0]!.pointsText)).toBeLessThanOrEqual(4);
  });
});

describe('an open tournament', () => {
  it('keeps running when a playing day ends, and resumes later', async () => {
    let tournament = await playRound(await createTournament(OPEN));
    tournament = await finishRound(tournament, (_table, side) => (side === 0 ? 900 : 300));
    const completed = await services.tournaments.completeRound(
      tournament.id,
      tournament.rounds[0]!.id,
    );
    if (!completed.ok) throw new Error('ronde niet afgesloten');

    const ended = await services.tournaments.endDay(completed.tournament.id);
    if (!ended.ok) throw new Error('dag niet afgesloten');

    expect(ended.tournament.status).toBe('active');
    expect(ended.tournament.days.every((day) => day.status === 'finished')).toBe(true);

    // A later day: confirming the next round opens one.
    const resumed = await playRound(ended.tournament);
    expect(resumed.days).toHaveLength(2);
    expect(resumed.days[1]!.status).toBe('active');
  });

  it('will not end a day while a round is still running', async () => {
    const tournament = await playRound(await createTournament(OPEN));
    const outcome = await services.tournaments.endDay(tournament.id);
    expect(outcome.ok).toBe(false);
  });

  it('finishes when the organiser says so', async () => {
    const tournament = await playRound(await createTournament(OPEN));
    const outcome = await services.tournaments.finish(tournament.id);
    if (!outcome.ok) throw new Error('niet afgerond');

    expect(outcome.tournament.status).toBe('finished');
    expect(outcome.tournament.finishedAt).toBeTruthy();
    expect(outcome.tournament.days.every((day) => day.status === 'finished')).toBe(true);
  });
});

describe('a fixed tournament', () => {
  it('counts down its planned rounds and then asks to finish', async () => {
    let tournament = await createTournament({
      ...FIXED,
      plannedDays: 1,
      plannedRoundsPerDay: 1,
    });

    tournament = await playRound(tournament);
    tournament = await finishRound(tournament, (_table, side) => (side === 0 ? 900 : 300));
    const completed = await services.tournaments.completeRound(
      tournament.id,
      tournament.rounds[0]!.id,
    );
    if (!completed.ok) throw new Error('ronde niet afgesloten');

    const dashboard = buildDashboard(await loaded(completed.tournament));
    expect(dashboard.progress).toEqual({ completed: 1, total: 1 });
    expect(dashboard.nextAction.kind).toBe('decideAfterRound');
  });
});

describe('what the dashboard says', () => {
  it('shows every table of the running round, with its own status', async () => {
    let tournament = await playRound(await createTournament());
    const round = tournament.rounds[0]!;

    // One table started, one not.
    const started = await services.tournaments.startMatch(tournament.id, round.matches[0]!.id);
    if (!started.ok) throw new Error('partij niet gestart');
    tournament = started.tournament;

    const view = buildDashboard(await loaded(tournament));
    expect(view.round?.matches).toHaveLength(2);
    expect(view.round?.counts).toEqual({ waiting: 1, busy: 1, done: 0 });
    expect(view.round?.matches[0]!.actionLabel).toBe('Open partij');
    expect(view.round?.matches[1]!.actionLabel).toBe('Partij starten');
    expect(view.attention.some((line) => line.includes('nog niet gestart'))).toBe(true);
  });

  it('points at a table whose game has disappeared', async () => {
    const tournament = await playRound(await createTournament());
    const started = await services.tournaments.startMatch(
      tournament.id,
      tournament.rounds[0]!.matches[0]!.id,
    );
    if (!started.ok) throw new Error('partij niet gestart');

    await services.games.remove(started.game.id);

    const view = buildDashboard(await loaded(started.tournament));
    expect(view.round?.matches[0]!.missingGame).toBe(true);
    expect(view.attention.some((line) => line.includes('niet meer te vinden'))).toBe(true);
  });
});

describe('persistence', () => {
  it('survives a reload', async () => {
    let tournament = await playRound(await createTournament());
    tournament = await finishRound(tournament, (_table, side) => (side === 0 ? 900 : 300));

    const reopened = await services.tournaments.get(tournament.id);
    expect(reopened?.rounds).toHaveLength(1);
    expect(reopened?.rounds[0]!.matches.every((match) => match.gameId)).toBe(true);

    const view = buildStandingsView(await loaded(reopened!));
    expect(view.rows.filter((row) => row.played === 1)).toHaveLength(8);
  });

  it('lists a tournament with its counts', async () => {
    const tournament = await playRound(await createTournament());
    const list = await services.tournaments.list();
    const row = list.find((entry) => entry.id === tournament.id);

    expect(row?.participantCount).toBe(8);
    expect(row?.roundCount).toBe(1);
    expect(row?.dayCount).toBe(1);
    expect(row?.status).toBe('active');
  });
});

describe('export and import', () => {
  it('carries the tournament and every game it has played', async () => {
    let tournament = await playRound(await createTournament());
    tournament = await finishRound(tournament, (_table, side) => (side === 0 ? 900 : 300));

    const exported = await services.transfer.exportTournament(tournament.id);
    if (!exported.ok) throw new Error('niet geëxporteerd');

    expect(exported.document.tournament.participants).toHaveLength(8);
    expect(exported.document.games).toHaveLength(2);
    expect(exported.fileName).toMatch(/^canasta-toernooi-/);

    const parsed = services.transfer.parseTournament(exported.json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const imported = await services.transfer.importTournament(parsed.document);
    if (!imported.ok) throw new Error('niet geïmporteerd');

    // A fresh tournament with fresh games, pointing at the new ids.
    expect(imported.tournament.id).not.toBe(tournament.id);
    expect(imported.importedGames).toBe(2);

    const view = buildStandingsView(await loaded(imported.tournament));
    expect(view.rows.filter((row) => row.played === 1)).toHaveLength(8);

    const original = await services.tournaments.get(tournament.id);
    expect(original).toBeDefined();
  });

  it('refuses a file that is not a tournament export', async () => {
    const result = services.transfer.parseTournament('{"format":"iets-anders","version":1}');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unknownFormat');
  });

  it('leaves the existing game export untouched', async () => {
    const tournament = await playRound(await createTournament());
    const started = await services.tournaments.startMatch(
      tournament.id,
      tournament.rounds[0]!.matches[0]!.id,
    );
    if (!started.ok) throw new Error('partij niet gestart');

    const exported = await services.transfer.exportGame(started.game.id);
    if (!exported.ok) throw new Error('niet geëxporteerd');
    expect(exported.document.format).toBe('canasta-game-export');

    const parsed = services.transfer.parse(exported.json);
    expect(parsed.ok).toBe(true);
  });
});

describe('a table of individuals can take one more', () => {
  it('seats five at one table when the game is played individually', async () => {
    const tournament = await createTournament(
      { ...FIXED, oddParticipantMode: 'extra-player-at-table' },
      FOUR_INDIVIDUALS,
      9,
    );

    const proposal = await services.tournaments.propose(tournament.id);
    if (!proposal.ok) throw new Error('geen indeling');

    const sizes = proposal.proposal.matches
      .filter((match) => match.kind === 'game')
      .map((match) => match.participantIds.length)
      .sort();
    expect(sizes).toEqual([4, 5]);

    const confirmed = await services.tournaments.confirmRound(
      tournament.id,
      proposal.proposal.matches,
    );
    if (!confirmed.ok) throw new Error('ronde niet bevestigd');

    // And the five-player table really becomes a five-player game.
    const bigger = confirmed.tournament.rounds[0]!.matches.find(
      (match) => match.participantIds.length === 5,
    )!;
    const started = await services.tournaments.startMatch(confirmed.tournament.id, bigger.id);
    if (!started.ok) throw new Error('partij niet gestart');

    expect(started.game.players).toHaveLength(5);
    expect(started.game.teams).toHaveLength(5);
  });

  it('gives the odd one out a bye at a table of partnerships, and says why', async () => {
    const outcome = await services.tournaments.create({
      name: 'Met teams aan tafel',
      settings: { ...FIXED, oddParticipantMode: 'extra-player-at-table' },
      gameSettings: FOUR_PLAYER_TABLE,
      participants: players(9),
    });
    if (!outcome.ok) throw new Error('kon geen toernooi maken');

    const proposal = await services.tournaments.propose(outcome.tournament.id);
    if (!proposal.ok) throw new Error('geen indeling');

    expect(proposal.proposal.matches.filter((match) => match.kind === 'bye')).toHaveLength(1);
    expect(proposal.proposal.issues.map((issue) => issue.code)).toContain(
      'pairing.extraNotPossible',
    );
  });
});

describe('a round view names what it holds', () => {
  it('describes the tables in words', async () => {
    const tournament = await playRound(await createTournament());
    const { games } = await loaded(tournament);
    const view = buildRound(tournament, tournament.rounds[0]!, games);

    expect(view.title).toBe('Ronde 1');
    expect(view.subtitle).toContain('Dag 1');
    expect(view.subtitle).toContain('2 tafels');
    expect(view.status.label).toBe('Bezig');
    expect(view.tableSummary).toContain('nog niet gestart');
    expect(view.matches[0]!.sideLines).toHaveLength(2);
  });
});
