import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const bin = join(process.cwd(), 'bin/vizoalica.mjs');
const runBin = (args: string[], cwd: string) =>
  spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8', timeout: 30_000 });

describe('the vizoalica command', () => {
  it('is an executable, declared in package.json as the "vizoalica" bin', () => {
    expect(statSync(bin).mode & 0o111).toBeTruthy();
    const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
      bin?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    expect(manifest.bin).toEqual({ vizoalica: 'bin/vizoalica.mjs' });
    expect(manifest.scripts?.vizoalica).toBe('node bin/vizoalica.mjs');
    expect(manifest.scripts?.ops).toBeUndefined();
  });

  it('runs from any directory, not just the checkout', () => {
    const result = runBin(['help'], mkdtempSync(join(tmpdir(), 'vizoalica-elsewhere-')));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('pnpm vizoalica install');
    expect(result.stdout).not.toContain('pnpm ops');
  });

  it('turns a failure into a plain message and a non-zero exit code, with no stack trace', () => {
    const result = runBin(['rotate', 'bogus'], tmpdir());
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage: pnpm vizoalica rotate');
    expect(result.stderr).not.toMatch(/\n\s+at /);
  });

  it('resolves a path flag against where the user typed it, not against the checkout', () => {
    const directory = mkdtempSync(join(tmpdir(), 'vizoalica-relative-'));
    const file = join(directory, 'console.json');
    // Nothing listens there, so verification fails fast; what matters is that the file was found.
    writeFileSync(
      file,
      JSON.stringify({
        VIZOALICA_REMOTE_URL: 'https://127.0.0.1:9',
        VIZOALICA_ADMIN_SECRET: 'x'.repeat(40)
      })
    );
    chmodSync(file, 0o600);
    const result = runBin(['verify', '--console-config', 'console.json'], directory);
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/ENOENT|no such file/i);
    expect(result.stderr).toMatch(/Authenticated project check failed|fetch failed/i);
  });
});
