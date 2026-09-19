// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { classic, modernAmerican, twoHanded } from '@/rules/builtin';
import { cloneRuleSet } from '@/rules/resolve/resolveRuleSet';
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

/** A fresh database plus services. Seed through it, then render. */
async function newContext(): Promise<TestContext> {
  context = await createTestContext();
  return context;
}

function setupFor(ruleSetId: string): CreateGameInput {
  const twoPlayer = ruleSetId === twoHanded.id;
  return {
    ruleSetId,
    ruleSetOrigin: 'builtin',
    playerNames: twoPlayer ? ['Michel', 'Paul'] : ['Michel', 'Paul', 'Anne', 'Karin'],
    teamNames: twoPlayer ? ['Michel', 'Paul'] : ['Michel / Anne', 'Paul / Karin'],
    teamSeats: twoPlayer
      ? [[0], [1]]
      : [
          [0, 2],
          [1, 3],
        ],
    overrides: [],
  };
}

async function seedGame(services: Services, ruleSetId = classic.id) {
  const outcome = await services.games.create(setupFor(ruleSetId));
  if (!outcome.ok) throw new Error('kon geen testspel aanmaken');
  return outcome.game;
}

/** Saves a round straight through the service, bypassing the form. */
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

describe('routing', () => {
  it('shows the home screen', async () => {
    renderAt(await newContext(), '/');
    expect(await screen.findByRole('heading', { name: 'Canasta' })).toBeInTheDocument();
  });

  it('shows the new-game screen with the three built-in rule sets', async () => {
    renderAt(await newContext(), '/new');

    expect(await screen.findByRole('heading', { name: 'Nieuwe partij' })).toBeInTheDocument();
    expect(await screen.findByText('Classic Canasta')).toBeInTheDocument();
    expect(screen.getByText('Modern American Canasta')).toBeInTheDocument();
    expect(screen.getByText('Two-Handed Canasta')).toBeInTheDocument();
  });

  it('shows a not-found panel for an unknown game', async () => {
    renderAt(await newContext(), '/games/bestaat-niet');
    expect(await screen.findByText('Deze partij bestaat niet meer.')).toBeInTheDocument();
  });

  it('shows the 404 page for an unknown route', async () => {
    renderAt(await newContext(), '/iets-anders');
    expect(
      await screen.findByRole('heading', { name: 'Pagina niet gevonden' }),
    ).toBeInTheDocument();
  });

  it('shows an empty state when there are no games', async () => {
    renderAt(await newContext(), '/games');
    expect(await screen.findByText('Nog geen partijen')).toBeInTheDocument();
  });
});

describe('new game', () => {
  it('calls Two-Handed players "spelers" rather than teams', async () => {
    const user = userEvent.setup();
    renderAt(await newContext(), '/new');

    await user.click(await screen.findByText('Two-Handed Canasta'));

    // Two name fields and no team section — both come from `teams.mode`, not
    // from a check on which variant this is.
    expect(await screen.findByLabelText('Speler 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Speler 2')).toBeInTheDocument();
    expect(screen.queryByLabelText('Speler 3')).not.toBeInTheDocument();
    expect(await screen.findByText(/zonder/)).toBeInTheDocument();
  });

  it('asks for four players and two team names under Classic', async () => {
    const user = userEvent.setup();
    renderAt(await newContext(), '/new');

    await user.click(await screen.findByText('Classic Canasta'));

    expect(await screen.findByLabelText('Speler 4')).toBeInTheDocument();
    expect(screen.getByLabelText('Naam van team 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Naam van team 2')).toBeInTheDocument();
  });

  it('starts a game and stores the full snapshot', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    renderAt(ctx, '/new');

    await user.click(await screen.findByText('Classic Canasta'));
    await user.type(await screen.findByLabelText('Speler 1'), 'Michel');
    await user.click(screen.getByRole('button', { name: 'Verder' }));
    await user.click(await screen.findByRole('button', { name: 'Partij starten' }));

    await waitFor(async () => {
      expect(await ctx.services.games.list()).toHaveLength(1);
    });

    const games = await ctx.services.games.list();
    const loaded = await ctx.services.games.load(games[0]!.id);
    expect(loaded?.game.effectiveRuleSet.fields.length).toBeGreaterThan(0);
    expect(loaded?.game.effectiveRuleSet.source.url).toBe(classic.source.url);
  });
});

