import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { TeamId } from '@/domain/ids';
import type { TeamRoundInput } from '@/domain/round';
import type { ScoreInputValue } from '@/rules/schema/field';
import {
  blankInput,
  coerceFieldValue,
  readFieldValue,
  writeFieldValue,
} from '@/application/fields/access';
import { buildFieldLayout, type FieldVM } from '@/application/viewmodels/roundForm';
import { previewRound } from '@/application/viewmodels/roundPreview';
import type { IssueVM } from '@/application/viewmodels/issues';
import { roundDraftKey } from '@/application/services/roundService';
import { useServices } from '@/app/servicesContext';
import { useGame } from '@/hooks/useGameData';
import { useCommand } from '@/hooks/useCommand';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { PageBar, PageBody } from '@/ui/app/Page';
import { FieldControl } from '@/ui/fields/FieldControl';
import { Check, Close } from '@/ui/common/icons';
import { Suit } from '@/ui/common/Suit';
import { suitFor } from '@/ui/common/suits';
import {
  Block,
  Button,
  ErrorPanel,
  IconButton,
  LoadingState,
  Score,
  SectionLabel,
  StickyActions,
} from '@/ui/common/primitives';
import { ConfirmDialog } from '@/ui/common/ConfirmDialog';
import { IssueChannels } from '@/ui/round/IssueChannels';
import { BreakdownList } from '@/ui/round/BreakdownList';
import { GameNotFound } from './GameNotFound';

interface FormState {
  inputs: Record<TeamId, TeamRoundInput>;
  dirty: boolean;
  warningsAccepted: boolean;
}

type FormAction =
  | { type: 'set'; teamId: TeamId; field: FieldVM; value: ScoreInputValue }
  | { type: 'hydrate'; inputs: TeamRoundInput[]; dirty: boolean }
  | { type: 'acceptWarnings' }
  | { type: 'saved' };

function reducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'set': {
      const current = state.inputs[action.teamId];
      if (!current) return state;
      return {
        inputs: {
          ...state.inputs,
          [action.teamId]: writeFieldValue(
            current,
            action.field,
            coerceFieldValue(action.field, action.value),
          ),
        },
        dirty: true,
        // An edit may introduce a new warning, so a previous acceptance lapses.
        warningsAccepted: false,
      };
    }

    case 'hydrate':
      return {
        inputs: Object.fromEntries(action.inputs.map((input) => [input.teamId, input])),
        dirty: action.dirty,
        warningsAccepted: false,
      };

    case 'acceptWarnings':
      return { ...state, warningsAccepted: true };

    // The round is committed, so there is nothing unsaved left to protect.
    case 'saved':
      return { ...state, dirty: false, warningsAccepted: false };
  }
}

/**
 * Leave, and save.
 *
 * One definition, mounted twice: in the top bar from `md`, where the design
 * puts both actions on the same line as the round and the team switcher, and in
 * the sticky bottom bar below it, which is where a thumb can reach them. Only
 * one of the two is ever displayed, so only one is ever in the accessibility
 * tree.
 */
function RoundActions({
  onCancel,
  onSave,
  canSave,
  label,
}: {
  onCancel: () => void;
  onSave: () => void;
  canSave: boolean;
  label: string;
}) {
  return (
    <>
      <Button variant="ghost" size="md" onClick={onCancel}>
        Annuleren
      </Button>
      <Button variant="primary" size="lg" block disabled={!canSave} onClick={onSave}>
        <Check size={18} />
        {label}
      </Button>
    </>
  );
}

