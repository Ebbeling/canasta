import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { ConfigOverride } from '@/rules/schema/ruleSet';
import type { RuleSetChoice } from '@/application/services/ruleSetService';
import { buildGameSetup, defaultTeamSeats, type GameSetupVM } from '@/application/viewmodels/setup';
import { useServices } from '@/app/servicesContext';
import { useRuleSetChoices } from '@/hooks/useGameData';
import { useCommand } from '@/hooks/useCommand';
import { useLiveResult } from '@/hooks/useLiveResult';
import { Button, Card, ErrorPanel, LoadingState, Muted, PageTitle } from '@/ui/common/primitives';

type Step = 'ruleset' | 'players' | 'rules';

const STEP_TITLES: Record<Step, string> = {
  ruleset: 'Kies een spelvariant',
  players: 'Spelers en teams',
  rules: 'Spelregels',
};

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

  return (
    <div className="space-y-4">
      <PageTitle>Nieuwe partij</PageTitle>
      <Muted>{STEP_TITLES[step]}</Muted>

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
            <ul className="space-y-2">
              {choices.data.map((choice) => (
                <li key={`${choice.origin}:${choice.id}`}>
                  <button
                    type="button"
                    className="w-full rounded-2xl border border-[--color-border] bg-[--color-panel] p-4 text-left hover:bg-[--color-panel-muted]"
                    onClick={() => pick(choice)}
                  >
                    <p className="font-medium">
                      {choice.name}
                      {choice.overrideCount > 0 ? (
                        <span className="ml-2 text-xs text-[--color-ink-muted]">
                          · {choice.overrideCount} huisregels
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-sm text-[--color-ink-muted]">{choice.summaryLine}</p>
                    <p className="mt-1 text-sm">{choice.description}</p>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      {step === 'players' && setup ? (
        <Card>
          <div className="space-y-3">
            {setup.playerSlots.map((slot, index) => (
              <div key={slot.seat} className="flex flex-col gap-1">
                <label htmlFor={`speler-${slot.seat}`} className="text-sm font-medium">
                  {slot.label}
                </label>
                <input
                  id={`speler-${slot.seat}`}
                  type="text"
                  className="min-h-[var(--spacing-touch)] rounded-xl border border-[--color-border] bg-[--color-panel] px-3"
                  placeholder={slot.placeholder}
                  value={playerNames[index] ?? ''}
                  onChange={(event) =>
                    setPlayerNames((names) => {
                      const next = [...names];
                      next[index] = event.target.value;
                      return next;
                    })
                  }
                />
              </div>
            ))}
          </div>

          {setup.hasTeams ? (
            <div className="mt-5 space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[--color-ink-muted]">
                {setup.teamNoun.plural}
              </h2>
              {setup.defaultTeamNames.map((fallback, index) => (
                <div key={fallback} className="flex flex-col gap-1">
                  <label htmlFor={`team-${index}`} className="text-sm font-medium">
                    Naam van {setup.teamNoun.singular} {index + 1}
                  </label>
                  <input
                    id={`team-${index}`}
                    type="text"
                    className="min-h-[var(--spacing-touch)] rounded-xl border border-[--color-border] bg-[--color-panel] px-3"
                    placeholder={fallback}
                    value={teamNames[index] ?? ''}
                    onChange={(event) =>
                      setTeamNames((names) => {
                        const next = [...names];
                        next[index] = event.target.value;
                        return next;
                      })
                    }
                  />
                </div>
              ))}
            </div>
          ) : (
            <Muted>
              Deze variant speel je met {setup.playerSlots.length} {setup.teamNoun.plural}, zonder
              teams.
            </Muted>
          )}

          <div className="mt-5 flex gap-2">
            <Button onClick={() => setStep('ruleset')}>Terug</Button>
            <Button variant="primary" onClick={() => setStep('rules')}>
              Verder
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 'rules' && setup ? (
        <>
          <Card>
            <p className="font-medium">{setup.ruleSetName}</p>
            <Muted>{setup.summaryLine}</Muted>
          </Card>

          {setup.editableSections.map((section) => (
            <Card key={section.category}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[--color-ink-muted]">
                {section.title}
              </h2>
              <div className="space-y-3">
                {section.values
                  .filter((value) => value.type === 'number' || value.type === 'boolean')
                  .map((value) => (
                    <div key={value.key} className="flex flex-col gap-1">
                      <label htmlFor={`regel-${value.key}`} className="text-sm font-medium">
                        {value.label}
                      </label>
                      {value.help ? (
                        <p className="text-xs text-[--color-ink-muted]">{value.help}</p>
                      ) : null}
                      {value.type === 'boolean' ? (
                        <input
                          id={`regel-${value.key}`}
                          type="checkbox"
                          role="switch"
                          className="h-6 w-11 accent-[--color-accent]"
                          checked={
                            typeof overrides[value.key] === 'boolean'
                              ? (overrides[value.key] as boolean)
                              : value.valueText === 'Aan'
                          }
                          onChange={(event) =>
                            setOverrides((current) => ({
                              ...current,
                              [value.key]: event.target.checked,
                            }))
                          }
                        />
                      ) : (
                        <input
                          id={`regel-${value.key}`}
                          type="number"
                          inputMode="numeric"
                          className="min-h-[var(--spacing-touch)] rounded-xl border border-[--color-border] bg-[--color-panel] px-3 text-right tabular"
                          defaultValue={value.valueText.replace(/\./g, '')}
                          onChange={(event) =>
                            setOverrides((current) => ({
                              ...current,
                              [value.key]: event.target.valueAsNumber,
                            }))
                          }
                        />
                      )}
                    </div>
                  ))}
              </div>
            </Card>
          ))}

          <div className="flex gap-2">
            <Button onClick={() => setStep('players')}>Terug</Button>
            <Button
              variant="primary"
              disabled={create.state === 'running'}
              onClick={() => void start()}
            >
              Partij starten
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
