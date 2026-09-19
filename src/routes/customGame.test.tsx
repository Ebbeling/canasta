// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { classic } from '@/rules/builtin';
import { partyOverrides } from '@/application/viewmodels/setup';
import { createTestContext, renderAt, type TestContext } from '@/test/renderRoute';

/**
 * The screens behind custom games and the rule set editor.
 *
 * These are deliberately thin: the rules of what is allowed live in the
 * application layer and are covered there. What is checked here is that the
 * interface reaches those rules — that adding a player really adds a player,
 * and that the editor writes an override rather than a second kind of storage.
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

async function makePreset(ctx: TestContext, name = 'Mijn Classic') {
  const outcome = await ctx.services.ruleSets.createPreset({
    sourceId: classic.id,
    sourceOrigin: 'builtin',
    name,
  });
  if (!outcome.ok) throw new Error('kon geen preset maken');
  return outcome.preset;
}

describe('custom game setup', () => {
  it('lets the user add players and pick a team layout', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    renderAt(ctx, '/new');

    await user.click(await screen.findByLabelText('Aangepast'));
    await user.click(await screen.findByText('Classic Canasta'));

    // Four to six players.
    const addPlayer = await screen.findByRole('button', { name: 'Eén speler meer' });
    await user.click(addPlayer);
    await user.click(addPlayer);

    expect(await screen.findByLabelText('Speler 6')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: '3 teams van 2' }));

    // Three team blocks, each with a name field.
    expect(await screen.findByLabelText('Naam van team 3')).toBeInTheDocument();
  });

  it('creates a six-player game in three teams end to end', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    renderAt(ctx, '/new');

    await user.click(await screen.findByLabelText('Aangepast'));
    await user.click(await screen.findByText('Classic Canasta'));

    const addPlayer = await screen.findByRole('button', { name: 'Eén speler meer' });
    await user.click(addPlayer);
    await user.click(addPlayer);
    await user.click(await screen.findByRole('button', { name: '3 teams van 2' }));

    await user.click(screen.getByRole('button', { name: /Verder/ }));
    await user.click(await screen.findByRole('button', { name: 'Partij starten' }));

    await waitFor(async () => expect(await ctx.services.games.list()).toHaveLength(1));

    const games = await ctx.services.games.list();
    const loaded = await ctx.services.games.load(games[0]!.id);
    expect(loaded!.game.players).toHaveLength(6);
    expect(loaded!.game.teams).toHaveLength(3);
    expect(loaded!.game.effectiveRuleSet.configuration.teams.count).toBe(3);
  });

  it('offers a prime number of players only individual play', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    renderAt(ctx, '/new');

    await user.click(await screen.findByLabelText('Aangepast'));
    await user.click(await screen.findByText('Classic Canasta'));

    await user.click(await screen.findByRole('button', { name: 'Eén speler meer' }));

    expect(await screen.findByRole('button', { name: 'Ieder voor zich' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /teams van/ })).not.toBeInTheDocument();
  });

  it('keeps the player count fixed for a standard game', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    renderAt(ctx, '/new');

    await user.click(await screen.findByText('Classic Canasta'));

    expect(await screen.findByRole('button', { name: 'Eén speler meer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Eén speler minder' })).toBeDisabled();
  });

  it('moves a player to another team by swapping', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    renderAt(ctx, '/new');

    await user.click(await screen.findByText('Classic Canasta'));
    await screen.findByLabelText('Speler 1');

    // Seat 1 starts in team 2; move it to team 1.
    await user.selectOptions(screen.getByLabelText('Team van speler 2'), '0');

    await waitFor(() => expect(screen.getByLabelText('Team van speler 2')).toHaveValue('0'));
    // Teams stay the size the rule set declares, so nothing is left invalid.
    expect(screen.getByRole('button', { name: /Verder/ })).toBeEnabled();
  });

  it('saves the configuration as a reusable rule set', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    renderAt(ctx, '/new');

    await user.click(await screen.findByLabelText('Aangepast'));
    await user.click(await screen.findByText('Classic Canasta'));

    const addPlayer = await screen.findByRole('button', { name: 'Eén speler meer' });
    await user.click(addPlayer);
    await user.click(addPlayer);
    await user.click(await screen.findByRole('button', { name: '3 teams van 2' }));
    await user.click(screen.getByRole('button', { name: /Verder/ }));

    await user.click(await screen.findByLabelText(/Bewaren als regelset/));
    await user.click(screen.getByRole('button', { name: 'Partij starten' }));

    await waitFor(async () => expect(await ctx.services.ruleSets.listPresets()).toHaveLength(1));

    const [preset] = await ctx.services.ruleSets.listPresets();
    const resolved = await ctx.services.ruleSets.resolve(preset!.id, 'custom');
    expect(resolved?.configuration.players.default).toBe(6);
  });
});

describe('rule set management', () => {
  it('lists the built-ins as built-in and refuses to edit them', async () => {
    const ctx = await newContext();
    renderAt(ctx, '/rulesets');

    expect(await screen.findByText('Classic Canasta')).toBeInTheDocument();
    expect(screen.getAllByText('Ingebouwd').length).toBeGreaterThan(0);
    // A built-in offers a copy, never an edit.
    expect(screen.queryByRole('button', { name: 'Bewerken' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Kopie maken' }).length).toBeGreaterThan(0);
  });

  it('copies a built-in into an editable rule set', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    renderAt(ctx, '/rulesets');

    const rows = await screen.findAllByRole('button', { name: 'Kopie maken' });
    await user.click(rows[0]!);

    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByLabelText('Naam');
    await user.clear(name);
    await user.type(name, 'Mijn Classic 6 spelers');
    await user.click(within(dialog).getByRole('button', { name: 'Kopie maken' }));

    await waitFor(async () => expect(await ctx.services.ruleSets.listPresets()).toHaveLength(1));
    const [preset] = await ctx.services.ruleSets.listPresets();
    expect(preset!.name).toBe('Mijn Classic 6 spelers');
    expect(preset!.origin).toBe('custom');
  });

  it('shows a custom rule set with its own actions', async () => {
    const ctx = await newContext();
    await makePreset(ctx, 'Donderdagavond');
    renderAt(ctx, '/rulesets');

    expect(await screen.findByText('Donderdagavond')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bewerken' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dupliceren' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verwijderen' })).toBeInTheDocument();
  });

  it('deletes a custom rule set after confirmation', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    await makePreset(ctx, 'Weg hiermee');
    renderAt(ctx, '/rulesets');

    await user.click(await screen.findByRole('button', { name: 'Verwijderen' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Verwijderen' }));

    await waitFor(async () => expect(await ctx.services.ruleSets.listPresets()).toHaveLength(0));
  });

  it('keeps the rule set when the delete is cancelled', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    await makePreset(ctx, 'Blijft staan');
    renderAt(ctx, '/rulesets');

    await user.click(await screen.findByRole('button', { name: 'Verwijderen' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Annuleren' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await ctx.services.ruleSets.listPresets()).toHaveLength(1);
  });
});

describe('the rule set editor', () => {
  it('renders the settings from the rule set metadata', async () => {
    const ctx = await newContext();
    const preset = await makePreset(ctx);
    renderAt(ctx, `/rulesets/${preset.id}`);

    // Generated, not hand-written: these are `SettingDefinition` labels.
    expect(await screen.findByLabelText('Doelscore')).toBeInTheDocument();
    expect(screen.getByLabelText('Aantal spelers')).toBeInTheDocument();
    expect(screen.getByLabelText('Aantal jokers')).toBeInTheDocument();
  });

  it('saves a changed setting as an override', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    const preset = await makePreset(ctx);
    renderAt(ctx, `/rulesets/${preset.id}`);

    const target = await screen.findByLabelText('Doelscore');
    await user.clear(target);
    await user.type(target, '3000');
    await user.click(screen.getByRole('button', { name: 'Opslaan' }));

    await waitFor(async () => {
      const resolved = await ctx.services.ruleSets.resolve(preset.id, 'custom');
      expect(resolved?.configuration.endGame.targetScore).toBe(3000);
    });

    // The built-in it came from is untouched.
    const builtin = await ctx.services.ruleSets.resolve(classic.id, 'builtin');
    expect(builtin?.configuration.endGame.targetScore).toBe(
      classic.configuration.endGame.targetScore,
    );
  });

  it('saves a new party shape', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    const preset = await makePreset(ctx);
    renderAt(ctx, `/rulesets/${preset.id}`);

    const addPlayer = await screen.findByRole('button', { name: 'Eén speler meer' });
    await user.click(addPlayer);
    await user.click(addPlayer);
    await user.click(await screen.findByRole('button', { name: '3 teams van 2' }));
    await user.click(screen.getByRole('button', { name: 'Opslaan' }));

    await waitFor(async () => {
      const resolved = await ctx.services.ruleSets.resolve(preset.id, 'custom');
      expect(resolved?.configuration.players.default).toBe(6);
      expect(resolved?.configuration.teams.count).toBe(3);
    });
  });

  it('renames a rule set', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    const preset = await makePreset(ctx, 'Oude naam');
    renderAt(ctx, `/rulesets/${preset.id}`);

    const name = await screen.findByLabelText('Naam');
    await user.clear(name);
    await user.type(name, 'Nieuwe naam');
    await user.click(screen.getByRole('button', { name: 'Opslaan' }));

    await waitFor(async () => {
      const [stored] = await ctx.services.ruleSets.listPresets();
      expect(stored!.name).toBe('Nieuwe naam');
    });
  });

  it('shows a not-found panel for a rule set that is gone', async () => {
    const ctx = await newContext();
    renderAt(ctx, '/rulesets/bestaat-niet');

    expect(await screen.findByText('Deze regelset bestaat niet meer.')).toBeInTheDocument();
  });
});

describe('round entry follows the game, not a fixed pair of teams', () => {
  it('shows one tab per team in a three-team game', async () => {
    const ctx = await newContext();
    const outcome = await ctx.services.games.create({
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

    renderAt(ctx, `/games/${outcome.game.id}/round`);

    const tabs = await screen.findAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      expect.stringContaining('Rood'),
      expect.stringContaining('Groen'),
      expect.stringContaining('Blauw'),
    ]);
  });

  it('shows six standings on the scoreboard of an individual game', async () => {
    const ctx = await newContext();
    const outcome = await ctx.services.games.create({
      ruleSetId: classic.id,
      ruleSetOrigin: 'builtin',
      playerNames: ['A', 'B', 'C', 'D', 'E', 'F'],
      teamNames: ['A', 'B', 'C', 'D', 'E', 'F'],
      teamSeats: [[0], [1], [2], [3], [4], [5]],
      overrides: partyOverrides({ playerCount: 6, teamCount: 6, mode: 'individual' }),
    });
    if (!outcome.ok) throw new Error('kon geen partij maken');

    renderAt(ctx, `/games/${outcome.game.id}`);

    const bars = await screen.findAllByRole('progressbar');
    expect(bars).toHaveLength(6);
  });
});
