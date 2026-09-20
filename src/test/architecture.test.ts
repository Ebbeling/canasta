import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { knowsTournaments, scoresAHand } from './tournamentBoundary';

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

/** The pure layers, which must stay free of the framework and of storage. */
const PURE_DIRECTORIES = ['src/domain', 'src/rules', 'src/scoring', 'src/tournament'];

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

/**
 * The pairing engine and the standings projection are pure, the same way the
 * score engine is. ESLint enforces the imports; this states the intent in a
 * form that survives a config change, and adds the two rules a linter cannot
 * express: no tournament knowledge in the score engine, and no scoring in the
 * tournament layer.
 */
describe('the tournament layer is pure', () => {
  const pure = PURE_DIRECTORIES.flatMap(sourceFiles);

  it.each([
    ['react', /from '(react|react-[^']*)'/],
    ['dexie', /from 'dexie/],
    ['storage', new RegExp(String.raw`from '@/storage`)],
    ['the UI', new RegExp(String.raw`from '@/(ui|routes|hooks|app)/`)],
    ['the application layer', new RegExp(String.raw`from '@/application/`)],
  ])('never imports %s', (_name, pattern) => {
    const offenders = pure.filter((file) => pattern.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('keeps the score engine free of tournaments', () => {
    const offenders = sourceFiles('src/scoring').filter((file) =>
      knowsTournaments(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('keeps the tournament layer out of the scoring of a hand', () => {
    const offenders = sourceFiles('src/tournament').filter((file) =>
      scoresAHand(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});

/**
 * The boundaries the tournament server has to keep.
 *
 * The whole claim of the multi-device feature is that the tournament rules are
 * written once and run in two processes. That only stays true if the server is
 * a *host* for the application layer rather than a second implementation of it,
 * and if the pure layers never learn that a server exists. ESLint enforces the
 * imports; these say why, and add the parts a linter cannot see.
 */
describe('the tournament server is a host, not a second brain', () => {
  const serverFiles = sourceFiles('server/src').filter((file) => !file.includes('test'));
  const transport = serverFiles.filter(
    (file) => file.includes(`${sep}http${sep}`) || file.endsWith(`${sep}network.ts`),
  );

  it('has files to check', () => {
    expect(serverFiles.length).toBeGreaterThan(8);
    expect(transport.length).toBeGreaterThan(2);
  });

  it.each([
    ['react', /from '(react|react-[^']*)'/],
    ['dexie', /from 'dexie/],
    ['the browser storage layer', new RegExp(String.raw`from '@/storage`)],
    ['the UI', new RegExp(String.raw`from '@/(ui|routes|hooks|app)/`)],
  ])('never imports %s', (_name, pattern) => {
    const offenders = serverFiles.filter((file) => pattern.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('keeps tournament rules out of the transport layer', () => {
    const forbidden = [
      new RegExp(String.raw`from '@/tournament/`),
      new RegExp(String.raw`from '@/scoring/`),
      new RegExp(String.raw`from '@/rules/builtin`),
      /\bproposePairing\b/,
      /\bbuildStandings\b/,
      /\brecomputeGame\b/,
    ];

    for (const pattern of forbidden) {
      const offenders = transport.filter((file) => pattern.test(readFileSync(file, 'utf8')));
      expect({ pattern: pattern.source, offenders }).toEqual({
        pattern: pattern.source,
        offenders: [],
      });
    }
  });

  it('never scores a hand anywhere in the server', () => {
    const offenders = serverFiles.filter((file) => scoresAHand(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('keeps SQLite out of everything but the server storage layer', () => {
    const everywhereElse = [
      ...sourceFiles('src'),
      ...serverFiles.filter((file) => !file.includes(`${sep}storage${sep}`)),
    ].filter((file) => !file.includes('.test.'));

    const offenders = everywhereElse.filter((file) =>
      /node:sqlite|better-sqlite3/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});

/**
 * The network adapter is an adapter.
 *
 * It may know the contract and the domain's types; it may not know a screen, a
 * database or a rule. Without this, "the client talks to the server" quietly
 * becomes "the client decides things about tournaments".
 */
describe('the network layer stays an adapter', () => {
  const net = sourceFiles('src/net').filter((file) => !file.includes('.test.'));

  it('has files to check', () => {
    expect(net.length).toBeGreaterThan(3);
  });

  it.each([
    ['react', /from '(react|react-[^']*)'/],
    ['dexie', /from 'dexie/],
    ['storage', new RegExp(String.raw`from '@/storage`)],
    ['the UI', new RegExp(String.raw`from '@/(ui|routes|hooks|app)/`)],
    ['the scoring engine', new RegExp(String.raw`from '@/scoring/`)],
  ])('never imports %s', (_name, pattern) => {
    const offenders = net.filter((file) => pattern.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

/**
 * A table device is not an organiser.
 *
 * The server refuses out-of-scope requests — that is where the guarantee lives,
 * and it has its own tests. This is the second line: the table screens must not
 * even offer the organiser's verbs, because a button that always fails is worse
 * than no button.
 */
describe('the table screens offer nothing an organiser does', () => {
  const tableFiles = [
    ...sourceFiles('src/ui/table'),
    'src/routes/TableRoute.tsx',
    'src/routes/TableRoundRoute.tsx',
    'src/routes/TableShell.tsx',
  ];

  it.each([
    ['confirmRound', /confirmRound/],
    ['completeRound', /completeRound/],
    ['finish', /\.finish\(/],
    ['endDay', /endDay/],
    ['withdraw', /withdraw/],
    ['the pairing', /propose|pairing/i],
    ['the tournament service', new RegExp(String.raw`services\.tournaments`)],
  ])('never mentions %s', (_name, pattern) => {
    const offenders = tableFiles.filter((file) => pattern.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

/**
 * Outward-facing links are built in one place.
 *
 * The first version of the multi-device feature built a table's join link from
 * the `Host` header of the request that asked for it — so the organiser, who
 * browses to `localhost`, was handed QR codes pointing at `localhost`. The cure
 * is structural: the server owns the origin, and nothing downstream is allowed
 * to have a second opinion about it.
 */
describe('nothing downstream invents a server address', () => {
  const drawsQr = ['src/ui/tournament/QrCode.tsx'];
  const tableScreens = [
    ...sourceFiles('src/ui/table'),
    'src/routes/TournamentTablesRoute.tsx',
    'src/routes/TableRoute.tsx',
    'src/routes/TableRoundRoute.tsx',
  ];

  it.each([
    ['the browser address', /window\.location|location\.(origin|hostname|host|port)/],
    ['a hardcoded host', /localhost|127\.0\.0\.1/],
    ['a scheme of its own', /['"`]https?:\/\//],
  ])('the QR component never mentions %s', (_name, pattern) => {
    const offenders = drawsQr.filter((file) => pattern.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('no screen glues an origin onto a table path', () => {
    // In-app navigation to `/table/:token` is fine — those are router paths
    // with no host in them. What must never appear is a *whole* URL built
    // outside the server: that is the bug coming back.
    const offenders = tableScreens.filter((file) =>
      /:\/\/[^'"\n]*\/table\//.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('reads the join URL from the server rather than composing one', () => {
    const source = readFileSync('src/routes/TournamentTablesRoute.tsx', 'utf8');

    // The one legitimate source is `joinUrl`, which the server puts in the
    // tables response and which the QR code and the copy button share.
    expect(source).toContain('entry.joinUrl');
    expect(/tableJoinUrl|resolveOrigin/.test(source)).toBe(false);
  });

  it('keeps the origin out of the transport layer', () => {
    // `server/src/http` parses requests and writes answers. Deciding what a
    // link points at belongs to `server/src/network.ts` and nowhere else, so
    // the check is on imports rather than on prose in a comment.
    const offenders = sourceFiles('server/src/http').filter((file) =>
      /import[^;]*\bfrom '[^']*network'/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
