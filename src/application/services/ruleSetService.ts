import type { PresetId, RuleSetId } from '@/domain/ids';
import type { ConfigOverride, CustomRuleSetRecord, RuleSet } from '@/rules/schema/ruleSet';
import { resolveRuleSet } from '@/rules/resolve/resolveRuleSet';
import type { Repositories } from '@/application/ports';
import { describeRuleSet, type RuleSetDescription } from '@/application/viewmodels/rulesView';

export type RuleSetOrigin = 'builtin' | 'custom';

/** Just enough to pick one in the wizard (spec §5). */
export interface RuleSetChoice {
  id: RuleSetId;
  origin: RuleSetOrigin;
  name: string;
  description: string;
  /** "4 spelers · 2 teams · 11 kaarten per speler · …" — composed in the view model. */
  summaryLine: string;
  locked: boolean;
  overrideCount: number;
}

/** The lookup the game service needs, kept separate so it is easy to fake. */
export interface RuleSetResolver {
  resolve(id: RuleSetId, origin: RuleSetOrigin): Promise<RuleSet | undefined>;
}

export interface RuleSetService extends RuleSetResolver {
  listAvailable(): Promise<RuleSetChoice[]>;
  describe(
    id: RuleSetId,
    origin: RuleSetOrigin,
    overrides?: readonly ConfigOverride[],
  ): Promise<RuleSetDescription | undefined>;
  /**
   * Preset management. Not surfaced in the UI yet — this is the seam the later
   * house-rules editor plugs into, using the same pipeline as game setup.
   */
  listPresets(): Promise<CustomRuleSetRecord[]>;
  savePreset(preset: CustomRuleSetRecord): Promise<CustomRuleSetRecord>;
  removePreset(id: PresetId): Promise<void>;
}

export interface RuleSetServiceDeps {
  repositories: Repositories;
  /** Built-ins live in code, never in the presets table (spec §12). */
  builtins: ReadonlyMap<RuleSetId, RuleSet>;
}

export function createRuleSetService(deps: RuleSetServiceDeps): RuleSetService {
  const { repositories, builtins } = deps;

  async function resolve(id: RuleSetId, origin: RuleSetOrigin): Promise<RuleSet | undefined> {
    if (origin === 'builtin') return builtins.get(id);
    const record = await repositories.presets.get(id);
    return record ? resolveRuleSet(record) : undefined;
  }

  return {
    resolve,

    async listAvailable() {
      const choices: RuleSetChoice[] = [...builtins.values()].map((ruleSet) => ({
        id: ruleSet.id,
        origin: 'builtin',
        name: ruleSet.name,
        description: ruleSet.description,
        summaryLine: describeRuleSet(ruleSet).summaryLine,
        locked: true,
        overrideCount: 0,
      }));

      for (const record of await repositories.presets.list()) {
        const resolved = resolveRuleSet(record);
        choices.push({
          id: record.id,
          origin: 'custom',
          name: record.name,
          description: record.description,
          summaryLine: describeRuleSet(resolved).summaryLine,
          locked: false,
          overrideCount: record.overrides.length,
        });
      }

      return choices;
    },

    async describe(id, origin, overrides) {
      const ruleSet = await resolve(id, origin);
      if (!ruleSet) return undefined;
      return describeRuleSet(ruleSet, { overrides });
    },

    listPresets() {
      return repositories.presets.list();
    },

    async savePreset(preset) {
      const existing = await repositories.presets.get(preset.id);
      return existing ? repositories.presets.update(preset) : repositories.presets.create(preset);
    },

    removePreset(id) {
      return repositories.presets.delete(id);
    },
  };
}