describe('scoreboard', () => {
  it('shows the target score and both teams', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}`);

    // Scoped to the page itself: the desktop rail also names the teams, and it
    // is in the document at every width — CSS, not React, decides which of the
    // two is shown, and jsdom has no CSS.
    const page = within(await screen.findByRole('main'));
    expect(await page.findByText(/doel 5\.000 punten/)).toBeInTheDocument();
    expect(await page.findByText('Michel / Anne')).toBeInTheDocument();
    expect(await page.findByText('Paul / Karin')).toBeInTheDocument();
  });

  it('refreshes automatically after a round is saved', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}`);

    // Both teams start on the same line, hence findAll.
    expect(await screen.findAllByText(/Nog 5\.000 tot 5\.000/)).toHaveLength(2);

    await seedRound(ctx.services, game.id, game.teams, [400, 100]);

    // Nothing refetches: the live query notices the write by itself.
    expect(await screen.findByText(/Nog 4\.600 tot 5\.000/)).toBeInTheDocument();
  });

  it('announces the winner in words, not only in colour', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    await seedRound(ctx.services, game.id, game.teams, [5200, 100]);
    renderAt(ctx, `/games/${game.id}`);

    expect(await screen.findByText(/Gewonnen: Michel \/ Anne/)).toBeInTheDocument();
    expect(await screen.findByText('Gewonnen')).toBeInTheDocument();
  });

  it('presents an exact tie as an extra round, in the app-choice wording', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    await seedRound(ctx.services, game.id, game.teams, [5200, 5200]);
    renderAt(ctx, `/games/${game.id}`);

    expect(await screen.findByText('Gelijkspel')).toBeInTheDocument();
    expect(
      await screen.findByText(/Geen van de geraadpleegde bronnen beschrijft deze situatie/),
    ).toBeInTheDocument();
  });
});

/**
 * Regression cover for the unsaved-changes guard.
 *
 * The bug: saving a round navigated to the scoreboard, and the guard treated
 * that navigation as "leaving a form with unsaved input" — so the user was asked
 * whether they wanted to discard the round they had just saved.
 *
 * The guard must stay on for every other way of leaving the form, so these tests
 * assert both halves.
 */
