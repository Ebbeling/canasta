import type { SourceMetadata } from '@/rules/schema/ruleSet';
import { BUILTIN_RULE_SETS } from '@/rules/builtin';

/**
 * Every source behind the built-in rule sets, de-duplicated (spec §34).
 *
 * Collected from the rule sets themselves rather than listed by hand, so adding
 * a variant cannot leave its source uncredited.
 */
export const BUILTIN_SOURCES: readonly SourceMetadata[] = (() => {
  const seen = new Map<string, SourceMetadata>();

  for (const ruleSet of BUILTIN_RULE_SETS.values()) {
    for (const source of [ruleSet.source, ...(ruleSet.additionalSources ?? [])]) {
      const key = `${source.name}|${source.title ?? ''}`;
      if (!seen.has(key)) seen.set(key, source);
    }
  }

  return [...seen.values()];
})();
