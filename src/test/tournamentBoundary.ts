/**
 * The two boundaries a linter cannot express, as plain predicates.
 *
 * Kept out of the test file itself because the patterns contain word
 * boundaries, and a regular expression literal is easy to mangle when the file
 * is edited by a tool rather than by hand.
 */

const SCORING_CALLS = [
  String.raw`\bevaluateRound\b`,
  String.raw`\bcalculateRoundScore\b`,
  String.raw`\bscoreEngine\b`,
].map((pattern) => new RegExp(pattern));

/** Whether a source file calls into the scoring of a single hand. */
export function scoresAHand(source: string): boolean {
  return SCORING_CALLS.some((pattern) => pattern.test(source));
}

/** Whether a source file knows anything about tournaments. */
export function knowsTournaments(source: string): boolean {
  return /tournament/i.test(source);
}
