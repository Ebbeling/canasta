// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { classic } from '@/rules/builtin';
import { buildFieldLayout } from '@/application/viewmodels/roundForm';
import { blankInput } from '@/application/fields/access';
import type { Services } from '@/application/services';
import type { CreateGameInput } from '@/application/services/gameService';
import { createTestContext, renderAt, type TestContext } from '@/test/renderRoute';

let context: TestContext | undefined;

afterEach(async () => {
  await context?.storage.close();
  context = undefined;
});

async function newContext(): Promise<TestContext> {
  context = await createTestContext();
  return context;
}

const setup: CreateGameInput = {
  ruleSetId: classic.id,
  ruleSetOrigin: 'builtin',
  playerNames: ['Michel', 'Paul', 'Anne', 'Karin'],
  teamNames: ['Michel / Anne', 'Paul / Karin'],
  teamSeats: [
    [0, 2],
    [1, 3],
  ],
  overrides: [],
  gameName: 'Donderdagavond',
};

async function seedPlayedGame(services: Services) {
  const created = await services.games.create(setup);
  if (!created.ok) throw new Error('kon geen spel maken');

  const fields = buildFieldLayout(classic).flatMap((group) => group.fields);
  for (const points of [400, 300]) {
    await services.rounds.saveNew({
      gameId: created.game.id,
      inputs: created.game.teams.map((team) => ({
        ...blankInput(team.id, fields),
        cardPoints: points,
        opened: true,
      })),
    });
  }

  return created.game;
}

/** Builds a `File` the way the picker would hand one over. */
function jsonFile(name: string, contents: string): File {
  return new File([contents], name, { type: 'application/json' });
}

describe('import via the settings screen', () => {
  it('shows a preview first and writes nothing until it is confirmed', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    const game = await seedPlayedGame(ctx.services);

    const exported = await ctx.services.transfer.exportGame(game.id);
    if (!exported.ok) throw new Error('export mislukte');

    renderAt(ctx, '/settings');

    const input = await screen.findByLabelText('Exportbestand (.json)');
    await user.upload(input, jsonFile(exported.fileName, exported.json));

    // The preview names what is in the file…
    expect(await screen.findByText('Donderdagavond')).toBeInTheDocument();
    expect(screen.getByText('Classic Canasta')).toBeInTheDocument();
    expect(screen.getByText(/4 spelers · 2 teams · 2 rondes/)).toBeInTheDocument();

    // …and nothing has been imported yet.
    expect(await ctx.services.games.list()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Importeren' }));

    await waitFor(async () => {
      expect(await ctx.services.games.list()).toHaveLength(2);
    });
  });

  it('refuses an invalid file in plain Dutch, without a stack trace', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    renderAt(ctx, '/settings');

    const input = await screen.findByLabelText('Exportbestand (.json)');
    await user.upload(input, jsonFile('kapot.json', 'dit is geen json'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Dit bestand kan niet worden geïmporteerd.');
    expect(alert).toHaveTextContent('Dit bestand is geen geldige JSON.');
    expect(alert.textContent).not.toMatch(/\bat\s+\S+:\d+:\d+/);

    // No import button appears for a file that was refused.
    expect(screen.queryByRole('button', { name: 'Importeren' })).not.toBeInTheDocument();
    expect(await ctx.services.games.list()).toHaveLength(0);
  });

  it('refuses a file in another format', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    renderAt(ctx, '/settings');

    const input = await screen.findByLabelText('Exportbestand (.json)');
    await user.upload(
      input,
      jsonFile('ander.json', JSON.stringify({ format: 'something-else', version: 1 })),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('geen Canasta-export');
    expect(await ctx.services.games.list()).toHaveLength(0);
  });

  it('lets the user cancel a staged import', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    const game = await seedPlayedGame(ctx.services);
    const exported = await ctx.services.transfer.exportGame(game.id);
    if (!exported.ok) throw new Error('export mislukte');

    renderAt(ctx, '/settings');
    await user.upload(
      await screen.findByLabelText('Exportbestand (.json)'),
      jsonFile(exported.fileName, exported.json),
    );

    await screen.findByRole('button', { name: 'Importeren' });
    await user.click(screen.getByRole('button', { name: 'Annuleren' }));

    expect(screen.queryByRole('button', { name: 'Importeren' })).not.toBeInTheDocument();
    expect(await ctx.services.games.list()).toHaveLength(1);
  });
});

describe('export from the scoreboard', () => {
  it('offers the game as a file without changing anything', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    const game = await seedPlayedGame(ctx.services);

    // jsdom has no download; stubbing the object URL is enough to click safely.
    const createdUrls: string[] = [];
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = () => {
      const url = `blob:test-${createdUrls.length}`;
      createdUrls.push(url);
      return url;
    };
    URL.revokeObjectURL = () => {};

    try {
      renderAt(ctx, `/games/${game.id}`);
      // Exporting lives under the scoreboard's overflow menu.
      await user.click(await screen.findByRole('button', { name: 'Meer acties' }));
      await user.click(await screen.findByRole('button', { name: 'Exporteren' }));

      await waitFor(() => expect(createdUrls).toHaveLength(1));
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }

    // Exporting is a read: the game and its rounds are untouched.
    const loaded = await ctx.services.games.load(game.id);
    expect(loaded?.rounds).toHaveLength(2);
    expect(await ctx.services.games.list()).toHaveLength(1);
  });
});
