import { resolve } from 'node:path';

/**
 * How this server was asked to run.
 *
 * Everything is a flag with an environment fallback and a sane default, so the
 * PowerShell launcher only has to pass what the organiser actually chose. There
 * is deliberately no notion of "localhost" in here: the server binds an
 * interface and serves an origin, and the same code has to work when that
 * origin is a hostname on the internet.
 */
export interface ServerConfig {
  /** TCP port to listen on. */
  port: number;
  /** Interface to bind. `0.0.0.0` reaches the LAN; `127.0.0.1` does not. */
  host: string;
  /** Absolute path of the SQLite file. */
  databasePath: string;
  /** Absolute path of the built PWA to serve, when it exists. */
  webRoot: string;
  /** The sub-path the PWA is served under, matching its router basename. */
  basePath: string;
  /**
   * What the outside world sees, when that is not what this process binds.
   *
   * Set it behind a reverse proxy, a tunnel or a hostname — anything the
   * server cannot discover by looking at its own network adapters. Every
   * outward-facing link is built from it, so a QR code stays correct without
   * one line of the UI changing.
   */
  publicUrl?: string;
}

function readNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65_536 ? parsed : fallback;
}

/** Reads `--flag value` and `--flag=value` alike. */
function flag(argv: readonly string[], name: string): string | undefined {
  const prefix = `--${name}`;

  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (entry === prefix) return argv[index + 1];
    if (entry?.startsWith(`${prefix}=`)) return entry.slice(prefix.length + 1);
  }

  return undefined;
}

export function readConfig(
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): ServerConfig {
  const basePath = flag(argv, 'base') ?? env.CANASTA_BASE_PATH ?? '/canasta/';

  return {
    port: readNumber(flag(argv, 'port') ?? env.CANASTA_PORT, 8787),
    // Binding every interface is the point of this server: the phones at the
    // tables are not on the loopback device.
    host: flag(argv, 'host') ?? env.CANASTA_HOST ?? '0.0.0.0',
    databasePath: resolve(
      cwd,
      flag(argv, 'database') ?? env.CANASTA_DATABASE ?? '.data/canasta-tournament.sqlite',
    ),
    webRoot: resolve(cwd, flag(argv, 'web-root') ?? env.CANASTA_WEB_ROOT ?? 'dist'),
    basePath: basePath.endsWith('/') ? basePath : `${basePath}/`,
    publicUrl: flag(argv, 'public-url') ?? env.CANASTA_PUBLIC_URL ?? undefined,
  };
}
