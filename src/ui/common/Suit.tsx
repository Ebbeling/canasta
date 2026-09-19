import { suitFor, suitToneFor } from './suits';

/**
 * A team's suit glyph.
 *
 * Decorative, so it is hidden from assistive technology — the team's name is
 * always right beside it and carries the meaning.
 */
export function Suit({ index, className = '' }: { index: number; className?: string }) {
  return (
    <span aria-hidden="true" className={`${suitToneFor(index)} ${className}`}>
      {suitFor(index)}
    </span>
  );
}
