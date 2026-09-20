import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { ValidationIssue } from '@/domain/result';
import type {
  OddParticipantMode,
  TournamentGameSettings,
  TournamentMode,
  TournamentScoringMode,
  TournamentSettings,
} from '@/domain/tournament';
import {
  partyOverrides,
  partyShapeOf,
  teamLayoutsFor,
  type PartyShape,
} from '@/application/viewmodels/setup';
import {
  buildPairingView,
  type PairingProposalVM,
} from '@/application/viewmodels/tournamentView';
import type { RuleSetChoice } from '@/application/services/ruleSetService';
import { validateTournamentSetup } from '@/application/services/tournamentService';
import { useCommand } from '@/hooks/useCommand';
import { useRuleSetChoices } from '@/hooks/useGameData';
import { useLiveResult } from '@/hooks/useLiveResult';
import { useServices } from '@/app/servicesContext';
import { AppBar } from '@/ui/app/AppBar';
import { PageBody } from '@/ui/app/Page';
import { usePublishRailSteps } from '@/ui/app/railSteps';
import { Check, ChevronRight, Minus, Plus, Trash } from '@/ui/common/icons';
import { Suit } from '@/ui/common/Suit';
import {
  Block,
  Button,
  ErrorPanel,
  LoadingState,
  Muted,
  Note,
  Score,
  SectionLabel,
  SegmentedControl,
  StickyActions,
} from '@/ui/common/primitives';

/**
 * Starting a tournament: five steps, in the same language as "Nieuwe partij".
 *
 *   1. the tournament — what it is called and how it is planned
 *   2. the game       — which rule set the tables play
 *   3. the people     — players, or teams that stay together
 *   4. the pairing    — the first round, proposed by the engine
 *   5. the check      — everything at a glance, then start
 *
 * Nothing is stored before the last step. The pairing shown in step four is a
 * proposal; confirming it is what creates the first round.
 */

type Step = 'tournament' | 'game' | 'people' | 'pairing' | 'review';

const STEPS: Step[] = ['tournament', 'game', 'people', 'pairing', 'review'];

const STEP_TITLES: Record<Step, string> = {
  tournament: 'Welk toernooi?',
  game: 'Wat wordt er gespeeld?',
  people: 'Wie doet mee?',
  pairing: 'Voorgestelde indeling',
  review: 'Alles klopt?',
};

const RAIL_LABELS: Record<Step, string> = {
  tournament: 'Toernooi',
  game: 'Spel',
  people: 'Deelnemers',
  pairing: 'Indeling',
  review: 'Controleren',
};

const TEXT_INPUT =
  'min-h-12 w-full rounded-tile border-[1.5px] border-border bg-surface px-3.5 text-base ' +
  'transition-colors outline-none focus:border-accent focus:bg-panel';

const STEPPER =
  'flex size-11 items-center justify-center rounded-tile bg-panel text-ink shadow-soft ' +
  'transition-opacity disabled:opacity-35 disabled:shadow-none';

interface Draft {
  name: string;
  mode: TournamentMode;
  plannedDays: number;
  plannedRoundsPerDay: number;
  scoringMode: TournamentScoringMode;
  drawAllowed: boolean;
  oddParticipantMode: OddParticipantMode;
  manualPairingAllowed: boolean;
  entryKind: 'player' | 'team';
  /** Player names, or team names when the tournament is played in teams. */
  names: string[];
  /** Members per team, only used when `entryKind` is `team`. */
  members: string[][];
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex min-h-touch items-center justify-between gap-3 border-t border-border py-3">
      <span className="text-body font-medium">{label}</span>
      <div className="flex shrink-0 items-center gap-0.5 rounded-control bg-panel2 p-0.75">
        <button
          type="button"
          className={STEPPER}
          disabled={value <= min}
          aria-label={`${label}: één minder`}
          onClick={() => onChange(value - 1)}
        >
          <Minus size={18} />
        </button>
        <output className="w-9 text-center font-display text-[1.375rem] font-semibold tabular">
          {value}
        </output>
        <button
          type="button"
          className={STEPPER}
          disabled={value >= max}
          aria-label={`${label}: één meer`}
          onClick={() => onChange(value + 1)}
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}

