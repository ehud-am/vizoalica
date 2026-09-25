// Assembles the publishable npm package in apps/cli/package/: the bundled command, the built console,
// the browser SDK files, the database changes, and the metadata. Nothing from the checkout beyond that.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// 1. The command and the local service, as one file.
await build({
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

// 1b. The Worker, prebundled with no_bundle so `vizoalica deploy` can deploy it without a checkout.
await build({
  absWorkingDir: root,
  entryPoints: ['apps/ingest-worker/src/index.ts'],
  outfile: join(dist, 'worker', 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'es2022',
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
{
  const example = readFileSync(at('deploy', 'cloudflare', 'wrangler.example.toml'), 'utf8');
  const template = example
    .replace(/^main\s*=.*$/m, 'main = "index.mjs"\nno_bundle = true')
    .replace(/^migrations_dir\s*=.*$/m, 'migrations_dir = "__SCHEMA_DIR__"')
    .replace(/^name\s*=.*$/m, 'name = "__WORKER_NAME__"')
    .replace(/^database_name\s*=.*$/m, 'database_name = "__DATABASE_NAME__"')
    .replace(/^database_id\s*=.*$/m, 'database_id = "__DATABASE_ID__"')
    .replace(/^bucket_name\s*=.*$/m, 'bucket_name = "__BUCKET_NAME__"');
  writeFileSync(join(dist, 'worker', 'wrangler.template.toml'), template);
}

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

// 4. Every numbered database change, in order.
mkdirSync(join(dist, 'schema'), { recursive: true });
for (const name of readdirSync(at('deploy', 'cloudflare', 'migrations'))
  .filter((file) => /^\d{4}_.+\.sql$/.test(file))
  .sort())
  cpSync(at('deploy', 'cloudflare', 'migrations', name), join(dist, 'schema', name));

// 5. Metadata.
const manifest = readFileSync(at('apps', 'cli', 'package.json.template'), 'utf8').replaceAll(
  '__VERSION__',
  version
);
writeFileSync(join(out, 'package.json'), manifest);
cpSync(at('apps', 'cli', 'README.template.md'), join(out, 'README.md'));
for (const name of ['LICENSE', 'CHANGELOG.md']) cpSync(at(name), join(out, name));

if (!existsSync(join(dist, 'console', 'index.html')))
  throw new Error('The console build produced no index.html');
console.log(`Built vizoalica@${version} in ${out}`);
