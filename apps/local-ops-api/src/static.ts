import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, join, sep } from 'node:path';

export type StaticDirs = {
  /** The built console (index.html, assets/, brand/). */
  consoleDir?: string | undefined;
  /** The browser SDK files shipped with the package. */
  sdkDir?: string | undefined;
};
export type StaticResult = { status: number; headers: Record<string, string>; body?: Buffer };

const CONSOLE_CSP =
  "default-src 'self'; script-src 'self'; img-src 'self' data:; font-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
};
const SDK_FILES = new Set(['vizoalica.js', 'vizoalica-loader.js']);

const notFound = (): StaticResult => ({
  status: 404,
  headers: {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff'
  },
  body: Buffer.from(JSON.stringify({ error: 'not_found' }))
});

function fileResult(path: string, head: boolean, headers: Record<string, string>): StaticResult {
  const body = readFileSync(path);
  return {
    status: 200,
    headers: {
      'content-type': TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
      'content-length': String(body.byteLength),
      'x-content-type-options': 'nosniff',
      ...headers
    },
    ...(head ? {} : { body })
  };
}

/** A regular file inside `root`, after resolving symlinks; anything else is undefined. */
function insideRoot(root: string, relative: string): string | undefined {
  const realRoot = realpathSync(root);
  const candidate = join(realRoot, relative);
  if (!existsSync(candidate)) return undefined;
  const real = realpathSync(candidate);
  if (real !== realRoot && !real.startsWith(realRoot + sep)) return undefined;
  return statSync(real).isFile() ? real : undefined;
}

/** True for a request path that is (or should be treated as) a page or asset, not an API call. */
export function isStaticRequest(pathname: string): boolean {
  return !pathname.startsWith('/api/') || pathname.startsWith('/api/sdk/');
}

export function serveStatic(method: string, rawPath: string, dirs: StaticDirs): StaticResult {
  if (method !== 'GET' && method !== 'HEAD')
    return {
      status: 405,
      headers: {
        allow: 'GET, HEAD',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff'
      }
    };
  const head = method === 'HEAD';
  // Encoded separators and dots are never legitimate here; refuse them before decoding.
  if (/%(2f|5c|2e|00)/i.test(rawPath)) return notFound();
  let path: string;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    return notFound();
  }
  if (path.includes('\0') || path.includes('\\') || !path.startsWith('/')) return notFound();
  const segments = path.split('/').slice(1);
  if (segments.some((segment) => segment === '..' || segment === '.')) return notFound();

  if (path.startsWith('/api/sdk/')) {
    const name = path.slice('/api/sdk/'.length);
    if (!dirs.sdkDir || !SDK_FILES.has(name)) return notFound();
    const file = insideRoot(dirs.sdkDir, name);
    return file
      ? fileResult(file, head, {
          'content-type': 'text/javascript; charset=utf-8',
          'cache-control': 'no-cache'
        })
      : notFound();
  }

  if (!dirs.consoleDir || !existsSync(dirs.consoleDir)) return notFound();
  const relative = segments.filter(Boolean).join(sep);
  const exact = relative ? insideRoot(dirs.consoleDir, relative) : undefined;
  if (exact && relative !== 'index.html') {
    return fileResult(exact, head, {
      'cache-control': path.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600'
    });
  }
  // A missing asset is a 404; any other path is a console route that the page itself resolves.
  if (path.startsWith('/assets/') || path.startsWith('/brand/') || /\.[a-z0-9]+$/i.test(path)) {
    if (relative !== 'index.html') return notFound();
  }
  const index = insideRoot(dirs.consoleDir, 'index.html');
  if (!index) return notFound();
  return fileResult(index, head, {
    'cache-control': 'no-store',
    'content-security-policy': CONSOLE_CSP
  });
}
