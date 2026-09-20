/**
 * Runs after `vitepress build`: writes the site's llms.txt, puts the hashes of the inline scripts
 * into the Content-Security-Policy, and checks that the files a crawler, a browser, and Cloudflare
 * Pages expect are all in the output.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toSiteLlms } from './llms.mjs';

const DIST = fileURLToPath(new URL('../.vitepress/dist/', import.meta.url));
const ROOT_LLMS = fileURLToPath(new URL('../../llms.txt', import.meta.url));

function pages(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return pages(path);
    return path.endsWith('.html') ? [path] : [];
  });
}

const hashes = new Set();
for (const page of pages(DIST)) {
  for (const match of readFileSync(page, 'utf8').matchAll(
    /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g
  ))
    hashes.add(`'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
}
if (hashes.size === 0) throw new Error('No inline scripts found; the page structure changed.');

const headersPath = join(DIST, '_headers');
const headers = readFileSync(headersPath, 'utf8');
if (!headers.includes('__SCRIPT_HASHES__'))
  throw new Error('_headers has no __SCRIPT_HASHES__ placeholder.');
if (headers.split('__SCRIPT_HASHES__').length !== 2)
  throw new Error('_headers must use __SCRIPT_HASHES__ exactly once, in the policy.');

// The one extra place the page may send data to: the site's own Vizoalica ingestion Worker, and
// only when the site is built for one. It is taken from the public endpoint URL, so the policy
// names an origin and never a path.
if (headers.split('__INGEST_ORIGIN__').length < 2)
  throw new Error('_headers has no __INGEST_ORIGIN__ placeholder.');
let ingestOrigin = '';
if (process.env.VIZOALICA_INGEST_ENDPOINT) {
  const endpoint = new URL(process.env.VIZOALICA_INGEST_ENDPOINT);
  if (endpoint.protocol !== 'https:' || !/^[a-z0-9.-]+(:\d+)?$/.test(endpoint.host))
    throw new Error('VIZOALICA_INGEST_ENDPOINT must be an https URL.');
  ingestOrigin = endpoint.origin;
}

writeFileSync(
  headersPath,
  headers
    .replaceAll('__SCRIPT_HASHES__', [...hashes].sort().join(' '))
    .replaceAll(' __INGEST_ORIGIN__', ingestOrigin ? ` ${ingestOrigin}` : '')
);

writeFileSync(join(DIST, 'llms.txt'), toSiteLlms(readFileSync(ROOT_LLMS, 'utf8')));

// The GitHub Pages copy (built with DOCS_BASE) has no sitemap: see the site config.
const onRoot = !process.env.DOCS_BASE || process.env.DOCS_BASE === '/';
for (const required of [
  'index.html',
  '404.html',
  '_headers',
  'robots.txt',
  ...(onRoot ? ['sitemap.xml'] : []),
  'llms.txt',
  'og.jpg',
  'media/vizoalica-intro.mp4'
])
  if (!existsSync(join(DIST, required)))
    throw new Error(`Missing from the built site: ${required}`);
console.log(`site finished: ${hashes.size} inline script hashes, llms.txt written`);
