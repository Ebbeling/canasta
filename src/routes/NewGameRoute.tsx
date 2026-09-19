import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { Json } from '@/domain/ids';
import type { ConfigOverride } from '@/rules/schema/ruleSet';
import type { RuleSetChoice } from '@/application/services/ruleSetService';
import {
  buildGameSetup,
  partyOverrides,
  partyShapeOf,
  validateGameSetup,
  type GameSetupVM,
} from '@/application/viewmodels/setup';
import { useServices } from '@/app/servicesContext';
import { useRuleSetChoices } from '@/hooks/useGameData';
import { useCommand } from '@/hooks/useCommand';
import { useLiveResult } from '@/hooks/useLiveResult';
import { AppBar } from '@/ui/app/AppBar';
import { ChevronRight } from '@/ui/common/icons';
import { Suit } from '@/ui/common/Suit';
import { SettingsEditor } from '@/ui/rules/SettingsEditor';
import { PartyEditor } from '@/ui/setup/PartyEditor';
import { draftForShape, type PartyDraft } from '@/ui/setup/party';
import {
  Badge,
  Block,
  Button,
  ErrorPanel,
  LoadingState,
  Muted,
  SectionLabel,
  SegmentedControl,
  StickyActions,
  Switch,
} from '@/ui/common/primitives';

type Step = 'ruleset' | 'players' | 'rules';
type Mode = 'standard' | 'custom';

const STEPS: Step[] = ['ruleset', 'players', 'rules'];

const STEP_TITLES: Record<Step, string> = {
  ruleset: 'Welke variant spelen jullie?',
  players: 'Wie zit waar?',
  rules: 'Huisregels',
};

/** The interface's own ceiling; the engine has none. */
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;

const TEXT_INPUT =
  'mt-1.5 min-h-12 w-full rounded-tile border-[1.5px] border-border bg-surface px-3.5 text-base ' +
  'outline-none transition-colors focus:border-accent focus:bg-panel';

/**
 * The new-game flow.
 *
 * Standard and custom games take exactly the same route through the code. A
 * custom game is not a different kind of game: it is the same base rule set
 * with a few more `ConfigOverride`s — the party shape among them — handed to
 * the one configuration pipeline. Nothing downstream can tell the difference,
 * which is the point.
 */