export function NewTournamentRoute() {
  const navigate = useNavigate();
  const services = useServices();
  const choices = useRuleSetChoices();

  const [step, setStep] = useState<Step>('tournament');
  const [chosen, setChosen] = useState<RuleSetChoice | undefined>();
  const [shape, setShape] = useState<PartyShape | undefined>();

  // The chosen rule set itself, so the table's shape starts at whatever it
  // declares — the same route the new-game wizard takes.
  const ruleSet = useLiveResult(
    chosen ? () => services.ruleSets.resolve(chosen.id, chosen.origin) : null,
    [chosen?.id, chosen?.origin],
  );
  const [proposal, setProposal] = useState<PairingProposalVM | undefined>();
  const [draft, setDraft] = useState<Draft>({
    name: '',
    mode: 'fixed',
    plannedDays: 1,
    plannedRoundsPerDay: 3,
    scoringMode: 'tournament-points',
    drawAllowed: true,
    oddParticipantMode: 'bye',
    manualPairingAllowed: true,
    entryKind: 'player',
    names: ['', '', '', ''],
    members: [],
  });

  const stepIndex = STEPS.indexOf(step);

  // Once the rule set has resolved, start the table at the shape it declares.
  if (ruleSet.status === 'ready' && !shape) {
    setShape(partyShapeOf(ruleSet.data));
  }

  usePublishRailSteps(
    STEPS.map((name, index) => ({
      label:
        name === 'game' && chosen ? `Spel · ${chosen.name}` : RAIL_LABELS[name],
      done: index < stepIndex,
      current: index === stepIndex,
    })),
  );

  /** The table shape, from the rule set the tables will play. */
  const gameSettings: TournamentGameSettings | undefined = useMemo(() => {
    if (!chosen || !shape) return undefined;
    return {
      ruleSetId: chosen.id,
      ruleSetOrigin: chosen.origin,
      ruleSetName: chosen.name,
      participantsPerMatch:
        draft.entryKind === 'team' ? shape.teamCount : shape.playerCount,
      teamsPerMatch: shape.teamCount,
      overrides: partyOverrides(shape),
    };
  }, [chosen, shape, draft.entryKind]);

  const settings: TournamentSettings = {
    mode: draft.mode,
    scoringMode: draft.scoringMode,
    drawAllowed: draft.drawAllowed,
    oddParticipantMode: draft.oddParticipantMode,
    manualPairingAllowed: draft.manualPairingAllowed,
    plannedDays: draft.mode === 'fixed' ? draft.plannedDays : undefined,
    plannedRoundsPerDay: draft.mode === 'fixed' ? draft.plannedRoundsPerDay : undefined,
  };

  const participants = draft.names.map((name, index) => ({
    kind: draft.entryKind,
    name: name.trim() || `${draft.entryKind === 'team' ? 'Team' : 'Speler'} ${index + 1}`,
    memberNames:
      draft.entryKind === 'team'
        ? (draft.members[index] ?? []).map((member, seat) => member.trim() || `Speler ${seat + 1}`)
        : [name.trim() || `Speler ${index + 1}`],
  }));

  const issues: ValidationIssue[] = gameSettings
    ? validateTournamentSetup({ name: draft.name, settings, gameSettings, participants })
    : [];
  const blocking = issues.filter((issue) => issue.severity === 'error');

  const create = useCommand(async () => {
    if (!gameSettings) return undefined;
    return services.tournaments.create({
      name: draft.name,
      settings,
      gameSettings,
      participants,
    });
  });

  /** How many tables the first round will have, from what has been entered. */
  const tableCount = gameSettings
    ? Math.floor(participants.length / gameSettings.participantsPerMatch)
    : 0;

  function pick(choice: RuleSetChoice) {
    setChosen(choice);
    setShape(undefined);
    setStep('people');
  }

  function setNameCount(next: number) {
    setDraft((current) => {
      const names = [...current.names];
      const members = [...current.members];
      while (names.length < next) {
        names.push('');
        members.push(Array.from({ length: teamSize }, () => ''));
      }
      names.length = next;
      members.length = next;
      return { ...current, names, members };
    });
  }

  const teamSize = shape ? shape.playerCount / shape.teamCount : 2;

  /**
   * What the first round would look like, before the tournament exists.
   *
   * The engine lives in the application layer; the wizard asks for a proposal
   * and renders the answer.
   */
  function generatePairing() {
    if (!gameSettings) return;

    const { participantIds, outcome } = services.tournaments.previewPairing({
      name: draft.name,
      settings,
      gameSettings,
      participants,
    });

    if (!outcome.ok) {
      setProposal(undefined);
      return;
    }

    setProposal(
      buildPairingView(
        {
          participants: participants.map((participant, index) => ({
            id: participantIds[index]!,
            name: participant.name,
          })),
          teamsPerMatch: gameSettings.teamsPerMatch,
        },
        outcome.proposal,
      ),
    );
  }

  async function start() {
    const outcome = await create.run(undefined);
    if (outcome?.ok) navigate(`/tournaments/${outcome.tournament.id}`);
  }

  const canContinue =
    step === 'tournament'
      ? draft.name.trim().length > 0
      : step === 'game'
        ? Boolean(gameSettings)
        : step === 'people'
          ? blocking.length === 0
          : true;

  return (
    <div className="flex flex-1 flex-col">
      <AppBar
        title="Nieuw toernooi"
        back={step === 'tournament' ? '/tournaments' : undefined}
        onBack={step === 'tournament' ? undefined : () => setStep(STEPS[stepIndex - 1] ?? 'tournament')}
      />

      <PageBody width="wide">
        <div className="flex flex-1 flex-col gap-4.5 pt-2">
          <div className="flex flex-col gap-2.5 md:flex-row md:items-end md:justify-between md:gap-5">
            <div className="flex gap-1.5 md:order-2 md:w-60 md:shrink-0" aria-hidden="true">
              {STEPS.map((name, index) => (
                <span
                  key={name}
                  className={`h-1.25 flex-1 rounded-full ${
                    index <= stepIndex ? 'bg-accent' : 'bg-panel2'
                  }`}
                />
              ))}
            </div>
            <div className="md:order-1 md:min-w-0">
              <SectionLabel as="div">
                Stap {stepIndex + 1} van {STEPS.length}
              </SectionLabel>
              <h2 className="mt-0.5 font-display text-[1.75rem] font-semibold leading-tight tracking-title text-pretty md:text-[2.125rem]">
                {STEP_TITLES[step]}
              </h2>
            </div>
          </div>

          {create.result && !create.result.ok ? (
            <ErrorPanel title="Het toernooi kon niet worden gestart.">
              {create.result.reason === 'validation' ? (
                <ul className="list-disc pl-5">
                  {create.result.issues.map((issue) => (
                    <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>
                  ))}
                </ul>
              ) : (
                <p>{create.result.message}</p>
              )}
            </ErrorPanel>
          ) : null}

          {/* ---------------------------------------------- 1 · the tournament */}
          {step === 'tournament' ? (
            <div className="flex flex-col gap-3">
              <Block className="px-4 py-3.5">
                <label htmlFor="toernooi-naam" className="text-body font-medium">
                  Naam van het toernooi
                </label>
                <input
                  id="toernooi-naam"
                  type="text"
                  className={`${TEXT_INPUT} mt-1.5`}
                  placeholder="Bijvoorbeeld: Clubkampioenschap 2026"
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </Block>

              <Block className="px-4 py-1.5">
                <SectionLabel className="block pb-1 pt-2.5">Planning</SectionLabel>
                <div className="border-t border-border py-3">
                  <p className="text-body font-medium">Opzet</p>
                  <div className="mt-2">
                    <SegmentedControl
                      name="toernooi-opzet"
                      label="Opzet van het toernooi"
                      value={draft.mode}
                      options={[
                        { value: 'fixed', label: 'Vast schema' },
                        { value: 'open', label: 'Open' },
                      ]}
                      onChange={(mode) => setDraft((current) => ({ ...current, mode }))}
                    />
                  </div>
                  <Muted className="mt-2 text-caption">
                    {draft.mode === 'fixed'
                      ? 'Je legt vooraf vast hoeveel speeldagen en rondes er zijn.'
                      : 'Na elke ronde kies je zelf: nog een ronde, speeldag beëindigen of het toernooi afronden.'}
                  </Muted>
                </div>

                {draft.mode === 'fixed' ? (
                  <>
                    <Stepper
                      label="Speeldagen"
                      value={draft.plannedDays}
                      min={1}
                      max={14}
                      onChange={(plannedDays) => setDraft((current) => ({ ...current, plannedDays }))}
                    />
                    <Stepper
                      label="Rondes per speeldag"
                      value={draft.plannedRoundsPerDay}
                      min={1}
                      max={12}
                      onChange={(plannedRoundsPerDay) =>
                        setDraft((current) => ({ ...current, plannedRoundsPerDay }))
                      }
                    />
                  </>
                ) : null}
              </Block>

              <Block className="px-4 py-1.5">
                <SectionLabel className="block pb-1 pt-2.5">Telling</SectionLabel>
                <div className="border-t border-border py-3">
                  <p className="text-body font-medium">Waarop wordt de stand bepaald?</p>
                  <div className="mt-2">
                    <SegmentedControl
                      name="toernooi-telling"
                      label="Telling"
                      value={draft.scoringMode}
                      options={[
                        { value: 'tournament-points', label: 'Toernooipunten' },
                        { value: 'canasta-score', label: 'Canasta-score' },
                      ]}
                      onChange={(scoringMode) =>
                        setDraft((current) => ({ ...current, scoringMode }))
                      }
                    />
                  </div>
                  <Muted className="mt-2 text-caption">
                    {draft.scoringMode === 'tournament-points'
                      ? 'Winst 2 punten, gelijkspel 1, verlies 0. Elke ronde telt even zwaar.'
                      : 'De stand is de som van de Canasta-scores uit de afgeronde partijen.'}
                  </Muted>
                </div>

                <div className="flex min-h-touch items-center justify-between gap-3 border-t border-border py-3">
                  <div className="min-w-0">
                    <p className="text-body font-medium">Gelijkspel telt mee</p>
                    <Muted className="text-caption">
                      Staat dit uit, dan kent het toernooi geen gelijkspel.
                    </Muted>
                  </div>
                  <SegmentedControl
                    name="toernooi-gelijkspel"
                    label="Gelijkspel"
                    value={draft.drawAllowed ? 'yes' : 'no'}
                    options={[
                      { value: 'yes', label: 'Ja' },
                      { value: 'no', label: 'Nee' },
                    ]}
                    onChange={(value) =>
                      setDraft((current) => ({ ...current, drawAllowed: value === 'yes' }))
                    }
                  />
                </div>
              </Block>

              <Block className="px-4 py-1.5">
                <SectionLabel className="block pb-1 pt-2.5">Indeling</SectionLabel>
                <div className="border-t border-border py-3">
                  <p className="text-body font-medium">Als er deelnemers overblijven</p>
                  <div className="mt-2">
                    <SegmentedControl
                      name="toernooi-rest"
                      label="Overgebleven deelnemers"
                      value={draft.oddParticipantMode}
                      options={[
                        { value: 'bye', label: 'Vrije ronde' },
                        { value: 'extra-player-at-table', label: 'Aanschuiven' },
                      ]}
                      onChange={(oddParticipantMode) =>
                        setDraft((current) => ({ ...current, oddParticipantMode }))
                      }
                    />
                  </div>
                </div>

                <div className="flex min-h-touch items-center justify-between gap-3 border-t border-border py-3">
                  <div className="min-w-0">
                    <p className="text-body font-medium">Indeling aanpassen</p>
                    <Muted className="text-caption">
                      Mag de organisator tafels met de hand ruilen?
                    </Muted>
                  </div>
                  <SegmentedControl
                    name="toernooi-handmatig"
                    label="Indeling aanpassen"
                    value={draft.manualPairingAllowed ? 'yes' : 'no'}
                    options={[
                      { value: 'yes', label: 'Ja' },
                      { value: 'no', label: 'Nee' },
                    ]}
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        manualPairingAllowed: value === 'yes',
                      }))
                    }
                  />
                </div>
              </Block>
            </div>
          ) : null}

          {/* ---------------------------------------------------- 2 · the game */}
          {step === 'game' ? (
            <div className="flex flex-col gap-3">
              <Muted>
                De partijen aan tafel worden met deze regelset gespeeld. Elke partij legt zijn
                eigen kopie vast, dus een latere wijziging raakt gespeelde partijen niet.
              </Muted>

              {choices.status === 'loading' ? <LoadingState /> : null}
              {choices.status === 'ready' ? (
                <ul className="flex flex-col gap-2.5">
                  {choices.data.map((choice, index) => {
                    return (
                      <li key={`${choice.origin}:${choice.id}`}>
                        <button
                          type="button"
                          className="flex w-full items-start gap-3.5 rounded-list border-[1.5px] border-border bg-panel px-4.5 py-4 text-left transition-colors hover:border-accent hover:bg-panel2"
                          onClick={() => pick(choice)}
                        >
                          <span className="flex size-11 shrink-0 items-center justify-center rounded-tile bg-panel2 text-lg">
                            <Suit index={index} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-base font-semibold">{choice.name}</span>
                            <span className="block text-caption text-muted">
                              {choice.summaryLine}
                            </span>
                          </span>
                          <ChevronRight className="mt-1 shrink-0 text-muted" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          ) : null}

          {/* -------------------------------------------------- 3 · the people */}
          {step === 'people' && shape ? (
            <div className="flex flex-col gap-3">
              <Block className="px-4 py-1.5">
                <SectionLabel className="block pb-1 pt-2.5">Aan tafel</SectionLabel>
                <div className="border-t border-border py-3">
                  <p className="text-body font-medium">Hoe zit een tafel in elkaar?</p>
                  <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Tafelindeling">
                    {teamLayoutsFor(shape.playerCount).map((layout) => (
                      <button
                        key={layout.teamCount}
                        type="button"
                        aria-pressed={layout.teamCount === shape.teamCount}
                        onClick={() => setShape(layout)}
                        className={`flex min-h-touch items-center rounded-full border px-3.5 text-note transition-colors ${
                          layout.teamCount === shape.teamCount
                            ? 'border-accent bg-accent-soft font-semibold text-accent'
                            : 'border-border bg-panel font-medium text-ink'
                        }`}
                      >
                        {layout.mode === 'individual'
                          ? 'Ieder voor zich'
                          : `${layout.teamCount} teams van ${layout.playerCount / layout.teamCount}`}
                      </button>
                    ))}
                  </div>
                </div>

                <Stepper
                  label="Spelers per tafel"
                  value={shape.playerCount}
                  min={2}
                  max={8}
                  onChange={(playerCount) => {
                    const layouts = teamLayoutsFor(playerCount);
                    setShape(layouts[0]);
                  }}
                />

                <div className="border-t border-border py-3">
                  <p className="text-body font-medium">Wie doen er mee?</p>
                  <div className="mt-2">
                    <SegmentedControl
                      name="toernooi-deelnemers"
                      label="Soort deelnemers"
                      value={draft.entryKind}
                      options={[
                        { value: 'player', label: 'Losse spelers' },
                        { value: 'team', label: 'Vaste teams' },
                      ]}
                      onChange={(entryKind) => setDraft((current) => ({ ...current, entryKind }))}
                    />
                  </div>
                  <Muted className="mt-2 text-caption">
                    {draft.entryKind === 'team'
                      ? 'Een team blijft het hele toernooi bij elkaar en wordt nooit gesplitst.'
                      : 'Spelers worden elke ronde opnieuw ingedeeld, met zo min mogelijk herhaling.'}
                  </Muted>
                </div>
              </Block>

              <Block className="px-4 py-1.5">
                <div className="flex items-center justify-between gap-3 border-b border-border py-2.5">
                  <SectionLabel as="h2">
                    {draft.entryKind === 'team' ? 'Teams' : 'Spelers'} · {draft.names.length}
                  </SectionLabel>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      disabled={draft.names.length <= 2}
                      onClick={() => setNameCount(draft.names.length - 1)}
                    >
                      <Minus size={16} />
                      <span className="sr-only">Eén minder</span>
                    </Button>
                    <Button size="sm" onClick={() => setNameCount(draft.names.length + 1)}>
                      <Plus size={16} />
                      <span className="sr-only">Eén meer</span>
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-x-6">
                  {draft.names.map((name, index) => (
                    <div key={index} className="border-t border-border py-2.5">
                      <div className="flex items-center gap-2">
                        <Suit index={index} className="w-4 shrink-0 text-center text-sm" />
                        <input
                          type="text"
                          className={TEXT_INPUT}
                          aria-label={`${draft.entryKind === 'team' ? 'Team' : 'Speler'} ${index + 1}`}
                          placeholder={`${draft.entryKind === 'team' ? 'Team' : 'Speler'} ${index + 1}`}
                          value={name}
                          onChange={(event) =>
                            setDraft((current) => {
                              const names = [...current.names];
                              names[index] = event.target.value;
                              return { ...current, names };
                            })
                          }
                        />
                        <button
                          type="button"
                          aria-label={`${name || `Deelnemer ${index + 1}`} verwijderen`}
                          className="inline-flex size-10 shrink-0 items-center justify-center rounded-tile text-muted transition-colors hover:bg-panel2 hover:text-heart"
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              names: current.names.filter((_unused, at) => at !== index),
                              members: current.members.filter((_unused, at) => at !== index),
                            }))
                          }
                        >
                          <Trash size={18} />
                        </button>
                      </div>

                      {draft.entryKind === 'team' ? (
                        <div className="mt-2 flex flex-col gap-1.5 pl-6">
                          {Array.from({ length: teamSize }, (_unused, seat) => (
                            <input
                              key={seat}
                              type="text"
                              className={`${TEXT_INPUT} min-h-11 text-sm`}
                              aria-label={`Speler ${seat + 1} van team ${index + 1}`}
                              placeholder={`Speler ${seat + 1}`}
                              value={draft.members[index]?.[seat] ?? ''}
                              onChange={(event) =>
                                setDraft((current) => {
                                  const members = current.members.map((entry) => [...entry]);
                                  while (members.length <= index) members.push([]);
                                  members[index]![seat] = event.target.value;
                                  return { ...current, members };
                                })
                              }
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </Block>

              {issues.map((issue) => (
                <Note
                  key={`${issue.code}-${issue.message}`}
                  lead={issue.severity === 'error' ? 'Fout' : 'Let op'}
                  tone={issue.severity === 'error' ? 'danger' : 'warn'}
                >
                  {issue.message}
                </Note>
              ))}
            </div>
          ) : null}

          {/* ------------------------------------------------- 4 · the pairing */}
          {step === 'pairing' ? (
            <div className="flex flex-col gap-3">
              {!proposal ? (
                <LoadingState label="Indeling maken…" />
              ) : (
                <>
                  <Muted>
                    {proposal.summary} · {proposal.qualityLine}
                  </Muted>
                  {proposal.notes.map((note) => (
                    <Note key={note} lead="Let op" tone="warn">
                      {note}
                    </Note>
                  ))}
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] items-start gap-2.5">
                    {proposal.tables.map((table) => (
                      <Block key={table.tableNumber} className="px-4 py-2.5">
                        <SectionLabel as="h3" className="block border-b border-border pb-2">
                          {table.title}
                        </SectionLabel>
                        {table.seatNames.map((seatName, seat) => (
                          <p
                            key={`${seatName}-${seat}`}
                            className="border-t border-border py-2 text-sm first:border-t-0"
                          >
                            {seatName}
                          </p>
                        ))}
                      </Block>
                    ))}
                  </div>
                  <Button size="md" onClick={() => generatePairing()}>
                    Opnieuw indelen
                  </Button>
                </>
              )}
            </div>
          ) : null}

          {/* -------------------------------------------------- 5 · the check */}
          {step === 'review' && gameSettings ? (
            <div className="flex flex-col gap-3">
              <Block className="px-4 py-1.5">
                <SectionLabel className="block pb-1 pt-2.5">{draft.name}</SectionLabel>
                <dl className="grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-2 py-3">
                  {[
                    {
                      value: String(participants.length),
                      label:
                        draft.entryKind === 'team'
                          ? participants.length === 1
                            ? 'team'
                            : 'teams'
                          : participants.length === 1
                            ? 'speler'
                            : 'spelers',
                    },
                    { value: String(tableCount), label: tableCount === 1 ? 'tafel' : 'tafels' },
                    {
                      value:
                        draft.mode === 'fixed'
                          ? String(draft.plannedDays * draft.plannedRoundsPerDay)
                          : '—',
                      label:
                        draft.mode === 'fixed' && draft.plannedDays * draft.plannedRoundsPerDay === 1
                          ? 'ronde'
                          : 'rondes',
                    },
                    {
                      value: draft.mode === 'fixed' ? String(draft.plannedDays) : '—',
                      label: draft.mode === 'fixed' && draft.plannedDays === 1 ? 'dag' : 'dagen',
                    },
                  ].map((fact) => (
                    <div key={fact.label} className="rounded-control bg-panel2 px-2 py-2.5 text-center">
                      <dd className="font-display text-xl font-semibold tabular">{fact.value}</dd>
                      <dt className="mt-0.5 text-micro leading-tight text-muted">{fact.label}</dt>
                    </div>
                  ))}
                </dl>
              </Block>

              <Block className="px-4 py-1.5">
                {[
                  ['Opzet', draft.mode === 'fixed' ? 'Vast schema' : 'Open toernooi'],
                  [
                    'Telling',
                    draft.scoringMode === 'tournament-points' ? 'Toernooipunten' : 'Canasta-score',
                  ],
                  ['Gelijkspel', draft.drawAllowed ? 'Telt mee' : 'Niet van toepassing'],
                  ['Regelset', gameSettings.ruleSetName],
                  [
                    'Aan tafel',
                    `${gameSettings.participantsPerMatch} ${
                      draft.entryKind === 'team' ? 'teams' : 'spelers'
                    }`,
                  ],
                  [
                    'Overgebleven deelnemers',
                    draft.oddParticipantMode === 'bye' ? 'Vrije ronde' : 'Schuiven aan',
                  ],
                  ['Indeling aanpassen', draft.manualPairingAllowed ? 'Toegestaan' : 'Niet toegestaan'],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex min-h-touch items-center justify-between gap-3 border-t border-border py-2.5 first:border-t-0"
                  >
                    <span className="text-body">{label}</span>
                    <span className="shrink-0 text-body font-medium">{value}</span>
                  </div>
                ))}
              </Block>

              <Note lead="Daarna" tone="info">
                Het toernooi wordt aangemaakt. De eerste ronde deel je in vanaf het overzicht, zodat
                je vlak voor aanvang nog kunt bijsturen.
              </Note>

              <Score className="sr-only">{participants.length}</Score>
            </div>
          ) : null}
        </div>
      </PageBody>

      <StickyActions>
        {step !== 'tournament' ? (
          <Button
            variant="ghost"
            size="md"
            onClick={() => setStep(STEPS[stepIndex - 1] ?? 'tournament')}
          >
            Terug
          </Button>
        ) : null}

        {step === 'review' ? (
          <Button
            variant="primary"
            size="lg"
            block
            className="md:w-auto md:px-7"
            disabled={create.state === 'running' || blocking.length > 0}
            onClick={() => void start()}
          >
            <Check size={18} />
            Toernooi starten
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            block
            className="md:w-auto md:px-7"
            disabled={!canContinue}
            onClick={() => {
              const next = STEPS[stepIndex + 1] ?? 'review';
              if (next === 'pairing') generatePairing();
              setStep(next);
            }}
          >
            Verder
            <ChevronRight size={18} />
          </Button>
        )}
      </StickyActions>
    </div>
  );
}
