import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { ServerResponse } from 'node:http';

/**
 * Serving the built PWA.
 *
 * The same `dist/` GitHub Pages serves, from the laptop instead. Two things
 * matter here and nothing else does:
 *
 *  - a deep link like `/canasta/table/<token>` must return `index.html`, the
 *    same SPA fallback Pages gets from `404.html`;
 *  - a path must never escape the web root, however it is spelled.
 */

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

export interface StaticSite {
  /** True when a build is actually there to serve. */
  available: boolean;
  /** Writes the file for this pathname, or the SPA shell. Returns false when nothing fit. */
  serve(pathname: string, response: ServerResponse): boolean;
}

export function createStaticSite(webRoot: string, basePath: string): StaticSite {
  const root = resolve(webRoot);
  const index = join(root, 'index.html');
  const available = existsSync(index);

  function send(file: string, response: ServerResponse, status = 200): boolean {
    const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
    const immutable = file.includes(`${sep}assets${sep}`);

    response.writeHead(status, {
      'content-type': type,
      'content-length': statSync(file).size,
      // Vite fingerprints everything under assets/, so those may be cached hard.
      // The shell may not: it is how a device learns the app changed.
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    createReadStream(file).pipe(response);
    return true;
  }

  return {
    available,

    serve(pathname, response) {
      if (!available) return false;

      const withoutBase = pathname.startsWith(basePath)
        ? pathname.slice(basePath.length)
        : pathname.replace(/^\//, '');

      // `normalize` collapses `..`; the prefix check then rejects anything that
      // still points outside the root, including encoded attempts.
      const candidate = resolve(root, normalize(withoutBase));
      const inside = candidate === root || candidate.startsWith(root + sep);

      if (inside && withoutBase.length > 0 && existsSync(candidate)) {
        const info = statSync(candidate);
        if (info.isFile()) return send(candidate, response);
      }

      // Anything else is a route of the single-page app.
      return send(index, response);
    },
  };
}