describe('round entry — unsaved-changes guard', () => {
  /**
   * The guard asks with the app's own dialog, never with `window.confirm`.
   *
   * The spy stays for exactly that reason: every test in this block asserts it
   * was not called, so a native dialog creeping back in fails the suite. The
   * mocked answer would let a stray `confirm()` pass silently, which is what
   * makes the assertion worth having.
   */
  function spyOnConfirm(answer: boolean) {
    return vi.spyOn(globalThis, 'confirm').mockReturnValue(answer);
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not warn about unsaved input when the user saves', async () => {
    const user = userEvent.setup();
    const confirmSpy = spyOnConfirm(true);
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}/round`);

    const points = await screen.findByLabelText('Kaartpunten op tafel');
    fireEvent.change(points, { target: { value: '420' } });
    await user.click(await screen.findByLabelText('Team heeft geopend'));
    await user.click(screen.getByRole('button', { name: 'Ronde opslaan' }));

    // The round lands…
    await waitFor(async () => {
      const loaded = await ctx.services.games.load(game.id);
      expect(loaded?.rounds).toHaveLength(1);
    });

    // …the navigation goes through…
    expect(await screen.findByRole('link', { name: /Ronde \d+ invoeren/ })).toBeInTheDocument();

    // …and the user was never asked to discard anything.
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('still warns when the user leaves without saving, in the app’s own dialog', async () => {
    const user = userEvent.setup();
    const confirmSpy = spyOnConfirm(false);
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}/round`);

    const points = await screen.findByLabelText('Kaartpunten op tafel');
    fireEvent.change(points, { target: { value: '420' } });
    await user.click(screen.getByRole('button', { name: 'Annuleren' }));

    // A real dialog, not the browser's.
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName('Niet-opgeslagen wijzigingen');
    expect(dialog).toHaveAccessibleDescription(/nog niet zijn opgeslagen/);
    expect(confirmSpy).not.toHaveBeenCalled();

    // "Blijven" keeps the user here and commits nothing.
    await user.click(within(dialog).getByRole('button', { name: 'Blijven' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Kaartpunten op tafel')).toBeInTheDocument();
    const loaded = await ctx.services.games.load(game.id);
    expect(loaded?.rounds).toHaveLength(0);
  });

  it('lets the user leave once the dialog is confirmed', async () => {
    const user = userEvent.setup();
    const confirmSpy = spyOnConfirm(false);
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}/round`);

    const points = await screen.findByLabelText('Kaartpunten op tafel');
    fireEvent.change(points, { target: { value: '420' } });
    await user.click(screen.getByRole('button', { name: 'Annuleren' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Verlaten' }));

    // The navigation the blocker was holding now goes through…
    expect(await screen.findByRole('link', { name: /Ronde \d+ invoeren/ })).toBeInTheDocument();
    // …and leaving is still exactly that: nothing was saved on the way out.
    const loaded = await ctx.services.games.load(game.id);
    expect(loaded?.rounds).toHaveLength(0);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('leaves the form clean, so a later navigation is not blocked either', async () => {
    const user = userEvent.setup();
    const confirmSpy = spyOnConfirm(true);
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}/round`);

    const points = await screen.findByLabelText('Kaartpunten op tafel');
    fireEvent.change(points, { target: { value: '250' } });
    await user.click(screen.getByRole('button', { name: 'Ronde opslaan' }));

    await screen.findByRole('link', { name: /Ronde \d+ invoeren/ });

    // A second navigation, after the save, must be just as unobstructed. The
    // in-page bar is the one a phone shows; the rail beside it is the desktop
    // half of the same navigation.
    const page = within(screen.getByRole('main'));
    await user.click(page.getByRole('link', { name: 'Geschiedenis' }));

    // Landed on the history screen: the saved round is listed there.
    expect(await screen.findByRole('link', { name: 'Ronde 1 bewerken' })).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('keeps the user on the form when saving is impossible', async () => {
    const user = userEvent.setup();
    const confirmSpy = spyOnConfirm(true);
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}/round`);

    // Two teams cannot both go out.
    await user.click(await screen.findByLabelText('Uitgegaan'));
    await user.click(screen.getByRole('tab', { name: /Paul \/ Karin/ }));
    await user.click(await screen.findByLabelText('Uitgegaan'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Slechts één team kan in een ronde uitgaan.',
    );

    const save = screen.getByRole('button', { name: 'Ronde opslaan' });
    expect(save).toBeDisabled();
    await user.click(save);

    // Still on the round form, nothing saved, and no navigation was attempted.
    expect(screen.getByLabelText('Kaartpunten op tafel')).toBeInTheDocument();
    const loaded = await ctx.services.games.load(game.id);
    expect(loaded?.rounds).toHaveLength(0);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('writes a draft while typing and removes it once the round is saved', async () => {
    const user = userEvent.setup();
    spyOnConfirm(true);
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    const draftKey = `roundEntry:${game.id}`;
    renderAt(ctx, `/games/${game.id}/round`);

    const points = await screen.findByLabelText('Kaartpunten op tafel');
    fireEvent.change(points, { target: { value: '175' } });

    // The debounce is 500 ms; the draft is the layer that survives a killed tab.
    await waitFor(
      async () => {
        const draft = await ctx.services.rounds.loadDraft(draftKey);
        expect(draft?.inputs[0]?.cardPoints).toBe(175);
      },
      { timeout: 4000 },
    );

    await user.click(screen.getByRole('button', { name: 'Ronde opslaan' }));
    await screen.findByRole('link', { name: /Ronde \d+ invoeren/ });

    // Saving clears the draft, and nothing writes it back afterwards.
    expect(await ctx.services.rounds.loadDraft(draftKey)).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(await ctx.services.rounds.loadDraft(draftKey)).toBeUndefined();
  });
});

describe('round entry', () => {
  it('generates the fields from the rule set, not from a fixed list', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}/round`);

    expect(await screen.findByLabelText('Kaartpunten op tafel')).toBeInTheDocument();
    expect(screen.getByLabelText("Natuurlijke Canasta's")).toBeInTheDocument();
    expect(screen.getByLabelText('Rode drieën')).toBeInTheDocument();
    // A Modern American field must not appear under Classic.
    expect(screen.queryByLabelText("Wild-Canasta's (1–3 jokers)")).not.toBeInTheDocument();
  });

  it('shows Modern American its own extra fields', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services, modernAmerican.id);
    renderAt(ctx, `/games/${game.id}/round`);

    expect(await screen.findByLabelText("Azen-Canasta's")).toBeInTheDocument();
    expect(screen.getByText('Speciale hand')).toBeInTheDocument();
  });

  it('shows a live score preview while typing', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}/round`);

    const points = await screen.findByLabelText('Kaartpunten op tafel');
    await user.clear(points);
    await user.type(points, '420');

    // The breakdown shows both the line and the round total, each +420.
    expect(await screen.findByText('Kaartpunten')).toBeInTheDocument();
    expect((await screen.findAllByText('+420')).length).toBeGreaterThan(0);
  });

  it('writes a variant-specific field into extra', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    const game = await seedGame(ctx.services, modernAmerican.id);
    renderAt(ctx, `/games/${game.id}/round`);

    const aces = await screen.findByLabelText("Azen-Canasta's");
    await user.clear(aces);
    await user.type(aces, '1');
    await user.click(screen.getByRole('button', { name: 'Ronde opslaan' }));

    await waitFor(async () => {
      const loaded = await ctx.services.games.load(game.id);
      expect(loaded?.rounds).toHaveLength(1);
      expect(loaded?.rounds[0]?.input.teams[0]?.extra.acesCanastas).toBe(1);
    });
  });

  it('blocks saving on an error and says why', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}/round`);

    // Both teams going out is impossible.
    await user.click(await screen.findByLabelText('Uitgegaan'));
    await user.click(screen.getByRole('tab', { name: /Paul \/ Karin/ }));
    await user.click(await screen.findByLabelText('Uitgegaan'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Slechts één team kan in een ronde uitgaan.',
    );
    expect(screen.getByRole('button', { name: 'Ronde opslaan' })).toBeDisabled();
  });

  it('shows advisory rules as their own labelled region', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}/round`);

    expect(await screen.findByRole('region', { name: 'Info' })).toBeInTheDocument();
  });

  it('lets the user switch freely between the team tabs', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}/round`);

    const second = await screen.findByRole('tab', { name: /Paul \/ Karin/ });
    await user.click(second);
    expect(second).toHaveAttribute('aria-selected', 'true');

    const first = screen.getByRole('tab', { name: /Michel \/ Anne/ });
    await user.click(first);
    expect(first).toHaveAttribute('aria-selected', 'true');
  });
});

