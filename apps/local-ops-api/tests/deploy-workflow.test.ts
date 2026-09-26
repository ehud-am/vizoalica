import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateDynamicConfig } from '../../../packages/browser-sdk/src/dynamic-config.js';
import { onRequest as configEndpoint } from '../../../examples/cloudflare-pages/functions/vizoalica/config.json.js';
import { onRequest as tokenEndpoint } from '../../../examples/cloudflare-pages/functions/vizoalica/ingest-token.js';

// The reusable workflow resolves the bundled site value and the defaults in one shell step. That
// step runs with a Cloudflare token nearby, so it is tested here as real shell, not read by eye.
const workflow = readFileSync(
  new URL('../../../.github/workflows/deploy-vizoalica-pages.yml', import.meta.url),
  'utf8'
);
const hasJq = spawnSync('jq', ['--version']).status === 0;

const resolveStep = () => stepScript('Resolve and validate configuration');

function stepScript(name: string): string {
  const start = workflow.indexOf(`- name: ${name}`);
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

describe.skipIf(!hasJq)('workflow steps chained into the real Pages functions', () => {
  /** Resolve, then generate wrangler.toml exactly as the workflow does, and read back its [vars]. */
  function deployed(bundleOrEnv: Record<string, string>) {
    const dir = mkdtempSync(join(tmpdir(), 'vizoalica-chain-'));
    const githubEnv = join(dir, 'env');
    writeFileSync(githubEnv, '');
    const base = {
      PATH: process.env.PATH ?? '',
      GITHUB_ENV: githubEnv,
      SITE_DIRECTORY: '.',
      VIZOALICA_TOKEN_SECRET: secret,
      ...account,
      ...bundleOrEnv
    };
    const resolve = join(dir, 'resolve.sh');
    writeFileSync(resolve, resolveStep());
    expect(spawnSync('bash', [resolve], { cwd: dir, env: base, encoding: 'utf8' }).status).toBe(0);
    const resolved = Object.fromEntries(
      readFileSync(githubEnv, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])
    );
    const generate = join(dir, 'generate.sh');
    writeFileSync(generate, stepScript('Generate ephemeral Cloudflare Pages configuration'));
    const run = spawnSync('bash', [generate], {
      cwd: dir,
      env: {
        PATH: base.PATH,
        SITE_DIRECTORY: '.',
        CF_PAGES_PROJECT: account.CF_PAGES_PROJECT,
        ...resolved
      },
      encoding: 'utf8'
    });
    expect(run.status).toBe(0);
    const toml = readFileSync(join(dir, 'wrangler.toml'), 'utf8');
    const vars = Object.fromEntries(
      [...toml.matchAll(/^(VIZOALICA_\w+) = "([^"]*)"$/gm)].map((match) => [match[1]!, match[2]!])
    );
    return { toml, vars };
  }

  it('produces a config document the browser loader accepts, from only the bundled value', async () => {
    const { toml, vars } = deployed({ SITE_BUNDLE: JSON.stringify(bundle) });
    expect(toml).toContain('name = "proj"');
    const response = await configEndpoint({
      request: new Request('https://a.test/vizoalica/config.json'),
      env: vars as never
    });
    expect(response.status).toBe(200);
    const document = await response.json();
    expect(document).toMatchObject({
      version: 1,
      src: '/vizoalica.js',
      'data-endpoint': bundle.endpoint,
      'data-source': 'key1',
      'data-project': 'p1',
      'data-token-url': '/vizoalica/ingest-token',
      'data-consent': 'unknown'
    });
    expect(validateDynamicConfig(document, 'https://a.test/')).toBeTruthy();
  });

  it('issues a token scoped to the bundled project and source, for each listed origin only', async () => {
    const { vars } = deployed({ SITE_BUNDLE: JSON.stringify(bundle) });
    const env = { ...vars, VIZOALICA_TOKEN_SECRET: secret } as never;
    const ask = (origin: string) =>
      tokenEndpoint({
        request: new Request(`${origin}/vizoalica/ingest-token`, { headers: { origin } }),
        env
      });
    for (const origin of bundle.origins) {
      const response = await ask(origin);
      expect(response.status).toBe(200);
      const claims = JSON.parse(
        Buffer.from((await response.text()).split('.')[1]!, 'base64url').toString('utf8')
      );
      expect(claims).toMatchObject({ project_id: 'p1', source_id: 's1', origin });
    }
    expect((await ask('https://evil.test')).status).toBe(403);
  });

  it('gives the same functions the same values whether bundled or set separately', () => {
    const bundled = deployed({ SITE_BUNDLE: JSON.stringify(bundle) }).vars;
    const separate = deployed({
      VIZOALICA_INGEST_ENDPOINT: bundle.endpoint,
      VIZOALICA_PUBLIC_SOURCE_KEY: 'key1',
      VIZOALICA_PROJECT_ID: 'p1',
      VIZOALICA_SOURCE_ID: 's1',
      VIZOALICA_SITE_ORIGINS: 'https://a.test,https://www.a.test'
    }).vars;
    expect(separate).toEqual(bundled);
  });
});
