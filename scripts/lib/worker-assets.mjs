// The files `vizoalica deploy` deploys: the prebundled Worker, its Wrangler template, and every numbered
// database change. The npm package build writes them once; a checkout writes them fresh before each deploy,
// so it always deploys the code it has.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Writes `worker/index.mjs`, `worker/wrangler.template.toml`, and `schema/` under `dist`. */
export async function buildWorkerAssets(root, dist) {
  const at = (...parts) => join(root, ...parts);
  rmSync(join(dist, 'worker'), { recursive: true, force: true });
  rmSync(join(dist, 'schema'), { recursive: true, force: true });

  // The Worker, prebundled with no_bundle so `vizoalica deploy` can deploy it without a checkout.
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
  const example = readFileSync(at('deploy', 'cloudflare', 'wrangler.example.toml'), 'utf8');
  const template = example
    .replace(/^main\s*=.*$/m, 'main = "index.mjs"\nno_bundle = true')
    .replace(/^migrations_dir\s*=.*$/m, 'migrations_dir = "__SCHEMA_DIR__"')
    .replace(/^name\s*=.*$/m, 'name = "__WORKER_NAME__"')
    .replace(/^database_name\s*=.*$/m, 'database_name = "__DATABASE_NAME__"')
    .replace(/^database_id\s*=.*$/m, 'database_id = "__DATABASE_ID__"')
    .replace(/^bucket_name\s*=.*$/m, 'bucket_name = "__BUCKET_NAME__"');
  writeFileSync(join(dist, 'worker', 'wrangler.template.toml'), template);

  // Every numbered database change, in order.
  mkdirSync(join(dist, 'schema'), { recursive: true });
  for (const name of readdirSync(at('deploy', 'cloudflare', 'migrations'))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort())
    cpSync(at('deploy', 'cloudflare', 'migrations', name), join(dist, 'schema', name));
}