describe('history and corrections', () => {
  it('lists rounds with running totals and a correction link', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    await seedRound(ctx.services, game.id, game.teams, [400, 400]);
    await seedRound(ctx.services, game.id, game.teams, [300, 300]);
    renderAt(ctx, `/games/${game.id}/history`);

    // The table lists the round number in its own column; the correction link
    // is the pencil beside it, named after the round it edits.
    expect(await screen.findByRole('link', { name: 'Ronde 1 bewerken' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Ronde 2 bewerken' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /bewerken/i })).toHaveLength(2);
  });

  it('cascades a correction through every later round', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    await seedRound(ctx.services, game.id, game.teams, [400, 400]);
    await seedRound(ctx.services, game.id, game.teams, [300, 300]);

    const loaded = await ctx.services.games.load(game.id);
    renderAt(ctx, `/games/${game.id}/rounds/${loaded!.rounds[0]!.id}/edit`);

    // Set the whole value at once. Typing into a controlled number input that
    // already holds 400 appends rather than replaces, which the field's own
    // max would then clamp — a test artefact, not the behaviour under test.
    const points = await screen.findByLabelText('Kaartpunten op tafel');
    expect(points).toHaveValue(400);
    fireEvent.change(points, { target: { value: '900' } });
    await user.click(screen.getByRole('button', { name: 'Ronde opslaan' }));

    // 900 + 300 = 1200 for the first team.
    await waitFor(async () => {
      const after = await ctx.services.games.load(game.id);
      expect(after?.game.summary?.totalsByTeam[game.teams[0]!.id]).toBe(1200);
    });
  });
});

describe('rules screen', () => {
  it('reads the frozen snapshot, not the preset it came from', async () => {
    const ctx = await newContext();

    await ctx.services.ruleSets.savePreset({
      ...cloneRuleSet(classic, { id: 'preset-1', name: 'Mijn Canasta' }),
      overrides: [{ path: 'endGame.targetScore', value: 3000 }],
    });

    const outcome = await ctx.services.games.create({
      ...setupFor(classic.id),
      ruleSetId: 'preset-1',
      ruleSetOrigin: 'custom',
    });
    if (!outcome.ok) throw new Error('kon geen spel aanmaken');

    // The preset moves on after the game has started.
    await ctx.services.ruleSets.savePreset({
      ...cloneRuleSet(classic, { id: 'preset-1', name: 'Mijn Canasta' }),
      overrides: [{ path: 'endGame.targetScore', value: 9000 }],
    });

    renderAt(ctx, `/games/${outcome.game.id}/rules`);

    // "Doelscore" appears both as a summary fact and as a settings row.
    expect((await screen.findAllByText('Doelscore')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/3\.000/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/9\.000/)).not.toBeInTheDocument();
  });

  it('presents the tie-break as an app choice, with its own explanation', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}/rules`);

    // Listed as a setting and again under the caveats.
    expect((await screen.findAllByText('Bij exact gelijkspel')).length).toBeGreaterThan(0);
    expect(
      (await screen.findAllByText(/Geen enkele bron beschrijft een exact gelijkspel/)).length,
    ).toBeGreaterThan(0);
  });

  it('is read-only', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}/rules`);

    await screen.findByRole('heading', { name: 'Spelregels' });
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('credits its sources with a retrieval date', async () => {
    const ctx = await newContext();
    const game = await seedGame(ctx.services);
    renderAt(ctx, `/games/${game.id}/rules`);

    expect(await screen.findByRole('link', { name: /Pagat/ })).toBeInTheDocument();
    expect((await screen.findAllByText(/opgehaald 2026-09-19/)).length).toBeGreaterThan(0);
  });
});

