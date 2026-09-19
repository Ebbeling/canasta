// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { classic } from '@/rules/builtin';
import { partyOverrides } from '@/application/viewmodels/setup';
import { buildFieldLayout } from '@/application/viewmodels/roundForm';
import { blankInput } from '@/application/fields/access';
import type { Services } from '@/application/services';
import { createTestContext, renderAt, type TestContext } from '@/test/renderRoute';

/**
 * The desktop shell during an actual game.
 *
 * jsdom loads no stylesheet, so a media query cannot be evaluated here and both
 * halves of a responsive pair are in the tree at once. What these tests hold on
 * to is therefore the contract rather than the pixels: which element carries
 * which breakpoint class, and what the document is made of. The pixels are
 * checked in a browser.
 */

let context: TestContext | undefined;

afterEach(async () => {
  await context?.storage.close();
  context = undefined;
});

async function newContext(): Promise<TestContext> {
  context = await createTestContext();
  return context;
}

async function seedGame(services: Services, teamCount = 2) {
  const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const playerCount = teamCount === 2 ? 4 : teamCount === 4 ? 8 : 6;
  const seats = Array.from({ length: teamCount }, (_, team) =>
    Array.from({ length: playerCount / teamCount }, (_, slot) => team + slot * teamCount),
  );

  const outcome = await services.games.create({
    ruleSetId: classic.id,
    ruleSetOrigin: 'builtin',
    playerNames: names.slice(0, playerCount),
    teamNames: ['Rood', 'Groen', 'Blauw', 'Geel', 'Paars', 'Grijs'].slice(0, teamCount),
    teamSeats: seats,
    overrides:
      teamCount === 2
        ? []
        : partyOverrides({ playerCount, teamCount, mode: teamCount === 6 ? 'individual' : 'partnership' }),
  });
  if (!outcome.ok) throw new Error('kon geen partij maken');
  return outcome.game;
}

async function seedRound(
  services: Services,
  gameId: string,
  teams: { id: string }[],
  pointsPerTeam: number[],
) {
  const fields = buildFieldLayout(classic).flatMap((group) => group.fields);
  await services.rounds.saveNew({
    gameId,
    inputs: teams.map((team, index) => ({
      ...blankInput(team.id, fields),
      cardPoints: pointsPerTeam[index] ?? 0,
      opened: true,
    })),
  });
}

const IN_GAME = [
  { label: 'scorebord', path: (id: string) => `/games/${id}` },
  { label: 'ronde invoeren', path: (id: string) => `/games/${id}/round` },
  { label: 'geschiedenis', path: (id: string) => `/games/${id}/history` },
  { label: 'spelregels', path: (id: string) => `/games/${id}/rules` },
];

describe('the desktop shell is the same one all through a game', () => {
  for (const screenUnderTest of IN_GAME) {
    it(`renders the rail with this game's context on ${screenUnderTest.label}`, async () => {
      const ctx = await newContext();
      const game = await seedGame(ctx.services);
      renderAt(ctx, screenUnderTest.path(game.id));

      const rail = within(await screen.findByRole('complementary', { name: 'Canasta' }));
      expect(await rail.findByText('Deze partij')).toBeInTheDocument();
      expect(rail.getByRole('link', { name: 'Scorebord' })).toBeInTheDocument();
      expect(rail.getByRole('link', { name: 'Geschiedenis' })).toBeInTheDocument();
      expect(rail.getByRole('link', { name: 'Spelregels' })).toBeInTheDocument();
    });
  }
});

describe('the phone header is phone chrome', () => {
  it('hides the back chevron and the title bar from `md` up', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}/history`);

    const back = await screen.findByRole('button', { name: 'Terug' });
    expect(back.parentElement?.className).toContain('md:hidden');

    // The heading itself survives: nothing on the desktop screen replaces it,
    // and a page without one announces nothing.
    const heading = screen.getByRole('heading', { name: 'Geschiedenis', level: 1 });
    expect(heading.parentElement?.className).toContain('md:sr-only');
  });

  it('keeps the bottom bar on the phone and hides it from `md` up', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}`);

    // The rail carries the same three destinations under the same name, so
    // ask the page itself rather than the document.
    const main = within(await screen.findByRole('main'));
    const nav = await main.findByRole('navigation', { name: 'In deze partij' });
    expect(nav.className).toContain('md:hidden');
  });
});

