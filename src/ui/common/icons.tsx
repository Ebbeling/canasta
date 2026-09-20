import type { SVGProps } from 'react';

/**
 * The icon set, traced from the design.
 *
 * All of them are stroke icons on `currentColor`, so colour comes from the
 * surrounding text colour and never needs its own token. They are decorative by
 * default (`aria-hidden`): every control that uses one also carries a text
 * label or an `aria-label`, so an icon is never the only thing announced.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function ChevronLeft(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12.5 4 7 10l5.5 6" />
    </Icon>
  );
}

export function ChevronRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7.5 4 13 10l-5.5 6" />
    </Icon>
  );
}

export function ChevronDown(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 8 5 5 5-5" />
    </Icon>
  );
}

export function Close(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 5l10 10M15 5 5 15" />
    </Icon>
  );
}

export function Plus(props: IconProps) {
  return (
    <Icon strokeWidth={2.2} {...props}>
      <path d="M10 4v12M4 10h12" />
    </Icon>
  );
}

export function Minus(props: IconProps) {
  return (
    <Icon strokeWidth={2.2} {...props}>
      <path d="M4 10h12" />
    </Icon>
  );
}

export function Check(props: IconProps) {
  return (
    <Icon strokeWidth={2.4} {...props}>
      <path d="m4 10.5 4 4L16 6" />
    </Icon>
  );
}

export function More(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="4" r="1.2" fill="currentColor" />
      <circle cx="10" cy="10" r="1.2" fill="currentColor" />
      <circle cx="10" cy="16" r="1.2" fill="currentColor" />
    </Icon>
  );
}

export function Pencil(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13 3.5 16.5 7 8 15.5H4.5V12z" />
    </Icon>
  );
}

export function Keypad(props: IconProps) {
  return (
    <Icon strokeWidth={1.8} {...props}>
      <rect x="3" y="4" width="14" height="12" rx="2.5" />
      <path d="M6.5 8h1M9.5 8h1M12.5 8h1M6.5 11h1M9.5 11h1M12.5 11h1M7 14h6" />
    </Icon>
  );
}

export function Backspace({ size = 24, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z" />
      <path d="m13 10 4 4M17 10l-4 4" />
    </svg>
  );
}

export function Trash({ size = 24, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}

export function ExternalLink(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 4h8v8M16 4 5 15" />
    </Icon>
  );
}

export function Sliders(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 6h14M3 14h14" />
      <circle cx="8" cy="6" r="2" className="fill-panel" />
      <circle cx="13" cy="14" r="2" className="fill-panel" />
    </Icon>
  );
}

/* The three in-game destinations. Drawn at 22 to match the design's bottom bar. */

export function BoardIcon({ size = 22, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <rect x="3" y="4" width="16" height="14" rx="3" />
      <path d="M3 9h16M11 9v9" />
    </svg>
  );
}

export function ClockIcon({ size = 22, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <circle cx="11" cy="11" r="8" />
      <path d="M11 6.5V11l3 2" />
    </svg>
  );
}

export function BookIcon({ size = 22, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H18v14H6.5A2.5 2.5 0 0 0 4 19.5z" />
      <path d="M4 16.5A2.5 2.5 0 0 1 6.5 14H18" />
    </svg>
  );
}

/** A trophy, for the tournaments destination. */
export function TrophyIcon({ size = 22, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d="M6 3h10v5a5 5 0 0 1-10 0z" />
      <path d="M6 5H3.5v1.5A3.5 3.5 0 0 0 6.5 10M16 5h2.5v1.5a3.5 3.5 0 0 1-3 3.5" />
      <path d="M11 13v3M8 19h6" />
    </svg>
  );
}

/** Four people around a table — one match in a tournament. */
export function TableIcon({ size = 22, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <circle cx="11" cy="11" r="4" />
      <path d="M11 2v2M11 18v2M2 11h2M18 11h2" />
    </svg>
  );
}

/** A list of people, for the participants destination. */
export function PeopleIcon({ size = 22, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <circle cx="8" cy="7" r="3" />
      <path d="M3 18a5 5 0 0 1 10 0" />
      <path d="M15 5.5a3 3 0 0 1 0 5.8M16 18a5 5 0 0 0-2-4" />
    </svg>
  );
}

/** A podium, for the standings destination. */
export function StandingsIcon({ size = 22, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d="M3 19h16" />
      <rect x="4" y="11" width="4.5" height="8" rx="1" />
      <rect x="8.5" y="6" width="4.5" height="13" rx="1" />
      <rect x="13" y="14" width="4.5" height="5" rx="1" />
    </svg>
  );
}
