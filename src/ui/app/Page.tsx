import type { ReactNode } from 'react';

/**
 * How a screen divides the space it is given.
 *
 * The design does not put one width on everything. Beside the rail, `main` is
 * as wide as the window allows, and two kinds of thing live in it:
 *
 *   - a **bar**, which spans that whole width — the panel over a round, the
 *     wizard's action bar. It is what makes a wide window read as a desktop
 *     application rather than a centred phone;
 *   - a **body**, a column of 880px (reading) or 960px (working) centred in
 *     that width, because a line of text or a row of fields that runs the
 *     length of a 2560px screen is not easier to use, only wider.
 *
 * Both are declared per screen. A screen says which it wants; nothing is
 * inferred from a marker attribute on some element further down.
 */

const WIDTHS = {
  /** 880px — the scoreboard, home, the rulebook, settings. */
  column: 'md:max-w-column',
  /** 960px — entering a round, the history table, the setup wizard. */
  wide: 'md:max-w-wide',
} as const;

export type PageWidth = keyof typeof WIDTHS;

/**
 * The centred content column.
 *
 * The padding is the design's: 48px either side from `md`, 36px above and
 * 40px below. Below `md` it is the phone's own 16/24px and the column is
 * capped at the width the design is drawn in.
 */
export function PageBody({
  children,
  width = 'column',
  className = '',
}: {
  children: ReactNode;
  width?: PageWidth;
  className?: string;
}) {
  return (
    <div className="flex flex-1 justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:px-6 md:px-12 md:pb-10 md:pt-9">
      <div className={`flex w-full max-w-page flex-col ${WIDTHS[width]} ${className}`}>
        {children}
      </div>
    </div>
  );
}

/**
 * A bar across the whole width beside the rail.
 *
 * What it holds is centred on the same column the body uses, so a title on the
 * left of the bar lines up with the content under it however wide the window
 * is. `place` decides which edge carries the hairline.
 */
export function PageBar({
  children,
  width = 'wide',
  place = 'top',
  className = '',
}: {
  children: ReactNode;
  width?: PageWidth;
  place?: 'top' | 'bottom';
  className?: string;
}) {
  const edge = place === 'top' ? 'border-b' : 'border-t';

  return (
    <div
      className={`${edge} border-border bg-panel px-4 sm:px-6 md:px-12 ${className}`}
    >
      <div className={`mx-auto flex w-full max-w-page flex-col ${WIDTHS[width]}`}>{children}</div>
    </div>
  );
}
