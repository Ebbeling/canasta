import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { TeamId } from '@/domain/ids';
import type { TeamRoundInput } from '@/domain/round';
import type { ScoreInputValue } from '@/rules/schema/field';
import { blankInput, readFieldValue, writeFieldValue } from '@/application/fields/access';
import { buildFieldLayout, type FieldVM } from '@/application/viewmodels/roundForm';
import { previewRound } from '@/application/viewmodels/roundPreview';
import { useTableSession } from '@/hooks/useTableSession';
import { FieldControl } from '@/ui/fields/FieldControl';
import { Check, Close } from '@/ui/common/icons';
import { Suit } from '@/ui/common/Suit';
import { suitFor } from '@/ui/common/suits';
import {
  Block,
  Button,
  ErrorPanel,
  LoadingState,
  Note,
  Score,
  SectionLabel,
  StickyActions,
} from '@/ui/common/primitives';
import { TableMessage } from '@/ui/table/pieces';

/**
 * A round, entered at the table.
 *
 * Every piece of this is the app's existing round entry: the fields come from
 * `buildFieldLayout` reading the game's own frozen rule set, the running total
 * comes from `previewRound`, and the controls are the same `FieldControl`
 * components the single-device flow uses. Nothing about Canasta is decided
 * here, and nothing about it is repeated here.
 *
 * What is different is where it goes. The device does not own this game, so
 * saving means handing the input to the server, which scores it with the very
 * same engine and tells the room. The preview shown while typing is therefore
 * exactly what the server will compute — the engine is deterministic, and both
 * sides run it.
 */
export function TableRoundRoute() {
  const { token } = useParams();
  const navigate = useNavigate();
  const session = useTableSession(token);

  // A remembered state is good enough to fill a round in: the game and its
  // frozen rule set came with it, and the engine that computes the preview runs
  // here. What the server has not seen yet is the submission, and the queue
  // says so plainly.
  const state =
    session.view.status === 'ready'
      ? session.view.state
      : session.view.status === 'unreachable'
        ? session.view.state
        : undefined;
  const game = state?.game?.game;
  const rounds = state?.game?.rounds ?? [];

  const layout = useMemo(() => (game ? buildFieldLayout(game.effectiveRuleSet) : []), [game]);
  const fields = useMemo(() => layout.flatMap((group) => group.fields), [layout]);

  const [inputs, setInputs] = useState<Record<TeamId, TeamRoundInput>>({});
  const [active, setActive] = useState(0);
  const [failure, setFailure] = useState<string | undefined>();

  if (session.view.status === 'loading') return <LoadingState label="Partij laden…" />;

  if (!state || !game) {
    return (
      <TableMessage
        title="Geen partij om in te vullen"
        action={
          <Button size="lg" block onClick={() => void navigate(`/table/${token}`)}>
            Terug naar de tafel
          </Button>
        }
      >
        <p>
          {session.offline
            ? 'De server is nu niet bereikbaar, dus de partij kan niet worden geladen.'
            : 'Deze tafel heeft op dit moment geen lopende partij.'}
        </p>
      </TableMessage>
    );
  }

  const teams = [...game.teams].sort((a, b) => a.order - b.order);
  const team = teams[active];

  const inputFor = (teamId: TeamId) => inputs[teamId] ?? blankInput(teamId, fields);
  const filled = teams.filter((entry) => inputs[entry.id] !== undefined).length;

  const preview = previewRound({
    ruleSet: game.effectiveRuleSet,
    teams,
    roundNumber: rounds.length + 1,
    inputs: teams.map((entry) => inputFor(entry.id)),
    scoreBefore: game.summary?.totalsByTeam ?? {},
  });

  function set(teamId: TeamId, field: FieldVM, value: ScoreInputValue) {
    setInputs((current) => ({
      ...current,
      [teamId]: writeFieldValue(current[teamId] ?? blankInput(teamId, fields), field, value),
    }));
  }

  async function save() {
    setFailure(undefined);
    const accepted = await session.submitRound(teams.map((entry) => inputFor(entry.id)));

    if (accepted) {
      void navigate(`/table/${token}`);
      return;
    }

    // Not accepted is not the same as lost: the submission is in the queue and
    // the table screen shows what is still waiting.
    setFailure(
      session.offline
        ? 'Geen verbinding. De ronde staat op dit apparaat en wordt verstuurd zodra de server er weer is.'
        : 'De server heeft deze ronde niet aangenomen. Kijk op het tafelscherm wat er mis is.',
    );
    void navigate(`/table/${token}`);
  }

  return (
    <div className="flex flex-1 flex-col gap-3 px-4 py-4 pb-28 sm:mx-auto sm:w-full sm:max-w-screen-sm">
      {session.offline ? (
        <Note lead="Geen verbinding" tone="warn">
          Je kunt gewoon invullen. De ronde blijft op dit apparaat staan tot de server hem
          bevestigt.
        </Note>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <SectionLabel as="h2">Ronde {rounds.length + 1}</SectionLabel>
          <p className="text-caption text-muted">
            Tafel {state.session.table.number} · {preview.filledLabel}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => void navigate(`/table/${token}`)}>
          <Close />
          Annuleren
        </Button>
      </div>

      {failure ? (
        <ErrorPanel title="Niet bevestigd">
          <p>{failure}</p>
        </ErrorPanel>
      ) : null}

      {/* Who am I typing for. Large targets: this is used standing up. */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {teams.map((entry, index) => {
          const total = preview.teams.find((one) => one.teamId === entry.id);
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setActive(index)}
              className={`flex min-h-14 flex-1 shrink-0 flex-col items-start gap-0.5 rounded-control border px-3.5 py-2 text-left ${
                index === active ? 'border-accent bg-accent-soft' : 'border-border bg-panel'
              }`}
            >
              <span className="flex items-center gap-1.5 text-caption font-semibold">
                <Suit index={index} />
                <span className="truncate">{entry.name}</span>
              </span>
              <Score className="text-lg">{total?.total ?? 0}</Score>
            </button>
          );
        })}
      </div>

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
                  context={`${suitFor(active)} ${team.name} · ${group.title}`}
                  value={readFieldValue(inputFor(team.id), field.id) ?? field.defaultValue}
                  issues={[]}
                  onChange={(value) => set(team.id, field, value)}
                />
              ))}
            </Block>
          ))}
        </form>
      ) : null}

      {preview.errors.length > 0 ? (
        <Note lead="Fout" tone="danger">
          {preview.errors[0]!.message}
        </Note>
      ) : preview.warnings.length > 0 ? (
        <Note lead="Let op" tone="warn">
          {preview.warnings[0]!.message}
        </Note>
      ) : null}

      <StickyActions>
        <Button
          variant="primary"
          size="xl"
          block
          disabled={!preview.canSave || filled === 0}
          onClick={() => void save()}
        >
          <Check />
          Ronde opslaan
        </Button>
      </StickyActions>
    </div>
  );
}
