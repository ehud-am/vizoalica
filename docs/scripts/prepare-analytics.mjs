/**
 * Runs after `pnpm docs:build` and `pnpm browser-sdk:build`, before the site is published. It puts
 * the browser SDK beside the pages so the site can count its own page views without a token
 * endpoint or a signing secret (`data-token-url="none"`: the backend accepts unsigned events for a
 * website that does not require tokens, only from that website's allowed origins). Both settings are
 * public. The site build reads them too (docs/.vitepress/config.mts), so the consent control and the
 * script tag exist only when both are set.
 *
 * When VIZOALICA_INGEST_ENDPOINT is not set the site has no analytics, and this does nothing.
 *
 * Usage (from the repository root): node docs/scripts/prepare-analytics.mjs
 */
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DIST = join(ROOT, 'docs/.vitepress/dist');

const REQUIRED = ['VIZOALICA_INGEST_ENDPOINT', 'VIZOALICA_PUBLIC_SOURCE_KEY'];

export function prepare(input = process.env, root = ROOT, dist = DIST) {
  // A variable that is set but empty counts as not set, as GitHub passes an unset variable as "".
  if (!input.VIZOALICA_INGEST_ENDPOINT) {
    console.log('analytics not configured: the site is published without it');
    return false;
  }
  const missing = REQUIRED.filter((name) => !input[name]);
  if (missing.length > 0)
    throw new Error(`Analytics is partly configured. Missing: ${missing.join(', ')}`);

  const source = join(root, 'packages/browser-sdk/dist/vizoalica.js');
  if (!existsSync(source)) throw new Error('Run "pnpm browser-sdk:build" first: no vizoalica.js');
  copyFileSync(source, join(dist, 'vizoalica.js'));
  console.log('analytics added: the SDK, sending unsigned events to the configured backend');
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) prepare();
