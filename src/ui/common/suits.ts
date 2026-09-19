/**
 * The card suit that stands in for a team.
 *
 * Purely an identity marker: it lets the eye match a score to a team across the
 * scoreboard, the history table and the round form without reading the name
 * every time. Teams are ordered, so the glyph follows that order and is never
 * stored on the team itself.
 */

const SUITS = ['♠', '♥', '♣', '♦'] as const;

/** Hearts and diamonds are red; spades and clubs take the ink colour. */
const TONES = ['text-ink', 'text-heart', 'text-ink', 'text-heart'] as const;

export function suitFor(index: number): string {
  return SUITS[index % SUITS.length]!;
}

export function suitToneFor(index: number): string {
  return TONES[index % TONES.length]!;
}
