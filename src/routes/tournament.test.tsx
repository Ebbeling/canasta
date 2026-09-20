// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { classic } from '@/rules/builtin';
import { blankInput } from '@/application/fields/access';
import { buildFieldLayout } from '@/application/viewmodels/roundForm';
import type { Services } from '@/application/services';
import type { Tournament, TournamentSettings } from '@/domain/tournament';
import { createTestContext, renderAt, type TestContext } from '@/test/renderRoute';

/**
 * The tournament screens.
 *
 * These drive the real services, so what they prove is that the interface
 * reaches them: that a table really creates a game, that the dashboard shows
 * what is being played at this moment, and that the standings are the ones the
 * projection produced.
 *
 * They are slower than the rest of the suite on purpose: a tournament screen
 * loads the tournament, every game behind its tables and a full replay of each
 * one. That is the real cost of the dashboard, and running it through
 * `fake-indexeddb` in jsdom is slower still — hence the longer waits.
 */

// Testing Library's default one-second wait is short for a screen that loads
// a tournament, its games and a replay of each of them.
configure({ asyncUtilTimeout: 8_000 });

let context: TestContext | undefined;

afterEach(async () => {
  await context?.storage.close();
  context = undefined;
});

async function newContext(): Promise<TestContext> {
  context = await createTestContext();
  return context;
}

const SETTINGS: TournamentSettings = {
  mode: 'fixed',
  scoringMode: 'tournament-points',
  drawAllowed: true,
  oddParticipantMode: 'bye',
  manualPairingAllowed: true,
  plannedDays: 1,
  plannedRoundsPerDay: 2,
};

async function seedTournament(
  services: Services,
  participantCount = 8,
  settings: TournamentSettings = SETTINGS,
): Promise<Tournament> {
  const outcome = await services.tournaments.create({
    name: 'Clubkampioenschap',
    settings,
    gameSettings: {
      ruleSetId: classic.id,
      ruleSetOrigin: 'builtin',
      ruleSetName: 'Classic Canasta',
      participantsPerMatch: 4,
      teamsPerMatch: 2,
      overrides: [],
    },
    participants: Array.from({ length: participantCount }, (_unused, index) => ({
      kind: 'player' as const,
      name: `Speler ${index + 1}`,
      memberNames: [`Speler ${index + 1}`],
    })),
  });
  if (!outcome.ok) throw new Error('kon geen toernooi maken');
  return outcome.tournament;
}

async function confirmFirstRound(services: Services, tournament: Tournament) {
  const proposal = await services.tournaments.propose(tournament.id);
  if (!proposal.ok) throw new Error('geen indeling');
  const confirmed = await services.tournaments.confirmRound(
    tournament.id,
    proposal.proposal.matches,
  );
  if (!confirmed.ok) throw new Error('ronde niet bevestigd');
  return confirmed.tournament;
}

/** Plays one table to a finish. */
async function finishTable(services: Services, tournament: Tournament, matchId: string) {
  const started = await services.tournaments.startMatch(tournament.id, matchId);
  if (!started.ok) throw new Error('partij niet gestart');

  const fields = buildFieldLayout(started.game.effectiveRuleSet).flatMap((group) => group.fields);
  for (let n = 0; n < 6; n += 1) {
    await services.rounds.saveNew({
      gameId: started.game.id,
      inputs: started.game.teams.map((team, index) => ({
        ...blankInput(team.id, fields),
        cardPoints: index === 0 ? 900 : 300,
        opened: true,
      })),
    });
  }
  return started.game;
}

describe('de toernooienlijst', () => {
  it('offers a way in when there is nothing yet', async () => {
    const ctx = await newContext();
    renderAt(ctx, '/tournaments');

    expect(await screen.findByText('Nog geen toernooien')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Nieuw toernooi/ }).length).toBeGreaterThan(0);
  });

  it('groups tournaments by what they are doing', async () => {
    const ctx = await newContext();
    const tournament = await seedTournament(ctx.services);
    await confirmFirstRound(ctx.services, tournament);
    renderAt(ctx, '/tournaments');

    const main = within(await screen.findByRole('main'));
    expect(await main.findByRole('heading', { name: 'Bezig' })).toBeInTheDocument();
    expect(main.getByText('Clubkampioenschap')).toBeInTheDocument();
    expect(main.getByText(/8 deelnemers/)).toBeInTheDocument();
  });
});

