import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { ConfigOverride } from '@/rules/schema/ruleSet';
import type { RuleSetChoice } from '@/application/services/ruleSetService';
import { buildGameSetup, defaultTeamSeats, type GameSetupVM } from '@/application/viewmodels/setup';
import { useServices } from '@/app/servicesContext';
import { useRuleSetChoices } from '@/hooks/useGameData';
import { useCommand } from '@/hooks/useCommand';
import { useLiveResult } from '@/hooks/useLiveResult';
import { AppBar } from '@/ui/app/AppBar';
import { ChevronRight } from '@/ui/common/icons';
import { Suit } from '@/ui/common/Suit';
import {
  Badge,
  Block,
  Button,
  ErrorPanel,
  LoadingState,
  SectionLabel,
  StickyActions,
  Switch,
} from '@/ui/common/primitives';

type Step = 'ruleset' | 'players' | 'rules';

const STEPS: Step[] = ['ruleset', 'players', 'rules'];

const STEP_TITLES: Record<Step, string> = {
  ruleset: 'Welke variant spelen jullie?',
  players: 'Wie zit waar?',
  rules: 'Huisregels',
};

const TEXT_INPUT =
  'min-h-12 w-full rounded-tile border-[1.5px] border-border bg-surface px-3.5 text-base ' +
  'transition-colors outline-none focus:border-accent focus:bg-panel';

/**
 * The new-game flow.
 *
 * The deviations entered in the last step are collected as `ConfigOverride[]`
 * and handed to `games.create`, which runs the one configuration pipeline
 * (validate → resolve → validate → freeze). Nothing here writes a rule-set
 * property into a game directly.
 */
