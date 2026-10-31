// Assembles the publishable npm package in apps/cli/package/: the bundled command, the built console,
// the browser SDK files, the Worker and its database changes, and the metadata. Nothing from the checkout beyond that.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyReadmePixel, settingsFromEnv } from './lib/readme-pixel.mjs';
import { buildWorkerAssets } from './lib/worker-assets.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const at = (...parts) => join(root, ...parts);
const out = at('apps', 'cli', 'package');
const dist = join(out, 'dist');

const run = (command, args, cwd = root) => {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`);
};

const version = JSON.parse(readFileSync(at('package.json'), 'utf8')).version;
if (!/^\d+\.\d+\.\d+/.test(version)) throw new Error(`Unexpected version: ${version}`);

rmSync(out, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// Zod (used by the MCP server) re-exports every language's error messages; only English is used,
// so the other locales are left out of the bundle (about 360 KB).
const englishOnlyZod = {
  name: 'english-only-zod',
  setup(builder) {
    builder.onLoad({ filter: /[\\/]zod[\\/]v4[\\/]locales[\\/]index\.js$/ }, () => ({
      contents: 'export { default as en } from "./en.js";',
      loader: 'js'
    }));
  }
};

// 1. The command and the local service, as one file.
await build({
  plugins: [englishOnlyZod],
  absWorkingDir: root,
  entryPoints: ['apps/cli/src/bin.ts'],
  outfile: join(dist, 'cli.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  banner: { js: '#!/usr/bin/env node' },
  define: { __VIZOALICA_VERSION__: JSON.stringify(version) },
  // Workspace packages are bundled from their sources, so the package builds on a clean checkout
  // with no `pnpm build` first (as the publish workflow does).
  alias: {
    '@vizoalica/event-contracts': './packages/event-contracts/src/index.ts',
    '@vizoalica/ops-core': './packages/ops-core/src/index.ts',
    '@vizoalica/privacy': './packages/privacy/src/index.ts'
  },
  legalComments: 'none',
  logLevel: 'warning'
});
chmodSync(join(dist, 'cli.mjs'), 0o755);

// 1b. The Worker and its database changes, so `vizoalica deploy` can deploy it without a checkout.
await buildWorkerAssets(root, dist);

// 2. The console. Built straight into the package so the checkout's own build output is left alone.
run('pnpm', [
  '--filter',
  '@vizoalica/admin-web',
  'exec',
  'vite',
  'build',
  '--outDir',
  join(dist, 'console'),
  '--emptyOutDir'
]);

// 3. The browser SDK files the console hands to website owners.
run('node', [at('scripts', 'build-browser-sdk.mjs')]);
mkdirSync(join(dist, 'sdk'), { recursive: true });
for (const name of ['vizoalica.js', 'vizoalica-loader.js'])
  cpSync(at('packages', 'browser-sdk', 'dist', name), join(dist, 'sdk', name));

// 5. The AI assistant skill, which `vizoalica skill` installs.
cpSync(at('skills', 'vizoalica'), join(dist, 'skill', 'vizoalica'), { recursive: true });

// 6. Metadata.
const manifest = readFileSync(at('apps', 'cli', 'package.json.template'), 'utf8').replaceAll(
  '__VERSION__',
  version
);
writeFileSync(join(out, 'package.json'), manifest);
// The README's pixel block is filled from the pipeline's public variables, so the npm page counts its own views.
writeFileSync(
  join(out, 'README.md'),
  applyReadmePixel(
    readFileSync(at('apps', 'cli', 'README.template.md'), 'utf8'),
    settingsFromEnv(process.env, '/npm/vizoalica')
  )
);
for (const name of ['LICENSE', 'CHANGELOG.md']) cpSync(at(name), join(out, name));

if (!existsSync(join(dist, 'console', 'index.html')))
  throw new Error('The console build produced no index.html');
console.log(`Built vizoalica@${version} in ${out}`);
