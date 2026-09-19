import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A grep over the UI layer.
 *
 * ESLint already forbids the *imports* that would let React reach the engine.
 * This catches the other half: Canasta knowledge copied into a component by
 * hand — a threshold, a bonus value, a field id the UI should not recognise.
 */

const UI_DIRECTORIES = ['src/ui', 'src/routes'];

function sourceFiles(directory: string): string[] {
  const entries: string[] = [];

  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      entries.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(name) && !name.endsWith('.test.tsx') && !name.endsWith('.test.ts')) {
      entries.push(path);
    }
  }

  return entries;
}

const files = UI_DIRECTORIES.flatMap(sourceFiles);

/** Canasta concepts the UI must never name, and engine calls it must not make. */
const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /naturalCanasta/i, why: 'canasta scoring belongs in the rule set' },
  { pattern: /mixedCanasta/i, why: 'canasta scoring belongs in the rule set' },
  { pattern: /redThree/i, why: 'the red-three rule belongs in the rule set' },
  { pattern: /blackThree/i, why: 'the black-three rule belongs in the rule set' },
  { pattern: /initialMeld/i, why: 'the meld threshold belongs in the engine' },
  { pattern: /\bevaluateRound\b/, why: 'the UI must go through a view model' },
  { pattern: /\brecomputeGame\b/, why: 'the UI must go through a view model' },
  { pattern: /\bcalculateRoundScore\b/, why: 'the UI must go through a view model' },
  { pattern: /\bvalidateRound\b/, why: 'the UI must go through a view model' },
  {
    pattern: /\bisCanonicalField\b/,
    why: 'the canonical/extra split belongs to the field access layer',
  },
  { pattern: /\.configuration\b/, why: 'the UI must not read a rule set configuration directly' },
  { pattern: /\.family\b/, why: 'never branch on the variant' },
];

describe('the UI layer contains no Canasta rules', () => {
  it('has files to check', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(FORBIDDEN)('never mentions $pattern ($why)', ({ pattern }) => {
    const offenders = files.filter((file) => pattern.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('never hard-codes a score from any built-in rule set', () => {
    // Only distinctive values. 500 and 300 are excluded deliberately: they are
    // also millisecond delays and pixel sizes, so matching them would flag
    // honest code and train people to ignore this test.
    const scoreLiteral = /(?<![\w.-])(5000|8500|2500|1485|1000)(?![\w.%-])/;

    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return (
        source
          .split('\n')
          .filter((line) => !line.trimStart().startsWith('//'))
          // Tailwind class names legitimately carry numbers like `w-500`.
          .filter((line) => !/className|class=/.test(line))
          .some((line) => scoreLiteral.test(line))
      );
    });

    expect(offenders).toEqual([]);
  });
});
