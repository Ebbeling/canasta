import type { RuleModuleId } from '@/domain/ids';
import { UnknownRuleModuleError } from '@/domain/result';
import type { RuleModule, RuleModuleRegistry } from './ruleModule';

export function createRuleModuleRegistry(modules: readonly RuleModule[] = []): RuleModuleRegistry {
  const byId = new Map<RuleModuleId, RuleModule>();

  const registry: RuleModuleRegistry = {
    register(module) {
      byId.set(module.id, module);
    },
    get(id) {
      const module = byId.get(id);
      if (!module) throw new UnknownRuleModuleError(id);
      return module;
    },
    has(id) {
      return byId.has(id);
    },
    list() {
      return [...byId.values()];
    },
  };

  for (const module of modules) registry.register(module);
  return registry;
}