export function NewGameRoute() {
  const navigate = useNavigate();
  const services = useServices();
  const choices = useRuleSetChoices();
  const [params] = useSearchParams();

  const [step, setStep] = useState<Step>('ruleset');
  const [mode, setMode] = useState<Mode>('standard');
  const [chosen, setChosen] = useState<RuleSetChoice | undefined>();
  const [party, setParty] = useState<PartyDraft | undefined>();
  const [values, setValues] = useState<Record<string, Json>>({});
  const [gameName, setGameName] = useState('');
  const [saveAsPreset, setSaveAsPreset] = useState(false);
  const [presetName, setPresetName] = useState('');

  const ruleSet = useLiveResult(
    chosen ? () => services.ruleSets.resolve(chosen.id, chosen.origin) : null,
    [chosen?.id, chosen?.origin],
  );

  const setup: GameSetupVM | undefined = useMemo(
    () => (ruleSet.status === 'ready' ? buildGameSetup(ruleSet.data) : undefined),
    [ruleSet],
  );

  const create = useCommand(services.games.create);
  const createPreset = useCommand(services.ruleSets.createPreset);

  // Arriving from "Gebruiken" on the rule set screen.
  const preselectId = params.get('ruleSet');
  const preselectOrigin = params.get('origin');
  useEffect(() => {
    if (chosen || choices.status !== 'ready' || !preselectId) return;
    const match = choices.data.find(
      (item) => item.id === preselectId && item.origin === preselectOrigin,
    );
    if (!match) return;
    setChosen(match);
    setParty(undefined);
    setValues({});
    setStep('players');
  }, [choices, preselectId, preselectOrigin, chosen]);

  // The party draft starts from the rule set's own declared shape.
  useEffect(() => {
    if (ruleSet.status !== 'ready' || party) return;
    setParty(draftForShape(partyShapeOf(ruleSet.data)));
  }, [ruleSet, party]);

  function pick(choice: RuleSetChoice) {
    setChosen(choice);
    setParty(undefined);
    setValues({});
    setStep('players');
  }

  const shape = party
    ? {
        playerCount: party.playerNames.length,
        teamCount: party.teamSeats.length,
        mode: party.mode,
      }
    : undefined;

  /**
   * Party shape first, then everything the settings editor collected.
   *
   * The shape the user has in front of them is always the one that counts.
   * `mode` decides whether the *number of players* may be changed, and nothing
   * more — it must never decide whether a choice the interface offered is
   * honoured. A shape that matches the rule set's own is filtered out further
   * down by `meaningfulOverrides`, so a plain standard game still records no
   * overrides at all.
   */
  function collectOverrides(): ConfigOverride[] {
    const shaped = shape ? partyOverrides(shape) : [];
    const shapedPaths = new Set(shaped.map((entry) => entry.path));

    return [
      ...shaped,
      ...Object.entries(values)
        .filter(([path]) => !shapedPaths.has(path))
        .map(([path, value]) => ({ path, value }) as ConfigOverride),
    ];
  }

  const setupIssues = useMemo(() => {
    if (ruleSet.status !== 'ready' || !party || !shape) return [];

    // Judged against the shape that will actually be played, for every game.
    // The reading of that configuration happens in the application layer.
    return validateGameSetup(
      ruleSet.data,
      {
        ruleSetId: ruleSet.data.id,
        ruleSetOrigin: chosen?.origin ?? 'builtin',
        playerNames: party.playerNames.map((name, seat) => name.trim() || `Speler ${seat + 1}`),
        teamNames: party.teamNames,
        teamSeats: party.teamSeats,
        overrides: [],
      },
      shape,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruleSet, party, chosen]);

  async function start() {
    if (!chosen || !party) return;

    const names = party.playerNames.map((name, seat) => name.trim() || `Speler ${seat + 1}`);
    const teamNames = party.teamSeats.map((seats, index) => {
      const custom = party.teamNames[index]?.trim();
      if (custom) return custom;
      // Individual play: a "team" is simply the player.
      return party.mode === 'individual'
        ? (names[seats[0] ?? index] ?? `Speler ${index + 1}`)
        : `Team ${index + 1}`;
    });

    const configured = collectOverrides();

    if (saveAsPreset && presetName.trim()) {
      // Best effort: the game must still start even if saving the preset fails.
      await createPreset.run({
        sourceId: chosen.id,
        sourceOrigin: chosen.origin,
        name: presetName,
        overrides: configured,
      });
    }

    const outcome = await create.run({
      ruleSetId: chosen.id,
      ruleSetOrigin: chosen.origin,
      playerNames: names,
      teamNames,
      teamSeats: party.teamSeats,
      overrides: configured,
      gameName: gameName.trim() || undefined,
    });

    if (outcome?.ok) navigate(`/games/${outcome.game.id}`);
  }

  const stepIndex = STEPS.indexOf(step);
  const blocked = setupIssues.some((issue) => issue.severity === 'error');

  /**
   * Whether this game actually deviates from the rule set it started from.
   *
   * Read off the choices themselves rather than the segmented control: a
   * standard-mode game whose teams were re-arranged is a deviation, and a
   * custom-mode game that changed nothing is not.
   */
  const declared = ruleSet.status === 'ready' ? partyShapeOf(ruleSet.data) : undefined;
  const deviates =
    Object.keys(values).length > 0 ||
    (shape !== undefined &&
      declared !== undefined &&
      (shape.playerCount !== declared.playerCount ||
        shape.teamCount !== declared.teamCount ||
        shape.mode !== declared.mode));

  return (
    <div className="flex flex-1 flex-col">
      <AppBar
        title="Nieuwe partij"
        back={step === 'ruleset' ? '/' : undefined}
        onBack={step === 'ruleset' ? undefined : () => setStep(STEPS[stepIndex - 1] ?? 'ruleset')}
      />

      <div className="flex flex-1 flex-col gap-4.5 pt-2">
        <div className="flex flex-col gap-2.5">
          <div className="flex gap-1.5" aria-hidden="true">
            {STEPS.map((name, index) => (
              <span
                key={name}
                className={`h-1.25 flex-1 rounded-full ${
                  index <= stepIndex ? 'bg-accent' : 'bg-panel2'
                }`}
              />
            ))}
          </div>
          <div>
            <SectionLabel as="div">
              Stap {stepIndex + 1} van {STEPS.length}
            </SectionLabel>
            <h2 className="mt-0.5 font-display text-[1.75rem] font-semibold leading-tight tracking-title text-pretty">
              {STEP_TITLES[step]}
            </h2>
          </div>
        </div>

        {create.result && !create.result.ok ? (
          <ErrorPanel title="De partij kon niet worden gestart.">
            {create.result.reason === 'validation' ? (
              <ul className="list-disc pl-5">
                {create.result.issues.map((issue) => (
                  <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>
                ))}
              </ul>
            ) : (
              <p>Onbekende regelset.</p>
            )}
          </ErrorPanel>
        ) : null}

        {step === 'ruleset' ? (
          <>
            <SegmentedControl
              name="spelsoort"
              label="Soort partij"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'standard', label: 'Standaard' },
                { value: 'custom', label: 'Aangepast' },
              ]}
            />
            <Muted>
              {mode === 'standard'
                ? 'Je speelt met het aantal spelers dat de regelset voorschrijft. De indeling in teams kies je zelf.'
                : 'Je kiest zelf hoeveel spelers meedoen en hoe ze zijn ingedeeld.'}
            </Muted>

            {choices.status === 'loading' ? <LoadingState /> : null}
            {choices.status === 'ready' ? (
              <ul className="flex flex-col gap-2.5">
                {choices.data.map((choice, index) => (
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
                        <span className="flex flex-wrap items-center gap-2 text-base font-semibold">
                          {choice.name}
                          {choice.locked ? null : <Badge tone="accent">Aangepast</Badge>}
                        </span>
                        <span className="mt-0.5 block text-caption text-muted">
                          {choice.summaryLine}
                        </span>
                        <span className="mt-1.5 block text-sm leading-snug text-pretty">
                          {choice.description}
                        </span>
                      </span>
                      <ChevronRight size={18} className="mt-3 shrink-0 text-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <Muted className="text-center">
              <Link to="/rulesets" className="font-semibold text-accent">
                Regelsets beheren
              </Link>
            </Muted>
          </>
        ) : null}

        {step === 'players' && setup && party ? (
          <>
            <PartyEditor
              draft={party}
              onChange={setParty}
              minPlayers={mode === 'custom' ? MIN_PLAYERS : setup.playerSlots.length}
              maxPlayers={mode === 'custom' ? MAX_PLAYERS : setup.playerSlots.length}
              issues={setupIssues}
            />
            {party.mode === 'individual' ? (
              <p className="px-2 text-center text-caption leading-snug text-muted text-pretty">
                Deze variant speel je met {party.playerNames.length} spelers, zonder teams.
              </p>
            ) : null}
          </>
        ) : null}

        {step === 'rules' && setup ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 rounded-btn bg-accent-soft px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-body font-semibold">{setup.ruleSetName}</p>
                <p className="truncate text-caption text-muted">{setup.summaryLine}</p>
              </div>
              <span className="shrink-0 text-caption font-semibold text-accent">
                {deviates ? 'Aangepast' : 'Standaard'}
              </span>
            </div>

            <Block className="px-4 py-3.5">
              <label htmlFor="partij-naam" className="text-body font-medium">
                Naam van de partij
              </label>
              <input
                id="partij-naam"
                type="text"
                className={TEXT_INPUT}
                placeholder="Bijvoorbeeld: donderdagavond"
                value={gameName}
                onChange={(event) => setGameName(event.target.value)}
              />
            </Block>

            <SettingsEditor
              sections={setup.editableSections}
              values={values}
              changedPaths={new Set(Object.keys(values))}
              onChange={(path, value) => setValues((current) => ({ ...current, [path]: value }))}
            />

            <Block className="px-4 py-1.5">
              <div className="flex min-h-touch items-center justify-between gap-3 py-3">
                <label htmlFor="bewaar-regelset" className="min-w-0 flex-1 text-body font-medium">
                  Bewaren als regelset
                  <span className="mt-0.5 block text-caption font-normal text-muted text-pretty">
                    Zo kun je deze indeling en huisregels later opnieuw gebruiken.
                  </span>
                </label>
                <Switch
                  id="bewaar-regelset"
                  checked={saveAsPreset}
                  onChange={(next) => {
                    setSaveAsPreset(next);
                    if (next && !presetName) setPresetName(`Mijn ${setup.ruleSetName}`);
                  }}
                />
              </div>
              {saveAsPreset ? (
                <div className="border-t border-border py-3">
                  <label htmlFor="nieuwe-regelset-naam" className="text-body font-medium">
                    Naam van de regelset
                  </label>
                  <input
                    id="nieuwe-regelset-naam"
                    type="text"
                    className={TEXT_INPUT}
                    value={presetName}
                    onChange={(event) => setPresetName(event.target.value)}
                  />
                </div>
              ) : null}
            </Block>
          </div>
        ) : null}
      </div>

      <StickyActions>
        {step === 'ruleset' ? (
          <p className="flex-1 py-3 text-center text-note text-muted">
            Kies een variant om verder te gaan
          </p>
        ) : (
          <>
            <Button
              variant="ghost"
              size="md"
              onClick={() => setStep(STEPS[stepIndex - 1] ?? 'ruleset')}
            >
              Terug
            </Button>
            {step === 'players' ? (
              <Button
                variant="primary"
                size="lg"
                block
                disabled={blocked}
                onClick={() => setStep('rules')}
              >
                Verder
                <ChevronRight size={18} />
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                block
                disabled={create.state === 'running'}
                onClick={() => void start()}
              >
                Partij starten
              </Button>
            )}
          </>
        )}
      </StickyActions>
    </div>
  );
}
