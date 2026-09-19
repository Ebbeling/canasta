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
 * The secondary screens, in the shape the desktop design gives them.
 *
 * jsdom loads no stylesheet, so nothing here asserts a pixel. What it does
 * assert is the structure those layouts are built on: a table of contents whose
 * entries really point at sections, sections that all stay in the document at
 * once, a history table with a column per team however many there are, and a
 * recent-games row that keeps its title and its meta line apart.
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

/** A plain four-player, two-team Classic game. */
async function seedGame(services: Services) {
  const outcome = await services.games.create({
    ruleSetId: classic.id,
    ruleSetOrigin: 'builtin',
    playerNames: ['Michel', 'Paul', 'Anne', 'Karin'],
    teamNames: ['Michel / Anne', 'Paul / Karin'],
    teamSeats: [
      [0, 2],
      [1, 3],
    ],
    overrides: [],
  });
  if (!outcome.ok) throw new Error('kon geen partij maken');
  return outcome.game;
}

/** Six players in three teams — the case a two-column table cannot hold. */
async function seedThreeTeamGame(services: Services) {
  const outcome = await services.games.create({
    ruleSetId: classic.id,
    ruleSetOrigin: 'builtin',
    playerNames: ['A', 'B', 'C', 'D', 'E', 'F'],
    teamNames: ['Rood', 'Groen', 'Blauw'],
    teamSeats: [
      [0, 3],
      [1, 4],
      [2, 5],
    ],
    overrides: partyOverrides({ playerCount: 6, teamCount: 3, mode: 'partnership' }),
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

describe('rulebook', () => {
  it('has a table of contents whose every entry points at a section that exists', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}/rules`);

    const contents = await screen.findByRole('navigation', { name: 'Inhoud' });
    const entries = within(contents).getAllByRole('link');
    expect(entries.length).toBeGreaterThan(3);

    for (const entry of entries) {
      const href = entry.getAttribute('href') ?? '';
      expect(href.startsWith('#')).toBe(true);
      expect(document.getElementById(href.slice(1))).not.toBeNull();
    }
  });

  it('offers the same destinations as a jump bar for narrow widths', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}/rules`);

    const contents = await screen.findByRole('navigation', { name: 'Inhoud' });
    const bar = screen.getByRole('group', { name: 'Ga naar onderdeel' });

    const titles = (node: HTMLElement) =>
      within(node)
        .getAllByRole('link')
        .map((link) => link.textContent);

    expect(titles(bar)).toEqual(titles(contents));
  });

  it('keeps every section in the document at once, so no rule is hidden behind a filter', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}/rules`);

    const contents = await screen.findByRole('navigation', { name: 'Inhoud' });
    const titles = within(contents)
      .getAllByRole('link')
      .map((link) => link.textContent ?? '');

    for (const title of titles) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    }
  });

  it('collapses a section without taking it out of the document', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}/rules`);

    const contents = await screen.findByRole('navigation', { name: 'Inhoud' });
    const first = within(contents).getAllByRole('link')[0]!;
    const anchor = (first.getAttribute('href') ?? '').slice(1);

    const toggle = within(screen.getByRole('main')).getAllByRole('button', {
      name: first.textContent ?? '',
    })[0]!;
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(anchor)).not.toBeNull();
  });
});

describe('history', () => {
  it('gives every team its own column, whatever the number of teams', async () => {
    const ctx = await newContext();
    const game = await seedThreeTeamGame(ctx.services);
    await seedRound(ctx.services, game.id, game.teams, [200, 150, 100]);
    await seedRound(ctx.services, game.id, game.teams, [300, 250, 50]);

    renderAt(ctx, `/games/${game.id}/history`);

    // One correction link per round, and no more.
    expect(await screen.findAllByRole('link', { name: /Ronde \d+ bewerken/ })).toHaveLength(2);

    const main = within(screen.getByRole('main'));
    for (const name of ['Rood', 'Groen', 'Blauw']) {
      expect(main.getAllByText(new RegExp(name)).length).toBeGreaterThan(0);
    }
  });

  it('shows the standing the rounds add up to', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    await seedRound(ctx.services, game.id, game.teams, [200, 100]);
    await seedRound(ctx.services, game.id, game.teams, [300, 100]);

    renderAt(ctx, `/games/${game.id}/history`);

    const main = within(await screen.findByRole('main'));
    expect((await main.findAllByText('500')).length).toBeGreaterThan(0);
    expect(main.getAllByText('200').length).toBeGreaterThan(0);
  });
});

describe('settings and rule set management', () => {
  it('leads from settings to rule set management', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    renderAt(ctx, '/settings');

    await user.click(await screen.findByRole('link', { name: 'Beheren' }));

    expect(await screen.findByRole('heading', { name: 'Regelsets' })).toBeInTheDocument();
    expect(screen.getAllByText('Ingebouwd').length).toBeGreaterThan(0);
  });

  it('keeps every settings group reachable', async () => {
    const ctx = await newContext();
    renderAt(ctx, '/settings');

    for (const title of ['Weergave', 'Spel', 'Opslag', 'App', 'Bronnen']) {
      expect(await screen.findByText(title)).toBeInTheDocument();
    }
  });
});

describe('home — recent games', () => {
  it('keeps a long title and its rule set line as two separate lines', async () => {
    const ctx = await newContext();
    const outcome = await ctx.services.games.create({
      ruleSetId: classic.id,
      ruleSetOrigin: 'builtin',
      playerNames: ['Michel', 'Paul', 'Anne-Katrien', 'Karin'],
      teamNames: ['Michel en Anne-Katrien', 'Paul en Karin samen'],
      teamSeats: [
        [0, 2],
        [1, 3],
      ],
      overrides: [],
    });
    if (!outcome.ok) throw new Error('kon geen partij maken');

    renderAt(ctx, '/');

    const title = await screen.findByText('Michel en Anne-Katrien tegen Paul en Karin samen');
    expect(title).toBeInTheDocument();
    expect(screen.getAllByText(/Classic Canasta ·/).length).toBeGreaterThan(0);
  });
});
