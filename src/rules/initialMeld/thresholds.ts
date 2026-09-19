import type { ValidationIssue } from '@/domain/result';
import type { InitialMeldThreshold, RuleSetConfiguration } from '@/rules/schema/configuration';

export interface InitialMeldRequirement {
  required: number;
  thresholdIndex: number;
}

/**
 * The initial-meld minimum for a team with the given cumulative score.
 *
 * Bounds are inclusive; `null` means unbounded. Returns null when the rule set
 * has no initial-meld requirement at all.
 *
 * The scan matches on the upper bound only, which makes it tolerant of the gaps
 * the sources actually contain: Pagat's Classic bands run 0–1495 and then
 * 1500–2995, leaving 1496–1499 undefined. Those scores are unreachable because
 * every Canasta score is a multiple of 5, but a lookup must not return null if
 * one ever occurs — it resolves into the next band instead.
 */
export function initialMeldRequirement(
  config: RuleSetConfiguration,
  scoreBefore: number,
): InitialMeldRequirement | null {
  if (!config.initialMeld.enabled) return null;

  const thresholds = config.initialMeld.thresholds;
  for (let index = 0; index < thresholds.length; index += 1) {
    const band = thresholds[index]!;
    if (band.maxScore === null || scoreBefore <= band.maxScore) {
      return { required: band.required, thresholdIndex: index };
    }
  }
  return null;
}

/**
 * Checks that the staircase is sorted, gapless, non-overlapping and covers
 * −∞..+∞. A gap here would silently return null at the card table.
 */
export function validateThresholds(thresholds: readonly InitialMeldThreshold[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const path = 'initialMeld.thresholds';

  if (thresholds.length === 0) {
    issues.push({
      code: 'thresholds.empty',
      severity: 'error',
      message: 'De openingsmeldingsstaffel is leeg.',
      paths: [path],
    });
    return issues;
  }

  const first = thresholds[0]!;
  if (first.minScore !== null) {
    issues.push({
      code: 'thresholds.openStart',
      severity: 'error',
      message: 'De eerste drempel moet onbegrensd naar beneden zijn (minScore: null).',
      paths: [path],
    });
  }

  const last = thresholds[thresholds.length - 1]!;
  if (last.maxScore !== null) {
    issues.push({
      code: 'thresholds.openEnd',
      severity: 'error',
      message: 'De laatste drempel moet onbegrensd naar boven zijn (maxScore: null).',
      paths: [path],
    });
  }

  for (let index = 0; index < thresholds.length; index += 1) {
    const band = thresholds[index]!;

    if (band.minScore !== null && band.maxScore !== null && band.minScore > band.maxScore) {
      issues.push({
        code: 'thresholds.inverted',
        severity: 'error',
        message: `Drempel ${index + 1} heeft een ondergrens die boven de bovengrens ligt.`,
        paths: [path],
      });
    }

    if (index === 0) continue;

    const previous = thresholds[index - 1]!;
    if (previous.maxScore === null) {
      issues.push({
        code: 'thresholds.unreachable',
        severity: 'error',
        message: `Drempel ${index + 1} is onbereikbaar: de vorige drempel is naar boven onbegrensd.`,
        paths: [path],
      });
      continue;
    }
    if (band.minScore === null) {
      issues.push({
        code: 'thresholds.overlap',
        severity: 'error',
        message: `Drempel ${index + 1} overlapt met de vorige drempel.`,
        paths: [path],
      });
      continue;
    }
    if (band.minScore <= previous.maxScore) {
      issues.push({
        code: 'thresholds.overlap',
        severity: 'error',
        message: `Drempel ${index + 1} overlapt met de vorige drempel.`,
        paths: [path],
      });
    } else if (band.minScore > previous.maxScore + 1) {
      // Pagat's Classic bands genuinely leave 1496–1499 open. Unreachable in
      // practice, so a warning rather than an error — the lookup resolves it
      // into the next band.
      issues.push({
        code: 'thresholds.gap',
        severity: 'warning',
        message: `Tussen drempel ${index} en ${index + 1} zit een gat (${previous.maxScore + 1}–${band.minScore - 1}).`,
        paths: [path],
      });
    }
  }

  return issues;
}
