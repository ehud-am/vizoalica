/**
 * Serves the built site the way Cloudflare Pages will: clean URLs, the 404 page, range requests for
 * video, and the response headers from the built `_headers` file. Tests run against it so the
 * Content-Security-Policy is really exercised. Run after `pnpm docs:build`.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../.vitepress/dist/', import.meta.url));
const PORT = Number(process.env.PORT ?? 4321);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml'
};

/** Reads `_headers`: an unindented line is a path pattern, indented lines under it are headers. */
async function readRules() {
  const rules = [];
  for (const line of (await readFile(join(DIST, '_headers'), 'utf8')).split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (!line.startsWith(' ')) rules.push({ pattern: line.trim(), headers: {} });
    else {
      const [name, ...value] = line.trim().split(':');
      rules.at(-1).headers[name.trim()] = value.join(':').trim();
    }
  }
  return rules;
}

const matches = (pattern, path) =>
  pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : path === pattern;

async function resolveFile(path) {
  const clean = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, '');
  for (const candidate of [clean, `${clean}.html`, join(clean, 'index.html')]) {
    const file = join(DIST, candidate);
    if (!file.startsWith(DIST)) return undefined;
    const info = await stat(file).catch(() => undefined);
    if (info?.isFile()) return file;
  }
  return undefined;
}

const rules = await readRules();

createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
  let file = await resolveFile(url.pathname);
  let status = 200;
  if (!file) {
    file = join(DIST, '404.html');
    status = 404;
  }
  const headers = { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' };
  for (const rule of rules)
    if (matches(rule.pattern, url.pathname)) Object.assign(headers, rule.headers);
  const body = await readFile(file);
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '');
  if (range && status === 200) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Number(range[2]) : body.length - 1;
    response.writeHead(206, {
      ...headers,
      'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${start}-${end}/${body.length}`,
      'Content-Length': end - start + 1
    });
    response.end(body.subarray(start, end + 1));
    return;
  }
  response.writeHead(status, {
    ...headers,
    'Accept-Ranges': 'bytes',
    'Content-Length': body.length
  });
  response.end(request.method === 'HEAD' ? undefined : body);
}).listen(PORT, '127.0.0.1', () => console.log(`serving ${DIST} on http://127.0.0.1:${PORT}`));
