import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { writeConfigFile } from '../src/config.js';

const cli = join(process.cwd(), 'apps/local-ops-api/src/cli.ts');

function run(args: string[], input = '') {
  return spawnSync(process.execPath, ['--import', 'tsx', cli, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    input
  });
}

describe('local operations CLI security', () => {
  it('reads a direct credential from stdin and requires --replace for an existing file', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'vizoalica-cli-')), 'local-operations.json');
    const first = run(['configure', path, 'https://worker.test'], 'first-secret\n');
    expect(first.status).toBe(0);
    expect(`${first.stdout}${first.stderr}`).not.toContain('first-secret');
    expect(readFileSync(path, 'utf8')).toContain('first-secret');

    const refused = run(['configure', path, 'https://worker.test'], 'second-secret\n');
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toContain('config_exists_use_replace');
    expect(readFileSync(path, 'utf8')).toContain('first-secret');

    const replaced = run(
      ['configure', path, 'https://worker.test', '--replace'],
      'second-secret\n'
    );
    expect(replaced.status).toBe(0);
    expect(readFileSync(path, 'utf8')).toContain('second-secret');
  });

  it('refuses to serve a OneCLI placeholder outside the marked wrapper', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'vizoalica-cli-')), 'local-operations.json');
    writeConfigFile(path, {
      VIZOALICA_REMOTE_URL: 'https://worker.test',
      VIZOALICA_ADMIN_SECRET: 'onecli-managed'
    });
    const result = run(['serve', path]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('onecli_placeholder_requires_wrapper');
    expect(result.stderr).toContain('pnpm ops console');
  });
});