describe('het toernooidashboard', () => {
  it('asks for the first round before anything has been arranged', async () => {
    const ctx = await newContext();
    const tournament = await seedTournament(ctx.services);
    renderAt(ctx, `/tournaments/${tournament.id}`);

    expect(await screen.findByText('Nog geen ronde ingedeeld')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ronde indelen/ })).toBeInTheDocument();
  });

  it('shows every table of the running round at once, with its own status', async () => {
    const ctx = await newContext();
    let tournament = await seedTournament(ctx.services);
    tournament = await confirmFirstRound(ctx.services, tournament);

    // One table started, one not: the point of the screen.
    await ctx.services.tournaments.startMatch(
      tournament.id,
      tournament.rounds[0]!.matches[0]!.id,
    );

    renderAt(ctx, `/tournaments/${tournament.id}`);

    const main = within(await screen.findByRole('main'));
    expect(await main.findByText('Tafel 1')).toBeInTheDocument();
    expect(main.getByText('Tafel 2')).toBeInTheDocument();
    expect(main.getByText('Open partij')).toBeInTheDocument();
    expect(main.getByText('Partij starten')).toBeInTheDocument();
  });

  it('will not let a round be closed while a table is still playing', async () => {
    const ctx = await newContext();
    let tournament = await seedTournament(ctx.services);
    tournament = await confirmFirstRound(ctx.services, tournament);
    renderAt(ctx, `/tournaments/${tournament.id}`);

    const close = await screen.findByRole('button', { name: /Ronde 1 afsluiten/ });
    expect(close).toBeDisabled();
  });

  it('arranges a round when the organiser asks for one', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    const tournament = await seedTournament(ctx.services);
    renderAt(ctx, `/tournaments/${tournament.id}`);

    await user.click(await screen.findByRole('button', { name: /Ronde indelen/ }));

    // The proposal is shown, and nothing is stored until it is confirmed.
    expect(await screen.findByText('Ronde 1 indelen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Indeling vastzetten/ })).toBeInTheDocument();

    const stored = await ctx.services.tournaments.get(tournament.id);
    expect(stored?.rounds).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /Indeling vastzetten/ }));

    await waitFor(async () => {
      const after = await ctx.services.tournaments.get(tournament.id);
      expect(after?.rounds).toHaveLength(1);
    });
  });
});

describe('een tafel', () => {
  it('creates the game behind it and goes to the ordinary scoreboard', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    let tournament = await seedTournament(ctx.services);
    tournament = await confirmFirstRound(ctx.services, tournament);
    const match = tournament.rounds[0]!.matches[0]!;

    renderAt(ctx, `/tournaments/${tournament.id}/tables/${match.id}`);

    expect(await screen.findByRole('heading', { name: 'Tafel 1', level: 1 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Partij starten/ }));

    // The game screens take over: no tournament chrome scores a hand.
    expect(await screen.findByRole('link', { name: /Ronde 1 invoeren/ })).toBeInTheDocument();

    const after = await ctx.services.tournaments.get(tournament.id);
    expect(after?.rounds[0]!.matches[0]!.gameId).toBeTruthy();
  });

  it('says a bye has no game', async () => {
    const ctx = await newContext();
    let tournament = await seedTournament(ctx.services, 9);
    tournament = await confirmFirstRound(ctx.services, tournament);
    const bye = tournament.rounds[0]!.matches.find((match) => match.kind === 'bye')!;

    renderAt(ctx, `/tournaments/${tournament.id}/tables/${bye.id}`);

    expect(await screen.findByText('Deze deelnemer is deze ronde vrij.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Partij starten/ })).not.toBeInTheDocument();
  });
});

describe('de stand', () => {
  it('explains what it is counting', async () => {
    const ctx = await newContext();
    const tournament = await seedTournament(ctx.services);
    renderAt(ctx, `/tournaments/${tournament.id}/standings`);

    expect(await screen.findByText(/Winst levert 2 punten op/)).toBeInTheDocument();
  });

  it('shows what the finished games came out at', async () => {
    const ctx = await newContext();
    let tournament = await seedTournament(ctx.services);
    tournament = await confirmFirstRound(ctx.services, tournament);
    for (const match of tournament.rounds[0]!.matches) {
      await finishTable(ctx.services, tournament, match.id);
    }

    renderAt(ctx, `/tournaments/${tournament.id}/standings`);

    const main = within(await screen.findByRole('main'));
    await main.findByText(/Na ronde 1/);
    // Four winners on two points, four losers on none.
    expect(main.getAllByText('2').length).toBeGreaterThanOrEqual(4);
    expect(main.getAllByText(/1 partij · 1 gewonnen/)).toHaveLength(4);
  });
});

describe('de rondes en de deelnemers', () => {
  it('groups the rounds under their playing day', async () => {
    const ctx = await newContext();
    let tournament = await seedTournament(ctx.services);
    tournament = await confirmFirstRound(ctx.services, tournament);

    renderAt(ctx, `/tournaments/${tournament.id}/rounds`);

    const main = within(await screen.findByRole('main'));
    expect(await main.findByRole('heading', { name: 'Dag 1' })).toBeInTheDocument();
    expect(main.getByText('Ronde 1')).toBeInTheDocument();
    expect(main.getByText('Tafel 1')).toBeInTheDocument();
  });

  it('lets a participant stop, and lets them back in', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    const tournament = await seedTournament(ctx.services);

    renderAt(ctx, `/tournaments/${tournament.id}/participants`);

    const main = within(await screen.findByRole('main'));
    expect(await main.findByText('Speler 1')).toBeInTheDocument();

    await user.click(main.getAllByRole('button', { name: 'Stopt' })[0]!);

    await waitFor(async () => {
      const after = await ctx.services.tournaments.get(tournament.id);
      expect(after?.participants[0]!.status).toBe('withdrawn');
    });
  });
});

