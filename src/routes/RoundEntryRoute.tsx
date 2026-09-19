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
import { Button, Card, ErrorPanel, LoadingState, Muted, PageTitle } from '@/ui/common/primitives';
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

  const { markClean } = useUnsavedChanges(state.dirty);

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
    <div className="space-y-4">
      <PageTitle>
        {mode === 'correct' ? `Ronde ${roundNumber} corrigeren` : `Ronde ${roundNumber}`}
      </PageTitle>

      {/* Sticky score header: both teams and their live total, always visible. */}
      <div className="sticky top-0 z-10 -mx-4 border-b border-[--color-border] bg-[--color-surface] px-4 py-2">
        <div role="tablist" aria-label="Team kiezen" className="flex gap-2">
          {game.teams.map((item, index) => {
            const itemPreview = preview?.teams.find((entry) => entry.teamId === item.id);
            return (
              <button
                key={item.id}
                role="tab"
                type="button"
                aria-selected={index === activeTeam}
                className={`min-h-[var(--spacing-touch)] flex-1 rounded-xl border px-3 text-left ${
                  index === activeTeam
                    ? 'border-[--color-accent] bg-[--color-panel]'
                    : 'border-[--color-border]'
                }`}
                onClick={() => setActiveTeam(index)}
              >
                <span className="block truncate text-sm">{item.name}</span>
                <span className="block text-lg font-semibold tabular">
                  {itemPreview?.totalText ?? '0'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

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
        <form className="space-y-5" onSubmit={(event) => event.preventDefault()}>
          {layout.map((group) => (
            <Card key={group.category}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[--color-ink-muted]">
                {group.title}
              </h2>
              <div className="space-y-4">
                {group.fields.map((field) => (
                  <FieldControl
                    key={field.id}
                    field={field}
                    idPrefix={`${team.id}__${field.id}`}
                    value={
                      (state.inputs[team.id]
                        ? readFieldValue(state.inputs[team.id]!, field.id)
                        : undefined) ?? field.defaultValue
                    }
                    issues={issuesFor(team.id, field.id)}
                    onChange={(value) => dispatch({ type: 'set', teamId: team.id, field, value })}
                  />
                ))}
              </div>
            </Card>
          ))}
        </form>
      ) : null}

      {preview ? (
        <>
          <Card>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[--color-ink-muted]">
              Deze ronde — {team?.name}
            </h2>
            {teamPreview ? <BreakdownList team={teamPreview} /> : null}
          </Card>

          <IssueChannels
            errors={preview.errors}
            warnings={preview.warnings}
            advisories={preview.advisories}
          />
        </>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={!canSave} onClick={() => void handleSave()}>
          {blockedByWarnings ? 'Toch opslaan' : 'Ronde opslaan'}
        </Button>
        <Button onClick={() => navigate(`/games/${gameId}`)}>Annuleren</Button>
        {!preview?.canSave ? <Muted>Los eerst de fouten op.</Muted> : null}
      </div>
    </div>
  );
}
