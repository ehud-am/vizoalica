import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The reusable workflow resolves the bundled site value and the defaults in one shell step. That
// step runs with a Cloudflare token nearby, so it is tested here as real shell, not read by eye.
const workflow = readFileSync(
  new URL('../../../.github/workflows/deploy-vizoalica-pages.yml', import.meta.url),
  'utf8'
);
const hasJq = spawnSync('jq', ['--version']).status === 0;

function resolveStep(): string {
  const start = workflow.indexOf('- name: Resolve and validate configuration');
  const runAt = workflow.indexOf('        run: |\n', start);
  const end = workflow.indexOf('\n      - name:', runAt);
  return workflow
    .slice(runAt + '        run: |\n'.length, end)
    .split('\n')
    .map((line) => line.replace(/^ {10}/, ''))
    .join('\n');
}

const bundle = {
  endpoint: 'https://worker.test/v1/events:batch',
  sourceKey: 'key1',
  projectId: 'p1',
  sourceId: 's1',
  origins: ['https://a.test', 'https://www.a.test']
};
const secret = 'a'.repeat(40);
const account = { CF_ACCOUNT_ID: 'abc', CF_PAGES_PROJECT: 'proj', CF_API_TOKEN: 'x' };

function run(env: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'vizoalica-workflow-'));
  const githubEnv = join(dir, 'env');
  writeFileSync(githubEnv, '');
  const script = join(dir, 'step.sh');
  writeFileSync(script, resolveStep());
  const result = spawnSync('bash', [script], {
    cwd: dir,
    env: {
      PATH: process.env.PATH ?? '',
      GITHUB_ENV: githubEnv,
      SITE_DIRECTORY: '.',
      VIZOALICA_TOKEN_SECRET: secret,
      ...account,
      ...env
    },
    encoding: 'utf8'
  });
  const written = Object.fromEntries(
    readFileSync(githubEnv, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])
  );
  return { status: result.status, output: result.stdout + result.stderr, written };
}

describe.skipIf(!hasJq)('deploy workflow configuration step', () => {
  it('fills every value from the one bundled variable and applies the defaults', () => {
    const result = run({ SITE_BUNDLE: JSON.stringify(bundle) });
    expect(result.status).toBe(0);
    expect(result.written).toEqual({
      VIZOALICA_SDK_SRC: '/vizoalica.js',
      VIZOALICA_INGEST_ENDPOINT: bundle.endpoint,
      VIZOALICA_PUBLIC_SOURCE_KEY: 'key1',
      VIZOALICA_PROJECT_ID: 'p1',
      VIZOALICA_TOKEN_URL: '/vizoalica/ingest-token',
      VIZOALICA_CONSENT: 'unknown',
      VIZOALICA_SOURCE_ID: 's1',
      VIZOALICA_SITE_ORIGINS: 'https://a.test,https://www.a.test'
    });
  });

  it('lets a separate variable win over the bundle, so existing setups keep working', () => {
    const result = run({
      SITE_BUNDLE: JSON.stringify(bundle),
      VIZOALICA_SOURCE_ID: 'override',
      VIZOALICA_CONSENT: 'analytics-granted'
    });
    expect(result.status).toBe(0);
    expect(result.written.VIZOALICA_SOURCE_ID).toBe('override');
    expect(result.written.VIZOALICA_CONSENT).toBe('analytics-granted');
  });

  it('still accepts the five separate variables and no bundle', () => {
    const result = run({
      VIZOALICA_INGEST_ENDPOINT: bundle.endpoint,
      VIZOALICA_PUBLIC_SOURCE_KEY: 'key1',
      VIZOALICA_PROJECT_ID: 'p1',
      VIZOALICA_SOURCE_ID: 's1',
      VIZOALICA_SITE_ORIGINS: 'https://a.test'
    });
    expect(result.status).toBe(0);
  });

  it('names what is missing and writes nothing', () => {
    const result = run({});
    expect(result.status).toBe(1);
    expect(result.output).toContain('VIZOALICA_PROJECT_ID');
    expect(result.written).toEqual({});
  });

  it('refuses a bundle that is not a JSON object', () => {
    const result = run({ SITE_BUNDLE: 'nope' });
    expect(result.status).toBe(1);
    expect(result.output).toContain('must be a JSON object');
  });

  it('refuses a value that could inject another variable, and writes nothing', () => {
    const result = run({ SITE_BUNDLE: JSON.stringify({ ...bundle, sourceKey: 'k\nEVIL=1' }) });
    expect(result.status).toBe(1);
    expect(result.written).toEqual({});
  });

  it.each(['a b', 'a"b', 'a$b', 'a`b', 'a\\b'])('refuses %j in a public value', (value) => {
    const result = run({ SITE_BUNDLE: JSON.stringify({ ...bundle, projectId: value }) });
    expect(result.status).toBe(1);
    expect(result.written).toEqual({});
  });

  it('refuses a token secret shorter than 32 characters', () => {
    expect(
      run({ SITE_BUNDLE: JSON.stringify(bundle), VIZOALICA_TOKEN_SECRET: 'short' }).status
    ).toBe(1);
  });

  it('defaults the site folder to the repository root and rejects a path that escapes it', () => {
    expect(workflow).toMatch(/site-directory:[\s\S]*?required: false[\s\S]*?default: '\.'/);
    expect(run({ SITE_BUNDLE: JSON.stringify(bundle), SITE_DIRECTORY: '../x' }).status).toBe(1);
  });
});