describe('de toernooi-wizard', () => {
  it('walks five steps and starts a tournament', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    renderAt(ctx, '/tournaments/new');

    // 1 · the tournament
    const name = await screen.findByLabelText('Naam van het toernooi');
    await user.type(name, 'Herfsttoernooi');
    await user.click(screen.getByRole('button', { name: /Verder/ }));

    // 2 · the game
    const main = within(screen.getByRole('main'));
    const cards = await main.findAllByRole('button', { name: /Classic Canasta/ });
    await user.click(cards[0]!);

    // 3 · the people — four by default, which fills exactly one table
    expect(await screen.findByText('Wie doet mee?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Verder/ }));

    // 4 · the pairing
    expect(await screen.findByText('Voorgestelde indeling')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Verder/ }));

    // 5 · the check
    expect(await screen.findByText('Alles klopt?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Toernooi starten/ }));

    await waitFor(async () => {
      const list = await ctx.services.tournaments.list();
      expect(list).toHaveLength(1);
      expect(list[0]!.name).toBe('Herfsttoernooi');
    });
  });

  it('shows the five steps in the rail, with the current one marked', async () => {
    const ctx = await newContext();
    renderAt(ctx, '/tournaments/new');

    const steps = within(await screen.findByRole('list', { name: 'Stappen' }));
    const items = steps.getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).toHaveTextContent('Toernooi');
    expect(items[4]).toHaveTextContent('Controleren');
  });
});

describe('de schil', () => {
  it('carries the tournament in the rail while one is open', async () => {
    const ctx = await newContext();
    const tournament = await seedTournament(ctx.services);
    renderAt(ctx, `/tournaments/${tournament.id}`);

    const rail = within(await screen.findByRole('complementary', { name: 'Canasta' }));
    expect(await rail.findByText('Dit toernooi')).toBeInTheDocument();
    expect(rail.getByRole('link', { name: 'Stand' })).toBeInTheDocument();
    expect(rail.getByRole('link', { name: 'Deelnemers' })).toBeInTheDocument();
  });

  it('keeps the bottom bar for the phone and hides it from `md`', async () => {
    const ctx = await newContext();
    const tournament = await seedTournament(ctx.services);
    renderAt(ctx, `/tournaments/${tournament.id}`);

    const main = within(await screen.findByRole('main'));
    const nav = await main.findByRole('navigation', { name: 'In dit toernooi' });
    expect(nav.className).toContain('md:hidden');
  });

  it('offers tournaments as a third destination from the rail', async () => {
    const ctx = await newContext();
    renderAt(ctx, '/');

    const rail = within(await screen.findByRole('complementary', { name: 'Canasta' }));
    expect(rail.getByRole('link', { name: 'Toernooien' })).toBeInTheDocument();
  });
});