describe('ronde invoeren — desktop layout', () => {
  it('puts the fields and the overview in one two-column wrapper', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}/round`);

    const overview = await screen.findByRole('complementary', {
      name: 'Overzicht van deze ronde',
    });
    const form = screen.getByRole('main').querySelector('form');
    expect(form).not.toBeNull();

    // Same parent, so the overview sits beside the fields rather than under
    // the whole list of them.
    expect(form!.parentElement).toBe(overview.parentElement);
    expect(form!.parentElement?.className).toContain('lg:grid');
  });

  it('lays the field groups out by the room they have, not one per row', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}/round`);

    await screen.findByRole('tablist', { name: 'Team kiezen' });
    const form = screen.getByRole('main').querySelector('form')!;

    expect(form.className).toContain('grid');
    expect(form.className).toContain('auto-fit');
    // Every group is a child of that one grid; nothing is stacked outside it.
    expect(form.children.length).toBeGreaterThan(1);
  });

  it('carries the actions in the top bar as well as under the thumb', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}/round`);

    const saves = await screen.findAllByRole('button', { name: 'Ronde opslaan' });
    expect(saves).toHaveLength(2);

    const tablist = screen.getByRole('tablist', { name: 'Team kiezen' });
    const topBar = tablist.parentElement!;
    // One of the two lives in the same bar as the team switcher, as the design
    // has it; the other in the sticky bar, which is hidden from `md`.
    expect(topBar.contains(saves[0]!)).toBe(true);
    expect(topBar.contains(saves[1]!)).toBe(false);
    expect(saves[1]!.closest('.sticky')?.className).toContain('md:hidden');
  });
});

describe('ronde invoeren — every team, whatever the number of them', () => {
  for (const teamCount of [2, 3, 6]) {
    it(`gives each of ${teamCount} teams a card in the overview`, async () => {
      const ctx = await newContext();
      const game = await seedGame(ctx.services, teamCount);
      renderAt(ctx, `/games/${game.id}/round`);

      const overview = within(
        await screen.findByRole('complementary', { name: 'Overzicht van deze ronde' }),
      );
      // Every team gets its own line in the one overview card, and each line
      // is the way back into that team.
      const names = ['Rood', 'Groen', 'Blauw', 'Geel', 'Paars', 'Grijs'].slice(0, teamCount);
      for (const name of names) {
        expect(overview.getByRole('button', { name: new RegExp(name) })).toBeInTheDocument();
      }
      expect(overview.getAllByRole('button')).toHaveLength(teamCount);

      // And one tab per team, so every one of them can be reached.
      const tabs = within(screen.getByRole('tablist', { name: 'Team kiezen' })).getAllByRole('tab');
      expect(tabs).toHaveLength(teamCount);
    });
  }

  it('switches to a team from its card in the overview', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    const game = await seedGame(ctx.services, 3);
    renderAt(ctx, `/games/${game.id}/round`);

    const tabs = within(
      await screen.findByRole('tablist', { name: 'Team kiezen' }),
    ).getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');

    const overview = within(
      screen.getByRole('complementary', { name: 'Overzicht van deze ronde' }),
    );
    await user.click(overview.getByRole('button', { name: /Blauw/ }));

    expect(tabs[2]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
  });
});

describe('the shell leaves the width to the screen', () => {
  it('gives `main` no width of its own, so a bar can span it', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}/round`);

    // Wait for the round to be on screen: closing the database under a live
    // query that is still in flight is what makes a test flap.
    await screen.findByRole('tablist', { name: 'Team kiezen' });

    const main = screen.getByRole('main');
    expect(main.className).not.toMatch(/max-w-/);
    expect(main.className).not.toContain('mx-auto');
  });

  it('puts the bar over a round outside the reading column', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}/round`);

    const tablist = await screen.findByRole('tablist', { name: 'Team kiezen' });
    const bar = tablist.closest('.sticky')!;
    const form = screen.getByRole('main').querySelector('form')!;

    // The bar spans the whole width beside the rail; only what it holds is
    // centred on the same column as the fields underneath.
    expect(bar.className).not.toMatch(/max-w-/);
    expect(bar.contains(form)).toBe(false);
    expect(bar.firstElementChild?.className).toContain('max-w-wide');
  });

  it('gives the scoreboard the reading column', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}`);

    await screen.findByRole('heading', { level: 1 });
    const column = screen.getByRole('main').querySelector('[class*="max-w-"]')!;
    expect(column.className).toContain('max-w-column');
  });

  it('gives the history table the working column', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}/history`);

    await screen.findByRole('heading', { level: 1 });
    const column = screen.getByRole('main').querySelector('[class*="max-w-"]')!;
    expect(column.className).toContain('max-w-wide');
  });
});

describe('the scoreboard follows the number of teams', () => {
  it('sets two teams against each other, with no ranking', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services, 2);
    renderAt(ctx, `/games/${game.id}`);

    const main = within(await screen.findByRole('main'));
    expect(await main.findByText('Rood')).toBeInTheDocument();
    expect(main.queryByText('Voor · +0')).not.toBeInTheDocument();
  });

  it('becomes a standings table from three, leader first', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services, 3);
    await seedRound(ctx.services, game.id, game.teams, [100, 400, 250]);
    renderAt(ctx, `/games/${game.id}`);

    const main = within(await screen.findByRole('main'));
    await main.findByText('Groen');

    // Sorted by position: Groen leads on 400, Blauw second, Rood last.
    const names = main
      .getAllByText(/^(Rood|Groen|Blauw)$/)
      .map((node) => node.textContent);
    expect(names.slice(0, 3)).toEqual(['Groen', 'Blauw', 'Rood']);

    // And every team below the leader carries its gap to the leader.
    expect(main.getByText('−150')).toBeInTheDocument();
    expect(main.getByText('−300')).toBeInTheDocument();
  });
});

describe('geschiedenis shows the standings beside the rounds', () => {
  it('ranks every team next to the table', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services, 3);
    await seedRound(ctx.services, game.id, game.teams, [100, 400, 250]);
    renderAt(ctx, `/games/${game.id}/history`);

    const main = within(await screen.findByRole('main'));
    expect(await main.findByRole('heading', { name: 'Stand na ronde 1' })).toBeInTheDocument();
    expect(main.getByRole('heading', { name: 'Alle rondes · 1' })).toBeInTheDocument();

    // One rank per team, 1..3.
    for (const rank of ['1', '2', '3']) {
      expect(main.getAllByText(rank).length).toBeGreaterThan(0);
    }
  });
});

/** Enough rounds to carry a team past the 5.000 the built-in aims at. */
async function playUntilWon(services: Services, game: { id: string; teams: { id: string }[] }) {
  for (let round = 0; round < 6; round += 1) {
    await seedRound(
      services,
      game.id,
      game.teams,
      game.teams.map((_team, index) => (index === 1 ? 900 : 300)),
    );
  }
}

describe('een afgeronde partij', () => {
  for (const teamCount of [2, 3, 6]) {
    it(`names the winner and ranks all ${teamCount} of them`, async () => {
      const ctx = await newContext();
      const game = await seedGame(ctx.services, teamCount);
      await playUntilWon(ctx.services, game);
      renderAt(ctx, `/games/${game.id}`);

      const main = within(await screen.findByRole('main'));
      expect(await main.findByRole('heading', { name: 'Uitslag' })).toBeInTheDocument();
      expect(main.getByText(/^Gewonnen: /)).toHaveTextContent('Groen');

      // Every team is in the closing table, and the winner is named in words.
      const names = ['Rood', 'Groen', 'Blauw', 'Geel', 'Paars', 'Grijs'].slice(0, teamCount);
      for (const name of names) expect(main.getAllByText(name).length).toBeGreaterThan(0);
      expect(main.getAllByText('Gewonnen')).toHaveLength(1);

      // And the board offers the two ways on that the design draws.
      expect(main.getByRole('link', { name: 'Naar de geschiedenis' })).toBeInTheDocument();
      expect(main.getByRole('link', { name: 'Nieuwe partij' })).toBeInTheDocument();
      expect(main.queryByRole('link', { name: /Ronde \d+ invoeren/ })).not.toBeInTheDocument();
    });
  }

  it('puts the winner first, whatever order the teams were dealt in', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services, 3);
    await playUntilWon(ctx.services, game);
    renderAt(ctx, `/games/${game.id}`);

    const main = within(await screen.findByRole('main'));
    await main.findByRole('heading', { name: 'Uitslag' });

    const order = main.getAllByText(/^(Rood|Groen|Blauw)$/).map((node) => node.textContent);
    expect(order[0]).toBe('Groen');
  });
});

describe('de wizard toont zijn stappen in de rail', () => {
  it('marks the first step as the one being answered', async () => {
    const ctx = await newContext();
    renderAt(ctx, '/new');

    const steps = within(await screen.findByRole('list', { name: 'Stappen' }));
    const items = steps.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveAttribute('aria-current', 'step');
    expect(items[1]).not.toHaveAttribute('aria-current');
    // The numbering is decoration; what matters is the three step names.
    expect(items[0]).toHaveTextContent('Variant');
    expect(items[1]).toHaveTextContent('Wie zit waar?');
    expect(items[2]).toHaveTextContent('Huisregels');
  });

  it('spells out the choice once it is made and moves on', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    renderAt(ctx, '/new');

    // Two-Handed describes itself as "Classic Canasta voor twee spelers", so
    // take the card whose own name it is: the first one.
    const main = within(await screen.findByRole('main'));
    const cards = await main.findAllByRole('button', { name: /Classic Canasta/ });
    await user.click(cards[0]!);

    const steps = within(await screen.findByRole('list', { name: 'Stappen' }));
    const items = steps.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Variant · Classic Canasta');
    expect(items[0]).not.toHaveAttribute('aria-current');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
  });

  it('leaves the rail alone outside the wizard', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}`);

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('list', { name: 'Stappen' })).not.toBeInTheDocument();
  });
});

describe('de teamschakelaar volgt het aantal deelnemers', () => {
  for (const [teamCount, placement] of [
    [3, 'inline'],
    [4, 'inline'],
    [6, 'own row'],
  ] as const) {
    it(`keeps ${teamCount} chips ${placement}`, async () => {
      const ctx = await newContext();
      const game = await seedGame(ctx.services, teamCount);
      renderAt(ctx, `/games/${game.id}/round`);

      const tablist = await screen.findByRole('tablist', { name: 'Team kiezen' });
      expect(within(tablist).getAllByRole('tab')).toHaveLength(teamCount);

      if (placement === 'inline') {
        expect(tablist.className).toContain('md:order-2');
      } else {
        expect(tablist.className).toContain('md:order-4');
        expect(tablist.className).toContain('auto-fit');
      }
    });
  }
});