export function NewGameRoute() {
  const navigate = useNavigate();
  const services = useServices();
  const choices = useRuleSetChoices();

  const [step, setStep] = useState<Step>('ruleset');
  const [chosen, setChosen] = useState<RuleSetChoice | undefined>();
  const [playerNames, setPlayerNames] = useState<string[]>([]);
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, number | boolean | string>>({});

  const ruleSet = useLiveResult(
    chosen ? () => services.ruleSets.resolve(chosen.id, chosen.origin) : null,
    [chosen?.id, chosen?.origin],
  );

  const setup: GameSetupVM | undefined = useMemo(
    () => (ruleSet.status === 'ready' ? buildGameSetup(ruleSet.data) : undefined),
    [ruleSet],
  );

  const create = useCommand(services.games.create);

  function pick(choice: RuleSetChoice) {
    setChosen(choice);
    setPlayerNames([]);
    setTeamNames([]);
    setOverrides({});
    setStep('players');
  }

  async function start() {
    if (!chosen || !setup || ruleSet.status !== 'ready') return;

    const seats = defaultTeamSeats(ruleSet.data);
    const names = setup.playerSlots.map(
      (slot, index) => playerNames[index]?.trim() || slot.placeholder,
    );

    const outcome = await create.run({
      ruleSetId: chosen.id,
      ruleSetOrigin: chosen.origin,
      playerNames: names,
      teamNames: setup.defaultTeamNames.map((fallback, index) => {
        const custom = teamNames[index]?.trim();
        if (custom) return custom;
        // Individual play: a "team" is simply the player.
        return setup.hasTeams ? fallback : (names[seats[index]?.[0] ?? index] ?? fallback);
      }),
      teamSeats: seats,
      overrides: Object.entries(overrides).map(
        ([path, value]) => ({ path, value }) as ConfigOverride,
      ),
    });

    if (outcome?.ok) navigate(`/games/${outcome.game.id}`);
  }

  const stepIndex = STEPS.indexOf(step);
  const seats = setup && ruleSet.status === 'ready' ? defaultTeamSeats(ruleSet.data) : [];

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
            <SectionLabel as="div">Stap {stepIndex + 1} van {STEPS.length}</SectionLabel>
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
                  <li key={issue.code}>{issue.message}</li>
                ))}
              </ul>
            ) : (
              <p>Onbekende regelset.</p>
            )}
          </ErrorPanel>
        ) : null}

        {step === 'ruleset' ? (
          <>
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
                      {/* A visual anchor only — the counts that matter are in
                          the summary line the view model composed. */}
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-tile bg-panel2 text-lg">
                        <Suit index={index} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2 text-base font-semibold">
                          {choice.name}
                          {choice.overrideCount > 0 ? (
                            <Badge tone="accent">
                              {choice.overrideCount === 1
                                ? '1 huisregel'
                                : `${choice.overrideCount} huisregels`}
                            </Badge>
                          ) : null}
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
          </>
        ) : null}

        {step === 'players' && setup ? (
          <div className="flex flex-col gap-3">
            {setup.hasTeams ? (
              setup.defaultTeamNames.map((fallback, teamIndex) => (
                <Block key={fallback} className="px-4 py-1.5">
                  <SectionLabel className="flex items-center gap-2 py-2.5">
                    <Suit index={teamIndex} className="text-sm" />
                    {fallback}
                  </SectionLabel>

                  {(seats[teamIndex] ?? []).map((seat) => {
                    const slot = setup.playerSlots[seat];
                    if (!slot) return null;
                    return (
                      <div
                        key={slot.seat}
                        className="flex items-center gap-3 border-t border-border py-2.5"
                      >
                        <label
                          htmlFor={`speler-${slot.seat}`}
                          className="w-16 shrink-0 text-note text-muted"
                        >
                          {slot.label}
                        </label>
                        <input
                          id={`speler-${slot.seat}`}
                          type="text"
                          className={TEXT_INPUT}
                          placeholder={slot.placeholder}
                          value={playerNames[slot.seat] ?? ''}
                          onChange={(event) =>
                            setPlayerNames((names) => {
                              const next = [...names];
                              next[slot.seat] = event.target.value;
                              return next;
                            })
                          }
                        />
                      </div>
                    );
                  })}

                  <div className="flex items-center gap-3 border-t border-border py-2.5">
                    <label
                      htmlFor={`team-${teamIndex}`}
                      className="w-16 shrink-0 text-note text-muted"
                    >
                      Naam van {setup.teamNoun.singular} {teamIndex + 1}
                    </label>
                    <input
                      id={`team-${teamIndex}`}
                      type="text"
                      className={TEXT_INPUT}
                      placeholder={fallback}
                      value={teamNames[teamIndex] ?? ''}
                      onChange={(event) =>
                        setTeamNames((names) => {
                          const next = [...names];
                          next[teamIndex] = event.target.value;
                          return next;
                        })
                      }
                    />
                  </div>
                </Block>
              ))
            ) : (
              <Block className="px-4 py-1.5">
                <SectionLabel className="block py-2.5">{setup.teamNoun.plural}</SectionLabel>
                {setup.playerSlots.map((slot) => (
                  <div
                    key={slot.seat}
                    className="flex items-center gap-3 border-t border-border py-2.5"
                  >
                    <label
                      htmlFor={`speler-${slot.seat}`}
                      className="w-16 shrink-0 text-note text-muted"
                    >
                      {slot.label}
                    </label>
                    <input
                      id={`speler-${slot.seat}`}
                      type="text"
                      className={TEXT_INPUT}
                      placeholder={slot.placeholder}
                      value={playerNames[slot.seat] ?? ''}
                      onChange={(event) =>
                        setPlayerNames((names) => {
                          const next = [...names];
                          next[slot.seat] = event.target.value;
                          return next;
                        })
                      }
                    />
                  </div>
                ))}
              </Block>
            )}

            <p className="px-2 text-center text-caption leading-snug text-muted text-pretty">
              {setup.hasTeams
                ? 'Partners zitten tegenover elkaar. Lege namen worden "Speler n".'
                : `Deze variant speel je met ${setup.playerSlots.length} ${setup.teamNoun.plural}, zonder teams.`}
            </p>
          </div>
        ) : null}

        {step === 'rules' && setup ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 rounded-btn bg-accent-soft px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-body font-semibold">{setup.ruleSetName}</p>
                <p className="truncate text-caption text-muted">{setup.summaryLine}</p>
              </div>
              <span className="shrink-0 text-caption font-semibold text-accent">Standaard</span>
            </div>

            {setup.editableSections.map((section) => (
              <Block key={section.category} className="px-4 py-1.5">
                <SectionLabel className="block pb-1 pt-2.5">{section.title}</SectionLabel>
                {section.values
                  .filter((value) => value.type === 'number' || value.type === 'boolean')
                  .map((value) => (
                    <div
                      key={value.key}
                      className="flex min-h-touch items-center justify-between gap-3 border-t border-border py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <label
                          htmlFor={`regel-${value.key}`}
                          className="text-body font-medium"
                        >
                          {value.label}
                        </label>
                        {value.help ? (
                          <p className="mt-0.5 text-caption leading-snug text-muted text-pretty">
                            {value.help}
                          </p>
                        ) : null}
                      </div>

                      {value.type === 'boolean' ? (
                        <Switch
                          id={`regel-${value.key}`}
                          checked={
                            typeof overrides[value.key] === 'boolean'
                              ? (overrides[value.key] as boolean)
                              : value.valueText === 'Aan'
                          }
                          onChange={(checked) =>
                            setOverrides((current) => ({ ...current, [value.key]: checked }))
                          }
                        />
                      ) : (
                        <div className="flex min-h-12 w-24 shrink-0 items-center rounded-control border border-border bg-panel2 px-3.5 transition-colors focus-within:border-accent focus-within:bg-panel">
                          <input
                            id={`regel-${value.key}`}
                            type="number"
                            inputMode="numeric"
                            className="w-full min-w-0 bg-transparent text-right font-display text-xl font-semibold tabular outline-none"
                            defaultValue={value.valueText.replace(/\./g, '')}
                            onChange={(event) =>
                              setOverrides((current) => ({
                                ...current,
                                [value.key]: event.target.valueAsNumber,
                              }))
                            }
                          />
                        </div>
                      )}
                    </div>
                  ))}
              </Block>
            ))}
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
              <Button variant="primary" size="lg" block onClick={() => setStep('rules')}>
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
