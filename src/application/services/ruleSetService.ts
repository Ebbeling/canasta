import { newId, type PresetId, type RuleSetId } from '@/domain/ids';
import type { ValidationIssue } from '@/domain/result';
import type { ConfigOverride, CustomRuleSetRecord, RuleSet } from '@/rules/schema/ruleSet';
import { cloneRuleSet, resolveRuleSet } from '@/rules/resolve/resolveRuleSet';
import type { Repositories } from '@/application/ports';
import {
  buildEffectiveRuleSet,
  meaningfulOverrides,
} from '@/application/ruleSets/effectiveRuleSet';
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
   * Preset management, driven by the rule set editor.
   *
   * Every one of these produces or edits a `CustomRuleSetRecord`; the built-ins
   * are never touched, because they live in code and have no row to write to.
   */
  listPresets(): Promise<CustomRuleSetRecord[]>;
  savePreset(preset: CustomRuleSetRecord): Promise<CustomRuleSetRecord>;
  removePreset(id: PresetId): Promise<void>;
  /** Clones any rule set — built-in or custom — into a new editable preset. */
  createPreset(input: CreatePresetInput): Promise<PresetOutcome>;
  /** Saves a name and a set of overrides, validated through the one pipeline. */
  updatePreset(input: UpdatePresetInput): Promise<PresetOutcome>;
}

export interface CreatePresetInput {
  /** The rule set to base the copy on. */
  sourceId: RuleSetId;
  sourceOrigin: RuleSetOrigin;
  name: string;
  description?: string;
  /** Applied on top of the clone, e.g. a chosen party shape. */
  overrides?: readonly ConfigOverride[];
}

export interface UpdatePresetInput {
  id: PresetId;
  name?: string;
  description?: string;
  overrides: readonly ConfigOverride[];
}

export type PresetOutcome =
  | { ok: true; preset: CustomRuleSetRecord; resolved: RuleSet }
  | { ok: false; reason: 'unknownRuleSet' }
  | { ok: false; reason: 'validation'; issues: ValidationIssue[] };

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

    /**
     * Copy, then edit. A built-in is never the thing being changed: cloning
     * takes a frozen snapshot of it, and everything after that edits the copy.
     */
    async createPreset(input) {
      const source = await resolve(input.sourceId, input.sourceOrigin);
      if (!source) return { ok: false, reason: 'unknownRuleSet' };

      const record = cloneRuleSet(source, {
        id: newId(),
        name: input.name.trim() || `Kopie van ${source.name}`,
        description: input.description?.trim() || undefined,
      });

      return commit({ ...record, overrides: [...(input.overrides ?? [])] });
    },

    async updatePreset(input) {
      const existing = await repositories.presets.get(input.id);
      if (!existing) return { ok: false, reason: 'unknownRuleSet' };

      return commit({
        ...existing,
        name: input.name?.trim() || existing.name,
        description: input.description?.trim() || existing.description,
        overrides: [...input.overrides],
        // A stored preset carries its own version so a game can record which
        // revision of it was used; bumping on every save keeps that honest.
        version: existing.version + 1,
        updatedAt: new Date().toISOString(),
      });
    },
  };

  /**
   * Validates a candidate preset and stores it.
   *
   * The overrides go through the same `buildEffectiveRuleSet` the game setup
   * uses, so a preset can never be saved in a state that would fail when a game
   * is finally started from it. Nothing is written when validation fails.
   */
  async function commit(record: CustomRuleSetRecord): Promise<PresetOutcome> {
    const effective = buildEffectiveRuleSet(
      record.derivedFrom.snapshot,
      meaningfulOverrides(record.derivedFrom.snapshot, record.overrides),
    );
    if (!effective.ok) return { ok: false, reason: 'validation', issues: effective.issues };

    const trimmed: CustomRuleSetRecord = {
      ...record,
      overrides: meaningfulOverrides(record.derivedFrom.snapshot, record.overrides),
    };

    const existing = await repositories.presets.get(trimmed.id);
    const stored = existing
      ? await repositories.presets.update(trimmed)
      : await repositories.presets.create(trimmed);

    return { ok: true, preset: stored, resolved: resolveRuleSet(stored) };
  }
}
