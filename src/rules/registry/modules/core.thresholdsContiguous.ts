import { validateThresholds } from '@/rules/initialMeld/thresholds';
import type { RuleModule } from '../ruleModule';

/**
 * Structural check on the initial-meld staircase. A module rather than an
 * expression because "sorted, non-overlapping, covers −∞..+∞" is not something
 * the expression AST can say about an array.
 */
export const thresholdsContiguous: RuleModule = {
  id: 'core.thresholdsContiguous',
  version: 1,
  description: 'Controleert dat de openingsmeldingsstaffel gesorteerd en sluitend is.',
  validateConfiguration(_ruleSet, configuration) {
    return validateThresholds(configuration.initialMeld.thresholds);
  },
};
