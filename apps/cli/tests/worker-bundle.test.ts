import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const workerDir = join(root, 'apps', 'cli', 'package', 'dist', 'worker');
const bundlePath = join(workerDir, 'index.mjs');
const templatePath = join(workerDir, 'wrangler.template.toml');
const built = existsSync(bundlePath) && existsSync(templatePath);

/** Fills the packaged Wrangler template's placeholders with throwaway names, for a dry-run only. */
function renderTemplate(): string {
  const migrationsDir = join(root, 'deploy', 'cloudflare', 'migrations');
  const filled = readFileSync(templatePath, 'utf8')
    .replace('__WORKER_NAME__', 'vizoalica-worker-bundle-test')
    .replace('__DATABASE_NAME__', 'vizoalica-worker-bundle-test-db')
    .replace('__DATABASE_ID__', '00000000-0000-0000-0000-000000000000')
    .replace('__SCHEMA_DIR__', migrationsDir)
    .replace('__BUCKET_NAME__', 'vizoalica-worker-bundle-test-bucket');
  const dir = mkdtempSync(join(tmpdir(), 'vizoalica-worker-bundle-'));
  const path = join(dir, 'wrangler.toml');
  writeFileSync(path, filled);
  return path;
}

describe('the packaged Worker bundle', () => {
  // Requires `pnpm package:build` first (produces apps/cli/package/dist/worker/); skipped otherwise so
  // a plain `pnpm vitest run` stays fast and does not need the console and SDK built too.
  it.skipIf(!built)(
    "is accepted by a dry-run deploy with the repository's own pinned Wrangler",
    () => {
      const configPath = renderTemplate();
      const result = spawnSync(
        'pnpm',
        ['exec', 'wrangler', 'deploy', '--dry-run', '--config', configPath, bundlePath],
        { cwd: root, encoding: 'utf8' }
      );
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(result.stdout).toContain('--dry-run: exiting now');
    },
    30_000
  );

  it.skipIf(!built)('carries only placeholders, never a real name or id, in the template', () => {
    const template = readFileSync(templatePath, 'utf8');
    expect(template).toContain('__WORKER_NAME__');
    expect(template).toContain('__DATABASE_NAME__');
    expect(template).toContain('__DATABASE_ID__');
    expect(template).toContain('__BUCKET_NAME__');
    expect(template).toContain('no_bundle = true');
    expect(template).toMatch(/^main = "index\.mjs"$/m);
  });
});