/**
 * The destructive confirmation, which is the other place the app used to be at
 * risk of reaching for a native dialog. It shares one component with the
 * unsaved-changes guard, so these assertions cover both shapes of it.
 */
describe('settings — delete-all confirmation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks in a real dialog and deletes nothing until it is confirmed', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    const ctx = await newContext();
    await seedGame(ctx.services);
    await seedGame(ctx.services);
    renderAt(ctx, '/settings');

    await user.click(await screen.findByRole('button', { name: 'Verwijderen' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName('Alle 2 partijen verwijderen?');
    expect(dialog).toHaveAccessibleDescription(/kan niet ongedaan worden gemaakt/);
    expect(confirmSpy).not.toHaveBeenCalled();

    // Backing out leaves the games alone.
    await user.click(within(dialog).getByRole('button', { name: 'Annuleren' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await ctx.services.games.list()).toHaveLength(2);
  });

  it('deletes every game once the destructive action is confirmed', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    await seedGame(ctx.services);
    await seedGame(ctx.services);
    renderAt(ctx, '/settings');

    await user.click(await screen.findByRole('button', { name: 'Verwijderen' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Ja, alles verwijderen' }));

    await waitFor(async () => expect(await ctx.services.games.list()).toHaveLength(0));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens with focus on the way out, not on the deletion', async () => {
    const user = userEvent.setup();
    const ctx = await newContext();
    await seedGame(ctx.services);
    renderAt(ctx, '/settings');

    await user.click(await screen.findByRole('button', { name: 'Verwijderen' }));

    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Annuleren' })).toHaveFocus(),
    );
  });
});