export function RoundEntryRoute({ mode }: { mode: 'create' | 'correct' }) {
  const { gameId, roundId } = useParams();
  const navigate = useNavigate();
  const services = useServices();
  const loaded = useGame(gameId);

  const [state, dispatch] = useReducer(reducer, {
    inputs: {},
    dirty: false,
    warningsAccepted: false,
  });
  const [hydrated, setHydrated] = useState(false);

  const game = loaded.status === 'ready' ? loaded.data.game : undefined;
  const rounds = loaded.status === 'ready' ? loaded.data.rounds : undefined;

  const layout = useMemo(() => (game ? buildFieldLayout(game.effectiveRuleSet) : []), [game]);
  const fields = useMemo(() => layout.flatMap((group) => group.fields), [layout]);

  const editedIndex = useMemo(
    () => (rounds && roundId ? rounds.findIndex((round) => round.id === roundId) : -1),
    [rounds, roundId],
  );

  const roundNumber = mode === 'correct' ? editedIndex + 1 : (rounds?.length ?? 0) + 1;

  const scoreBefore = useMemo(() => {
    if (!game || !rounds) return {};
    if (mode === 'correct') {
      return rounds[editedIndex]?.computed?.scoreBefore ?? {};
    }
    return rounds.at(-1)?.computed?.scoreAfter ?? {};
  }, [game, rounds, mode, editedIndex]);

  const draftKey = gameId ? roundDraftKey(gameId, mode === 'correct' ? roundId : undefined) : '';

  // Seed the form: an existing round when correcting, a saved draft if there is
  // one, otherwise blanks from the rule set's own defaults.
  useEffect(() => {
    if (!game || !rounds || hydrated) return;

    void (async () => {
      const existing =
        mode === 'correct' ? rounds.find((round) => round.id === roundId)?.input.teams : undefined;
      const draft = draftKey ? await services.rounds.loadDraft(draftKey) : undefined;

      const seeded =
        draft?.inputs ?? existing ?? game.teams.map((team) => blankInput(team.id, fields));

      dispatch({ type: 'hydrate', inputs: seeded, dirty: Boolean(draft) });
      setHydrated(true);
    })();
  }, [game, rounds, hydrated, mode, roundId, draftKey, fields, services]);

  // Debounced draft, the layer that actually survives a killed tab.
  // The handle is kept so saving can cancel a pending write outright: without
  // that, a draft could land *after* the save transaction deleted it, leaving a
  // stale draft for a round that has already been committed.
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cancelPendingDraft = useCallback(() => {
    if (draftTimer.current === undefined) return;
    clearTimeout(draftTimer.current);
    draftTimer.current = undefined;
  }, []);

  useEffect(() => {
    if (!state.dirty || !gameId || !draftKey) return;

    draftTimer.current = setTimeout(() => {
      draftTimer.current = undefined;
      void services.rounds.saveDraft(draftKey, gameId, {
        inputs: Object.values(state.inputs),
      });
    }, 500);

    return cancelPendingDraft;
  }, [state.dirty, state.inputs, gameId, draftKey, services, cancelPendingDraft]);

  const guard = useUnsavedChanges(state.dirty);
  const { markClean } = guard;

  const preview = useMemo(() => {
    if (!game || Object.keys(state.inputs).length === 0) return undefined;
    return previewRound({
      ruleSet: game.effectiveRuleSet,
      teams: game.teams,
      roundNumber,
      inputs: game.teams.map((team) => state.inputs[team.id] ?? blankInput(team.id, fields)),
      scoreBefore,
    });
  }, [game, state.inputs, roundNumber, scoreBefore, fields]);

  const save = useCommand(async () => {
    if (!gameId || !game) return undefined;
    const inputs = game.teams.map((team) => state.inputs[team.id]!).filter(Boolean);

    return mode === 'correct' && roundId
      ? services.rounds.correct({ gameId, roundId, inputs })
      : services.rounds.saveNew({ gameId, inputs });
  });

  const [activeTeam, setActiveTeam] = useState(0);

  const issuesFor = useCallback(
    (teamId: TeamId, fieldId: string): IssueVM[] =>
      [...(preview?.errors ?? []), ...(preview?.warnings ?? [])].filter(
        (issue) => issue.fieldId === fieldId && (issue.teamId === teamId || !issue.teamId),
      ),
    [preview],
  );

  if (loaded.status === 'loading') return <LoadingState label="Partij laden…" />;
  if (loaded.status === 'missing' || !game) return <GameNotFound />;
  if (mode === 'correct' && editedIndex === -1) {
    return <ErrorPanel title="Deze ronde bestaat niet meer." />;
  }
  // Seeding is asynchronous (an existing round, or a saved draft). Rendering
  // before it lands would flash the defaults over the real values.
  if (!hydrated) return <LoadingState label="Ronde laden…" />;

  const team = game.teams[activeTeam];
  // "Toch opslaan" only makes sense once the errors are gone; while a round is
  // impossible the button stays plainly labelled and disabled.
  const blockedByWarnings =
    Boolean(preview?.canSave) && Boolean(preview?.requiresConfirmation) && !state.warningsAccepted;
  const canSave = Boolean(preview?.canSave) && save.state !== 'running';
  const saveLabel = blockedByWarnings ? 'Toch opslaan' : 'Ronde opslaan';
  // Whether the switcher still fits on the header line. The design keeps it
  // there up to four teams and gives it a row of its own beyond that.
  const ownRow = game.teams.length > 4;
  const activePreview = preview?.teams.find((entry) => entry.teamId === team?.id);

  /**
   * Save, then leave. The order matters:
   *
   *   cancel the pending draft → persist → mark clean → navigate
   *
   * Cancelling first makes the save independent of whether the 500 ms debounce
   * happens to fire; marking clean before navigating is what stops the unsaved-
   * changes guard from blocking the navigation the save just earned.
   */
  async function handleSave() {
    if (blockedByWarnings) {
      dispatch({ type: 'acceptWarnings' });
      return;
    }

    cancelPendingDraft();
    const outcome = await save.run(undefined);

    if (!outcome?.ok) {
      // Nothing was committed, so the typed input is still the only copy.
      // Write it out now rather than waiting for a debounce that was cancelled.
      if (gameId && draftKey) {
        void services.rounds.saveDraft(draftKey, gameId, {
          inputs: Object.values(state.inputs),
        });
      }
      return;
    }

    // The round is committed and the service has already removed its draft.
    dispatch({ type: 'saved' });
    markClean();
    navigate(`/games/${gameId}`);
  }

  return (
    <div className="flex flex-1 flex-col">
      {/*
       * Entering a round is a focus mode: no bottom navigation, one way out,
       * and the team switcher plus every running total pinned to the top so the
       * score never scrolls away while the fields below do.
       *
       * On a phone that is a stack: title, then the switcher, with the actions
       * in a bar under the thumb. From `md` the design lays the same things out
       * on one line across the *whole* width beside the rail — round on the
       * left, switcher and actions on the right — so the bar below disappears
       * and the full height goes to the fields. From five teams the switcher no
       * longer fits on that line and takes a row of its own underneath, which
       * is what the design does rather than shrinking the chips further.
       */}
      <PageBar width="wide" className="sticky top-0 z-30">
        <div className="flex flex-col gap-2.5 pb-3 pt-2.5 md:flex-row md:flex-wrap md:items-center md:gap-4 md:py-3.5">
          <div className="flex items-center gap-2 md:order-1 md:min-w-0 md:flex-1">
            <IconButton
              label="Ronde sluiten"
              className="md:hidden"
              onClick={() => navigate(`/games/${gameId}`)}
            >
              <Close />
            </IconButton>
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-body font-semibold md:font-display md:text-2xl md:tracking-title">
                {mode === 'correct' ? `Ronde ${roundNumber} corrigeren` : `Ronde ${roundNumber}`}
              </h1>
              <p className="flex items-center justify-center gap-1.5 text-xs text-muted md:justify-start">
                {state.dirty ? (
                  <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-warn" />
                ) : null}
                {preview?.filledLabel}
              </p>
            </div>
            <span className="size-10 shrink-0 md:hidden" aria-hidden="true" />
          </div>

          <div
            role="tablist"
            aria-label="Team kiezen"
            /*
             * A scrolling strip on a phone, where there is room for two chips
             * at a time. From `md` it sits on the header line while it fits,
             * and from five teams it takes its own row. That row divides itself
             * by `auto-fit`, so six chips stand side by side and eight wrap
             * onto a second line without either number appearing here.
             */
            className={`flex snap-x gap-1.5 overflow-x-auto rounded-btn bg-panel2 p-1 ${
              ownRow
                ? 'md:order-4 md:grid md:w-full md:grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] md:overflow-visible'
                : 'md:order-2 md:shrink-0 md:overflow-visible'
            }`}
          >
            {game.teams.map((item, index) => {
              const itemPreview = preview?.teams.find((entry) => entry.teamId === item.id);
              const selected = index === activeTeam;
              const filled = (itemPreview?.lines.length ?? 0) > 0;

              return (
                <button
                  key={item.id}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  className={`flex min-h-13 min-w-[calc(50%-0.1875rem)] flex-1 shrink-0 snap-start items-center justify-between gap-2 rounded-tile px-3 py-1.5 text-left transition-colors ${
                    ownRow ? 'md:min-w-0' : 'md:min-w-34'
                  } ${
                    selected
                      ? 'border-[1.5px] border-accent bg-panel shadow-soft'
                      : 'border-[1.5px] border-transparent'
                  }`}
                  onClick={() => setActiveTeam(index)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 truncate text-caption font-semibold">
                      <Suit index={index} />
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className="flex items-center gap-1 text-meta text-muted">
                      {filled && !selected ? <Check size={11} className="text-accent" /> : null}
                      {selected ? 'Nu invullen' : filled ? 'Ingevuld' : 'Nog leeg'}
                    </span>
                  </span>
                  <Score className="shrink-0 text-[1.375rem]">
                    {itemPreview?.totalText ?? '0'}
                  </Score>
                </button>
              );
            })}
          </div>

          <div className="hidden shrink-0 items-center gap-2 md:order-3 md:flex">
            <RoundActions
              onCancel={() => navigate(`/games/${gameId}`)}
              onSave={() => void handleSave()}
              canSave={canSave}
              label={saveLabel}
            />
          </div>
        </div>
      </PageBar>

      <PageBody width="wide">
        <div className="flex flex-1 flex-col gap-3 pt-4">
        {save.state === 'failed' ? (
          <ErrorPanel title="Opslaan is niet gelukt. Je invoer is bewaard.">
            {save.error?.message}
          </ErrorPanel>
        ) : null}

        {save.result && !save.result.ok && save.result.reason === 'validation' ? (
          <ErrorPanel title="Deze ronde kon niet worden opgeslagen.">
            <ul className="list-disc pl-5">
              {save.result.issues.map((issue) => (
                <li key={issue.code}>{issue.message}</li>
              ))}
            </ul>
          </ErrorPanel>
        ) : null}

        {/*
         * From `lg` the design splits this in two: the fields on the left, and
         * what they add up to pinned on the right. Entering a round then stops
         * being a scroll down to check the total and back up to correct it.
         */}
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_21.25rem] lg:items-start lg:gap-6">
        {team ? (
          <form
            /*
             * The field groups are laid out by how much room this column has,
             * not by how wide the window is: `auto-fit` puts as many 16rem
             * columns side by side as fit and falls back to one when they do
             * not. Beside the overview that works out at the two columns the
             * design draws; on a phone it is the single column it always was.
             */
            className="grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] items-start gap-4"
            onSubmit={(event) => event.preventDefault()}
          >
            {layout.map((group) => (
              <Block key={group.category} className="px-4 py-1.5 lg:rounded-[1.25rem] lg:px-4.5">
                <SectionLabel className="block pb-1 pt-2.5">{group.title}</SectionLabel>
                {group.fields.map((field) => (
                  <FieldControl
                    key={field.id}
                    field={field}
                    idPrefix={`${team.id}__${field.id}`}
                    context={`${suitFor(activeTeam)} ${team.name} · ${group.title}`}
                    value={
                      (state.inputs[team.id]
                        ? readFieldValue(state.inputs[team.id]!, field.id)
                        : undefined) ?? field.defaultValue
                    }
                    issues={issuesFor(team.id, field.id)}
                    onChange={(value) => dispatch({ type: 'set', teamId: team.id, field, value })}
                  />
                ))}
              </Block>
            ))}
          </form>
        ) : null}

        {preview ? (
          <aside
            aria-label="Overzicht van deze ronde"
            className="flex flex-col gap-3 lg:sticky lg:top-24"
          >
            {/*
             * Every team in one card, the one being edited lifted out of it —
             * the design's overview. A card each would push a six-player game
             * off the screen; a line each keeps the whole round visible while
             * one of them is being typed.
             */}
            <Block className="px-5 pb-3.5 pt-1.5">
              <SectionLabel as="h2" className="block py-2.5">
                Deze ronde · alle deelnemers
              </SectionLabel>
              {game.teams.map((item, index) => {
                const itemPreview = preview.teams.find((entry) => entry.teamId === item.id);
                if (!itemPreview) return null;
                const selected = index === activeTeam;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTeam(index)}
                    aria-current={selected ? 'true' : undefined}
                    className={`flex w-full items-center justify-between gap-3 text-left ${
                      selected
                        ? '-mx-3 rounded-tile bg-accent-soft px-3 py-2.5'
                        : 'border-t border-border py-2.5'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm">
                      <Suit index={index} />
                      <span className={`truncate ${selected ? 'font-semibold' : ''}`}>
                        {item.name}
                      </span>
                      <span className="shrink-0 text-xs tabular text-muted">
                        → {itemPreview.scoreAfterText}
                      </span>
                    </span>
                    <Score
                      className={`shrink-0 text-[1.375rem] ${selected ? 'text-accent' : ''}`}
                    >
                      {itemPreview.totalText}
                    </Score>
                  </button>
                );
              })}
            </Block>

            {/* The engine's own reading of what has been typed, for the team
                being typed into. */}
            {activePreview && activePreview.lines.length > 0 ? (
              <BreakdownList
                team={activePreview}
                title={
                  <>
                    <Suit index={activeTeam} /> {team?.name}
                  </>
                }
              />
            ) : null}

            <IssueChannels
              errors={preview.errors}
              warnings={preview.warnings}
              advisories={preview.advisories}
            />
          </aside>
        ) : null}
        </div>
        </div>
      </PageBody>

      <StickyActions className="md:hidden">
        <RoundActions
          onCancel={() => navigate(`/games/${gameId}`)}
          onSave={() => void handleSave()}
          canSave={canSave}
          label={saveLabel}
        />
      </StickyActions>

      {!preview?.canSave ? (
        <span className="sr-only" role="status">
          Los eerst de fouten op.
        </span>
      ) : null}

      {/*
       * The unsaved-changes guard, asked in the app's own words. The blocker
       * itself is untouched — it still holds the navigation, and this dialog
       * only decides which of its two exits is taken.
       */}
      <ConfirmDialog
        open={guard.blocked}
        title="Niet-opgeslagen wijzigingen"
        description="Je hebt wijzigingen die nog niet zijn opgeslagen. Weet je zeker dat je deze pagina wilt verlaten?"
        confirmLabel="Verlaten"
        cancelLabel="Blijven"
        tone="danger"
        onConfirm={guard.confirmLeave}
        onCancel={guard.cancelLeave}
      />
    </div>
  );
}
