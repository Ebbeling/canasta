// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { classic } from '@/rules/builtin';
import { partyOverrides } from '@/application/viewmodels/setup';
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
  const names = ['A', 'B', 'C', 'D', 'E', 'F'];
  const playerCount = teamCount === 2 ? 4 : 6;
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
    expect(saves[1]!.parentElement?.className).toContain('md:hidden');
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
      expect(overview.getAllByRole('heading', { name: /^Deze ronde ·/ })).toHaveLength(teamCount);

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

    await user.click(screen.getByRole('button', { name: 'Wissel naar Blauw' }));

    expect(tabs[2]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
  });
});
