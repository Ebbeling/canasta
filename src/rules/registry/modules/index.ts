import type { RuleModule } from '../ruleModule';
import { thresholdsContiguous } from './core.thresholdsContiguous';
import { atMostOneGoOut } from './core.atMostOneGoOut';

/**
 * Modules are looked up by id, never by variant. v1 needs only these two, both
 * structural rather than arithmetic — everything the sources describe fits the
 * expression AST. The registry exists anyway because the first thing that will
 * not fit (Samba sequences, Hand & Foot) needs the seam to already be there.
 */
export const DEFAULT_RULE_MODULES: readonly RuleModule[] = [thresholdsContiguous, atMostOneGoOut];

export { thresholdsContiguous, atMostOneGoOut };
