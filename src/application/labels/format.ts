/**
 * Every number and date the user sees goes through here, so formatting is
 * consistent and React never calls `Intl` itself.
 */

const integer = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 });

const signedInteger = new Intl.NumberFormat('nl-NL', {
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
});

const longDate = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const shortDateTime = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** "5.420" */
export function formatPoints(value: number): string {
  return integer.format(value);
}

/** "+1.485" / "−35" — an explicit sign, so a delta is never ambiguous. */
export function formatDelta(value: number): string {
  return signedInteger.format(value).replace('-', '−');
}

/** "19 september 2026" */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : longDate.format(date);
}

/** "19 sep 14:32" */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : shortDateTime.format(date);
}

/** "Aan" / "Uit" — booleans in the rules screen are words, not checkmarks. */
export function formatBoolean(value: boolean): string {
  return value ? 'Aan' : 'Uit';
}

/**
 * A threshold band as a readable range: "0 – 1.495", "minder dan 0",
 * "3.000 of meer".
 */
export function formatRange(min: number | null, max: number | null): string {
  if (min === null && max === null) return 'altijd';
  if (min === null) return `tot en met ${formatPoints(max!)}`;
  if (max === null) return `${formatPoints(min)} of meer`;
  return `${formatPoints(min)} – ${formatPoints(max)}`;
}

/** "3 spelers" / "1 speler" */
export function pluralise(count: number, singular: string, plural: string): string {
  return `${formatPoints(count)} ${count === 1 ? singular : plural}`;
}
