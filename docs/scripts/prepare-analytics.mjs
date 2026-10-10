/**
 * Runs after `pnpm docs:build` and `pnpm browser-sdk:build`, before the site is published. It adds
 * Vizoalica's own analytics to the built site the same way the Install page's "GitHub to
 * Cloudflare Pages" path does it for any website: the browser SDK and loader beside the pages, the
 * two Pages Functions (public configuration, and the short-lived token), and a Wrangler file with
 * the public settings. Nothing here is a secret; the token-signing secret is set separately.
 *
 * When VIZOALICA_INGEST_ENDPOINT is not set the site has no analytics, and this does nothing.
 * The SDK path, the token path and the consent state follow the same conventions as the deploy
 * workflow, so they are only set to change them.
 *
 * Usage (from the repository root): node docs/scripts/prepare-analytics.mjs
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DIST = join(ROOT, 'docs/.vitepress/dist');

// What has no default: it identifies this website, so it must be given.
const REQUIRED = [
  'VIZOALICA_INGEST_ENDPOINT',
  'VIZOALICA_PUBLIC_SOURCE_KEY',
  'VIZOALICA_PROJECT_ID',
  'VIZOALICA_SOURCE_ID',
  'VIZOALICA_SITE_ORIGINS'
];
// What follows a convention, so it is only set to change it (the same defaults as the deploy workflow).
const DEFAULTS = {
  VIZOALICA_SDK_SRC: '/vizoalica.js',
  VIZOALICA_TOKEN_URL: '/vizoalica/ingest-token',
  VIZOALICA_CONSENT: 'unknown'
};
const PUBLIC = [...Object.keys(DEFAULTS), ...REQUIRED];

export function prepare(input = process.env, root = ROOT, dist = DIST) {
  // A variable that is set but empty counts as not set, as GitHub passes an unset variable as "".
  const env = { ...input };
  for (const [name, value] of Object.entries(DEFAULTS)) env[name] = input[name] || value;
  if (!env.VIZOALICA_INGEST_ENDPOINT) {
    console.log('analytics not configured: the site is published without it');
    return false;
  }
  const missing = [...PUBLIC, 'PAGES_PROJECT'].filter((name) => !env[name]);
  if (missing.length > 0)
    throw new Error(`Analytics is partly configured. Missing: ${missing.join(', ')}`);

  // These values are written into a TOML file, so none may contain a character that could end a
  // value or start a new line.
  for (const name of [...PUBLIC, 'PAGES_PROJECT'])
    if (/[^\x21-\x7e]|["\\$`]/.test(env[name]))
      throw new Error(
        `${name} contains a space, control character, quote, backslash, $ or backtick`
      );

  for (const file of ['vizoalica.js', 'vizoalica-loader.js']) {
    const source = join(root, 'packages/browser-sdk/dist', file);
    if (!existsSync(source)) throw new Error(`Run "pnpm browser-sdk:build" first: no ${file}`);
    copyFileSync(source, join(dist, file));
  }

  // Wrangler finds Functions in the directory it is started in, so they sit beside the config,
  // not inside the built site. Both are generated and git-ignored.
  const functions = join(root, 'docs/functions');
  rmSync(functions, { recursive: true, force: true });
  mkdirSync(functions, { recursive: true });
  cpSync(join(root, 'examples/cloudflare-pages/functions'), functions, { recursive: true });

  const vars = PUBLIC.map((name) => `${name} = "${env[name]}"`).join('\n');
  writeFileSync(
    join(root, 'docs/wrangler.toml'),
    `name = "${env.PAGES_PROJECT}"\npages_build_output_dir = ".vitepress/dist"\ncompatibility_date = "2026-09-09"\n\n[vars]\n${vars}\n`
  );
  console.log('analytics added: SDK, loader, token Functions, and public settings');
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) prepare();
