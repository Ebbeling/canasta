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
  const teamPreview = preview?.teams.find((item) => item.teamId === team?.id);
  // "Toch opslaan" only makes sense once the errors are gone; while a round is
  // impossible the button stays plainly labelled and disabled.
  const blockedByWarnings =
    Boolean(preview?.canSave) && Boolean(preview?.requiresConfirmation) && !state.warningsAccepted;
  const canSave = Boolean(preview?.canSave) && save.state !== 'running';

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
       * and the team switcher plus both running totals pinned to the top so the
       * score never scrolls away while the fields below do.
       */}
      <div className="sticky top-0 z-30 -mx-4 flex flex-col gap-2.5 border-b border-border bg-panel px-3 pb-3 pt-2.5 sm:-mx-6 sm:px-5">
        <div className="flex items-center gap-2">
          <IconButton label="Ronde sluiten" onClick={() => navigate(`/games/${gameId}`)}>
            <Close />
          </IconButton>
          <div className="flex-1 text-center">
            <h1 className="text-body font-semibold">
              {mode === 'correct' ? `Ronde ${roundNumber} corrigeren` : `Ronde ${roundNumber}`}
            </h1>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
              {state.dirty ? (
                <>
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-warn" />
                  Concept bewaard · nog niet opgeslagen
                </>
              ) : (
                game.effectiveRuleSet.name
              )}
            </p>
          </div>
          <span className="size-10 shrink-0" aria-hidden="true" />
        </div>

        <div
          role="tablist"
          aria-label="Team kiezen"
          className="grid grid-cols-2 gap-1.5 rounded-btn bg-panel2 p-1"
        >
          {game.teams.map((item, index) => {
            const itemPreview = preview?.teams.find((entry) => entry.teamId === item.id);
            const selected = index === activeTeam;
            const members = game.players
              .filter((player) => item.memberIds.includes(player.id))
              .map((player) => player.name);

            return (
              <button
                key={item.id}
                role="tab"
                type="button"
                aria-selected={selected}
                className={`flex min-h-14 items-center justify-between gap-2 rounded-tile px-3 py-1.5 text-left transition-colors ${
                  selected
                    ? 'border-[1.5px] border-accent bg-panel shadow-soft'
                    : 'border-[1.5px] border-transparent text-muted'
                }`}
                onClick={() => setActiveTeam(index)}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-caption font-semibold">
                    <Suit index={index} />
                    <span className="truncate">{item.name}</span>
                  </span>
                  {members.length > 0 ? (
                    <span className="block truncate text-meta text-muted">
                      {members.join(' & ')}
                    </span>
                  ) : null}
                </span>
                <Score className="shrink-0 text-2xl">{itemPreview?.totalText ?? '0'}</Score>
              </button>
            );
          })}
        </div>
      </div>

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

        {team ? (
          <form className="flex flex-col gap-3" onSubmit={(event) => event.preventDefault()}>
            {layout.map((group) => (
              <Block key={group.category} className="px-4 py-1.5">
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
          <>
            {teamPreview ? (
              <BreakdownList
                team={teamPreview}
                title={
                  <>
                    Deze ronde · <Suit index={activeTeam} /> {team?.name}
                  </>
                }
              />
            ) : null}

            <IssueChannels
              errors={preview.errors}
              warnings={preview.warnings}
              advisories={preview.advisories}
            />
          </>
        ) : null}
      </div>

      <StickyActions>
        <Button variant="ghost" size="md" onClick={() => navigate(`/games/${gameId}`)}>
          Annuleren
        </Button>
        <Button
          variant="primary"
          size="lg"
          block
          disabled={!canSave}
          onClick={() => void handleSave()}
        >
          <Check size={18} />
          {blockedByWarnings ? 'Toch opslaan' : 'Ronde opslaan'}
        </Button>
        {!preview?.canSave ? (
          <span className="sr-only" role="status">
            Los eerst de fouten op.
          </span>
        ) : null}
      </StickyActions>

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
