import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Run } from '@vizoalica/ops-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Vault } from '../../local-ops-api/src/environments/vault.js';
import { deployCommand, type DeployDeps } from '../src/deploy-command.js';
import { applyDeploy, checkAccess, DeployError } from '../src/deploy/apply.js';
import { explain } from '../src/deploy/explain.js';
import { buildPlan } from '../src/deploy/plan.js';
import { wranglerFor } from '../src/deploy/wrangler.js';
import { tempHome, writePrivate } from './support.js';

afterEach(() => vi.unstubAllGlobals());

const ACCOUNT = 'a'.repeat(32);
const OTHER = 'b'.repeat(32);
const whoami = (...accounts: Array<[string, string]>) =>
  accounts.map(([name, id]) => `│ ${name} │ ${id} │`).join('\n');
const example = readFileSync(
  join(process.cwd(), 'deploy/cloudflare/wrangler.example.toml'),
  'utf8'
);

/** The packaged files, as `dist/` would have them. */
function assets() {
  const dir = mkdtempSync(join(tmpdir(), 'vizoalica-assets-'));
  mkdirSync(join(dir, 'worker'));
  mkdirSync(join(dir, 'schema'));
  writeFileSync(join(dir, 'worker', 'index.mjs'), 'export default { fetch() {} };');
  writeFileSync(join(dir, 'worker', 'wrangler.template.toml'), example);
  writeFileSync(join(dir, 'schema', '0001_initial.sql'), 'create table a (id integer);');
  writeFileSync(join(dir, 'schema', '0002_more.sql'), 'create table b (id integer);');
  return dir;
}

type Behavior = {
  accounts?: Array<[string, string]>;
  databases?: string[];
  buckets?: string[];
  secrets?: string[];
  failStep?: string;
  failOutput?: string;
  deployOutput?: string;
};

/** A Wrangler with memory: it records every call, and creates and lists what it is asked to. */
function fakeWrangler(behavior: Behavior = {}) {
  const databases = [...(behavior.databases ?? [])];
  const buckets = [...(behavior.buckets ?? [])];
  const calls: Array<{ args: readonly string[]; env?: Record<string, string>; stdin?: string }> =
    [];
  const stored: Record<string, string> = {};
  const run: Run = async (args, options = {}) => {
    calls.push({
      args,
      ...(options.env ? { env: options.env } : {}),
      ...(options.stdin !== undefined ? { stdin: options.stdin } : {})
    });
    const key = args.slice(0, 2).join(' ');
    const fail = (step: string) =>
      behavior.failStep === step
        ? { code: 1, stdout: '', stderr: behavior.failOutput ?? 'boom' }
        : undefined;
    switch (key) {
      case 'whoami':
        return {
          code: 0,
          stdout: whoami(...(behavior.accounts ?? [['Acme', ACCOUNT]])),
          stderr: ''
        };
      case 'd1 list':
        return {
          code: 0,
          stdout: JSON.stringify(databases.map((name, index) => ({ name, uuid: `uuid-${index}` }))),
          stderr: ''
        };
      case 'r2 bucket':
        if (args[2] === 'list')
          return {
            code: 0,
            stdout: buckets.map((name) => `name:           ${name}`).join('\n'),
            stderr: ''
          };
        if (fail('create-bucket')) return fail('create-bucket')!;
        buckets.push(args[3]!);
        return { code: 0, stdout: '', stderr: '' };
      case 'd1 create':
        if (fail('create-database')) return fail('create-database')!;
        databases.push(args[2]!);
        return { code: 0, stdout: '', stderr: '' };
      case 'd1 migrations':
        return fail('migrate') ?? { code: 0, stdout: 'applied', stderr: '' };
      case 'deploy --config':
        return (
          fail('deploy') ?? {
            code: 0,
            stdout:
              behavior.deployOutput ?? 'Published https://prod-vizoalica-worker.acme.workers.dev',
            stderr: ''
          }
        );
      case 'secret list':
        return {
          code: 0,
          stdout: JSON.stringify(
            (behavior.secrets ?? []).map((name) => ({ name, type: 'secret_text' }))
          ),
          stderr: ''
        };
      case 'secret bulk':
        Object.assign(stored, JSON.parse(options.stdin ?? '{}'));
        return fail('secrets') ?? { code: 0, stdout: '', stderr: '' };
      default:
        return { code: 1, stdout: '', stderr: `unexpected ${args.join(' ')}` };
    }
  };
  return {
    run,
    calls,
    databases,
    buckets,
    stored,
    names: () => calls.map((call) => call.args.slice(0, 2).join(' '))
  };
}

/** The Worker as it answers a check, so registration can verify the new environment. */
const workerFetch = (options: { healthy?: boolean; adminSecret?: () => string | undefined } = {}) =>
  vi.fn(async (input: URL | string, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === '/healthz')
      return options.healthy === false
        ? Response.json({ ok: false }, { status: 503 })
        : Response.json({ ok: true });
    if (url.pathname === '/v1/admin/whoami')
      return Response.json({
        role: 'admin',
        scope: {},
        workerVersion: '0.7.0',
        features: { accessKeys: true, versions: true }
      });
    if (url.pathname === '/v1/admin/backend')
      return Response.json({
        workerVersion: '0.7.0',
        schema: { applied: 2, expected: 2, appliedNames: [], status: 'current' }
      });
    void init;
    return Response.json({}, { status: 404 });
  });

function setup(
  options: {
    interactive?: boolean;
    answers?: string[];
    stdin?: string;
    env?: NodeJS.ProcessEnv;
    behavior?: Behavior;
  } = {}
) {
  const home = tempHome();
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  const wrangler = fakeWrangler(options.behavior);
  const answers = [...(options.answers ?? [])];
  const deps: DeployDeps = {
    home,
    version: '0.7.0',
    assetDir: assets(),
    env: options.env ?? {},
    out: (text) => void out.push(text),
    err: (text) => void err.push(text),
    interactive: options.interactive ?? true,
    ask: async (question) => {
      asked.push(question);
      return answers.shift() ?? '';
    },
    readStdin: async () => options.stdin ?? '',
    vault: new Vault(vi.fn() as never),
    run: wrangler.run,
    fetch: workerFetch(),
    sleep: async () => undefined,
    healthAttempts: 2
  };
  const file = join(home, '.config', 'vizoalica', 'environments.json');
  return {
    deps,
    wrangler,
    home,
    file,
    asked,
    text: () => out.join(''),
    errors: () => err.join(''),
    environments: () =>
      JSON.parse(readFileSync(file, 'utf8')).environments as Record<string, Record<string, unknown>>
  };
}
const APPLY = ['--apply', '--cloudflare-token-stdin', '--yes'];

describe('vizoalica deploy: without --apply', () => {
  it('shows usage, and refuses a missing name or an unknown option', async () => {
    const t = setup({ interactive: false });
    expect(await deployCommand([], t.deps)).toBe(1);
    expect(t.text()).toContain('--apply');
    expect(t.text()).not.toMatch(/terraform/i);
    expect(await deployCommand(['help'], t.deps)).toBe(0);
    expect(await deployCommand(['--apply'], t.deps)).toBe(1);
    expect(await deployCommand(['x', '--bogus'], t.deps)).toBe(1);
    expect(await deployCommand(['x', '--terraform', 'dir'], t.deps)).toBe(1);
    expect(t.errors()).toContain('Unknown option: --terraform');
    expect(await deployCommand(['x', '--account'], t.deps)).toBe(1);
  });

  it('refuses an invalid name', async () => {
    const t = setup({ interactive: false });
    expect(await deployCommand(['Bad Name'], t.deps)).toBe(1);
    expect(t.errors()).toContain('lowercase');
    expect(t.wrangler.calls).toEqual([]);
  });

  it('shows the plan and creates nothing, with or without a terminal', async () => {
    for (const interactive of [true, false]) {
      const t = setup({ interactive });
      expect(await deployCommand(['prod'], t.deps)).toBe(0);
      expect(t.text()).toContain('prod-vizoalica-worker');
      expect(t.text()).toContain('prod-vizoalica-db');
      expect(t.text()).toContain('prod-vizoalica-bucket');
      expect(t.text()).toContain('Nothing was created');
      expect(t.text()).toContain('--apply');
      expect(t.wrangler.calls).toEqual([]);
      expect(existsSync(t.file)).toBe(false);
    }
  });

  it('refuses an existing environment name, and a broken environments file', async () => {
    const t = setup();
    writePrivate(t.home, 'environments.json', {
      version: 1,
      environments: { prod: { url: 'https://w.example.com', role: 'admin', secret: 's' } }
    });
    expect(await deployCommand(['prod'], t.deps)).toBe(1);
    expect(t.errors()).toContain('already an environment');
    expect(await deployCommand(['prod', ...APPLY], t.deps)).toBe(1);
    expect(t.wrangler.calls).toEqual([]);
    writeFileSync(t.file, '{');
    chmodSync(t.file, 0o600);
    expect(await deployCommand(['other'], t.deps)).toBe(1);
    expect(t.errors()).toContain('cannot be used');
  });

  it('reports package files that are missing', async () => {
    const t = setup();
    t.deps.assetDir = tempHome();
    expect(await deployCommand(['prod', ...APPLY], t.deps)).toBe(1);
    expect(t.errors()).toContain('Worker files were not found');
    expect(t.wrangler.calls).toEqual([]);
  });
});

describe('vizoalica deploy --apply', () => {
  it('creates the backend in order, registers the environment, and reveals only the other secrets', async () => {
    const t = setup({ stdin: 'cf-token\n' });
    expect(await deployCommand(['prod', ...APPLY], t.deps)).toBe(0);
    const names = t.wrangler.names();
    expect(names[0]).toBe('whoami');
    expect(names.indexOf('d1 create')).toBeLessThan(
      names.indexOf('r2 bucket', names.indexOf('d1 create'))
    );
    expect(names.indexOf('d1 migrations')).toBeLessThan(names.indexOf('deploy --config'));
    expect(names.indexOf('deploy --config')).toBeLessThan(names.indexOf('secret bulk'));

    const entry = t.environments().prod!;
    expect(entry).toMatchObject({
      url: 'https://prod-vizoalica-worker.acme.workers.dev',
      role: 'admin'
    });
    const admin = t.wrangler.stored.VIZOALICA_ADMIN_SECRET!;
    expect(entry.secret).toBe(admin);
    expect(entry.cloudflare).toBeUndefined();
    expect(statSync(t.file).mode & 0o777).toBe(0o600);

    const output = t.text() + t.errors();
    expect(output).toContain(`VIZOALICA_TOKEN_SECRET=${t.wrangler.stored.VIZOALICA_TOKEN_SECRET}`);
    expect(output).toContain(
      `VIZOALICA_ANALYTICS_DIGEST_SECRET=${t.wrangler.stored.VIZOALICA_ANALYTICS_DIGEST_SECRET}`
    );
    expect(output).not.toContain(admin);
    expect(output).not.toContain('cf-token');
    expect(output).toContain('was added and works');
  });

  it('gives Wrangler the account, the version, and the packaged files, and the token never as an argument', async () => {
    const t = setup({ stdin: 'cf-token\n' });
    await deployCommand(['prod', ...APPLY], t.deps);
    const { calls } = t.wrangler;
    const bulk = calls.find((call) => call.args[0] === 'secret' && call.args[1] === 'bulk')!;
    expect(bulk.env).toMatchObject({ CLOUDFLARE_ACCOUNT_ID: ACCOUNT });
    expect(JSON.stringify(calls.map((call) => call.args))).not.toContain('cf-token');
    const deploy = calls.find((call) => call.args[0] === 'deploy')!;
    expect(deploy.args.at(-1)).toBe(join(t.deps.assetDir, 'worker', 'index.mjs'));
    const config = readFileSync(
      join(t.home, '.config', 'vizoalica', 'deploy', 'prod-vizoalica-worker', 'wrangler.toml'),
      'utf8'
    );
    expect(config).toContain('name = "prod-vizoalica-worker"');
    expect(config).toContain('database_name = "prod-vizoalica-db"');
    expect(config).toContain('bucket_name = "prod-vizoalica-bucket"');
    expect(config).toContain('VIZOALICA_WORKER_VERSION = "0.7.0"');
    expect(config).toContain(`migrations_dir = "${join(t.deps.assetDir, 'schema')}"`);
    expect(
      statSync(
        join(t.home, '.config', 'vizoalica', 'deploy', 'prod-vizoalica-worker', 'wrangler.toml')
      ).mode & 0o777
    ).toBe(0o600);
  });

  it('takes the Cloudflare token from stdin, then $CLOUDFLARE_API_TOKEN, then a hidden prompt, else refuses', async () => {
    const none = setup({ interactive: false });
    expect(
      await deployCommand(
        ['prod', '--apply', '--yes', '--secrets-file', join(tempHome(), 's')],
        none.deps
      )
    ).toBe(1);
    expect(none.errors()).toContain('A Cloudflare API token is needed');
    expect(none.wrangler.calls).toEqual([]);
    const fromEnv = setup({ env: { CLOUDFLARE_API_TOKEN: 'from-env' }, interactive: false });
    expect(
      await deployCommand(
        ['prod', '--apply', '--yes', '--secrets-file', join(tempHome(), 's')],
        fromEnv.deps
      )
    ).toBe(0);
    const prompted = setup({ interactive: true, answers: ['typed-token', 'yes'] });
    expect(await deployCommand(['prod', '--apply'], prompted.deps)).toBe(0);
    expect(prompted.asked[0]).toContain('token');
  });

  it('uses OneCLI when asked, and needs all three options', async () => {
    const t = setup();
    expect(
      await deployCommand(
        [
          'prod',
          '--apply',
          '--yes',
          '--cloudflare-onecli',
          '--secrets-file',
          join(tempHome(), 's')
        ],
        t.deps
      )
    ).toBe(1);
    expect(t.errors()).toContain('--onecli-workspace');
    const ok = setup();
    const code = await deployCommand(
      [
        'prod',
        '--apply',
        '--yes',
        '--cloudflare-onecli',
        '--save-cloudflare',
        '--onecli-workspace',
        'acme',
        '--onecli-agent',
        'vz',
        '--onecli-gateway',
        '127.0.0.1:10255',
        '--secrets-file',
        join(tempHome(), 's')
      ],
      ok.deps
    );
    expect(code).toBe(0);
    expect(ok.environments().prod!.cloudflare).toEqual({
      token: { onecli: { workspace: 'acme', agent: 'vz', gateway: '127.0.0.1:10255' } }
    });
  });

  it('keeps the Cloudflare token in the new environment only when asked', async () => {
    const t = setup({ stdin: 'cf-token\n' });
    await deployCommand(['prod', ...APPLY, '--save-cloudflare'], t.deps);
    expect(t.environments().prod!.cloudflare).toEqual({ token: 'cf-token' });
  });

  it('writes the other secrets to a new private file instead of printing them, and never overwrites', async () => {
    const file = join(tempHome(), 'secrets.env');
    const t = setup({ stdin: 'cf-token\n' });
    expect(await deployCommand(['prod', ...APPLY, '--secrets-file', file], t.deps)).toBe(0);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    const saved = readFileSync(file, 'utf8');
    expect(saved).toContain('VIZOALICA_TOKEN_SECRET=');
    expect(saved).not.toContain('VIZOALICA_ADMIN_SECRET');
    expect(t.text()).not.toContain(t.wrangler.stored.VIZOALICA_TOKEN_SECRET!);
    const again = setup({ stdin: 'cf-token\n' });
    expect(await deployCommand(['prod2', ...APPLY, '--secrets-file', file], again.deps)).toBe(1);
    expect(again.errors()).toContain('already exists');
    expect(again.wrangler.calls).toEqual([]);
  });

  it('without a terminal needs --yes and somewhere to put the secrets, before creating anything', async () => {
    const t = setup({ stdin: 'cf-token\n', interactive: false });
    expect(
      await deployCommand(['prod', '--apply', '--cloudflare-token-stdin', '--yes'], t.deps)
    ).toBe(1);
    expect(t.errors()).toContain('--secrets-file');
    expect(
      await deployCommand(
        ['prod', '--apply', '--cloudflare-token-stdin', '--secrets-file', join(tempHome(), 's')],
        t.deps
      )
    ).toBe(1);
    expect(t.errors()).toContain('--yes');
    expect(t.wrangler.calls).toEqual([]);
  });

  it('asks before creating, and creates nothing unless the answer is yes', async () => {
    const t = setup({ interactive: true, answers: ['no'], env: { CLOUDFLARE_API_TOKEN: 'tok' } });
    expect(await deployCommand(['prod', '--apply'], t.deps)).toBe(1);
    expect(t.errors()).toContain('Nothing was created');
    expect(t.wrangler.names()).toEqual(['whoami']);
    expect(t.asked[0]).toContain('yes');
  });

  it('chooses the account: one is used, several must be chosen, an unknown one is refused', async () => {
    const two: Behavior = {
      accounts: [
        ['Acme', ACCOUNT],
        ['Other', OTHER]
      ]
    };
    const flagless = setup({ stdin: 't\n', behavior: two, interactive: false });
    expect(
      await deployCommand(
        ['prod', ...APPLY, '--secrets-file', join(tempHome(), 'f')],
        flagless.deps
      )
    ).toBe(1);
    expect(flagless.errors()).toContain('--account');
    expect(flagless.errors()).toContain(OTHER);
    const fine = setup({ stdin: 't\n', behavior: two });
    expect(
      await deployCommand(
        [
          'prod',
          '--apply',
          '--yes',
          '--cloudflare-token-stdin',
          '--account',
          OTHER,
          '--secrets-file',
          join(tempHome(), 'q')
        ],
        fine.deps
      )
    ).toBe(0);
    expect(fine.wrangler.calls.find((call) => call.args[0] === 'deploy')!.env).toMatchObject({
      CLOUDFLARE_ACCOUNT_ID: OTHER
    });
    const unknown = setup({ stdin: 't\n' });
    expect(await deployCommand(['prod', ...APPLY, '--account', 'c'.repeat(32)], unknown.deps)).toBe(
      1
    );
    expect(unknown.errors()).toContain('cannot see the account');
    const asked = setup({
      interactive: true,
      answers: ['2', 'yes'],
      behavior: two,
      env: { CLOUDFLARE_API_TOKEN: 't' }
    });
    expect(await deployCommand(['prod', '--apply'], asked.deps)).toBe(0);
    expect(asked.wrangler.calls.find((call) => call.args[0] === 'deploy')!.env).toMatchObject({
      CLOUDFLARE_ACCOUNT_ID: OTHER
    });
    const bad = setup({
      interactive: true,
      answers: ['9'],
      behavior: two,
      env: { CLOUDFLARE_API_TOKEN: 't' }
    });
    expect(await deployCommand(['prod', '--apply'], bad.deps)).toBe(1);
    expect(bad.errors()).toContain('No account chosen');
  });

  it('refuses when Cloudflare does not accept the credential, saying what it needs', async () => {
    const t = setup({ stdin: 'bad\n', behavior: { accounts: [] } });
    expect(
      await deployCommand(['prod', ...APPLY, '--secrets-file', join(tempHome(), 's')], t.deps)
    ).toBe(1);
    expect(t.errors()).toContain('did not recognize the credential');
    expect(t.errors()).toContain('Workers Scripts: Edit');
    expect(t.wrangler.names()).toEqual(['whoami']);
  });

  it('stops before creating anything when a resource already exists, and changes nothing', async () => {
    const t = setup({ stdin: 't\n', behavior: { databases: ['prod-vizoalica-db'] } });
    expect(
      await deployCommand(['prod', ...APPLY, '--secrets-file', join(tempHome(), 's')], t.deps)
    ).toBe(1);
    expect(t.errors()).toContain('"prod-vizoalica-db" already exists');
    expect(t.errors()).toContain('Nothing was changed');
    expect(t.errors()).not.toContain('--resume\n');
    expect(t.wrangler.names()).not.toContain('d1 create');
    const bucket = setup({ stdin: 't\n', behavior: { buckets: ['prod-vizoalica-bucket'] } });
    expect(
      await deployCommand(['prod', ...APPLY, '--secrets-file', join(tempHome(), 's2')], bucket.deps)
    ).toBe(1);
    expect(bucket.errors()).toContain('"prod-vizoalica-bucket" already exists');
  });

  it('resumes after a failure: reuses what exists, creates only what is missing', async () => {
    const t = setup({
      stdin: 't\n',
      behavior: { databases: ['prod-vizoalica-db'], buckets: ['prod-vizoalica-bucket'] }
    });
    expect(
      await deployCommand(
        ['prod', ...APPLY, '--resume', '--secrets-file', join(tempHome(), 's')],
        t.deps
      )
    ).toBe(0);
    expect(t.wrangler.names()).not.toContain('d1 create');
    expect(
      t.wrangler.calls.some((call) => call.args[0] === 'r2' && call.args[2] === 'create')
    ).toBe(false);
    expect(t.wrangler.names()).toContain('deploy --config');
  });

  it('says which step failed, what to do, and how to resume (R2 not enabled, permissions, network)', async () => {
    const r2 = setup({
      stdin: 't\n',
      behavior: { failStep: 'create-bucket', failOutput: 'error 10042: R2 is not enabled' }
    });
    expect(
      await deployCommand(['prod', ...APPLY, '--secrets-file', join(tempHome(), 's')], r2.deps)
    ).toBe(1);
    expect(r2.errors()).toContain('Stopped at: Creating the storage bucket');
    expect(r2.errors()).toContain('R2 is not enabled');
    expect(r2.errors()).toContain('vizoalica deploy prod --apply --resume');
    expect(existsSync(r2.file)).toBe(false);
    const migrate = setup({
      stdin: 't\n',
      behavior: { failStep: 'migrate', failOutput: 'Authentication error [code: 10000]' }
    });
    expect(
      await deployCommand(
        ['prod', ...APPLY, '--secrets-file', join(tempHome(), 's2')],
        migrate.deps
      )
    ).toBe(1);
    expect(migrate.errors()).toContain('Stopped at: Creating the tables');
    expect(migrate.errors()).toContain('Workers Scripts: Edit');
    const deploy = setup({
      stdin: 't\n',
      behavior: { failStep: 'deploy', failOutput: 'fetch failed ETIMEDOUT' }
    });
    expect(
      await deployCommand(['prod', ...APPLY, '--secrets-file', join(tempHome(), 's3')], deploy.deps)
    ).toBe(1);
    expect(deploy.errors()).toContain('could not be reached');
    const secrets = setup({ stdin: 't\n', behavior: { failStep: 'secrets' } });
    expect(
      await deployCommand(
        ['prod', ...APPLY, '--secrets-file', join(tempHome(), 's4')],
        secrets.deps
      )
    ).toBe(1);
    expect(secrets.errors()).toContain('Storing the secrets failed');
    const db = setup({ stdin: 't\n', behavior: { failStep: 'create-database' } });
    expect(
      await deployCommand(['prod', ...APPLY, '--secrets-file', join(tempHome(), 's5')], db.deps)
    ).toBe(1);
    expect(db.errors()).toContain('Creating the database failed');
  });

  it('reports a Worker whose address cannot be read, and one that never becomes healthy', async () => {
    const noUrl = setup({ stdin: 't\n', behavior: { deployOutput: 'done' } });
    expect(
      await deployCommand(['prod', ...APPLY, '--secrets-file', join(tempHome(), 's')], noUrl.deps)
    ).toBe(1);
    expect(noUrl.errors()).toContain('address could not be read');
    const unhealthy = setup({ stdin: 't\n' });
    unhealthy.deps.fetch = workerFetch({ healthy: false });
    expect(
      await deployCommand(
        ['prod', ...APPLY, '--secrets-file', join(tempHome(), 's2')],
        unhealthy.deps
      )
    ).toBe(1);
    expect(unhealthy.errors()).toContain('did not answer its health check');
    expect(existsSync(unhealthy.file)).toBe(false);
  });

  it('does not invent an administrator secret when the Worker already had its secrets', async () => {
    const t = setup({
      stdin: 't\n',
      behavior: {
        databases: ['prod-vizoalica-db'],
        secrets: [
          'VIZOALICA_ADMIN_SECRET',
          'VIZOALICA_TOKEN_SECRET',
          'VIZOALICA_ANALYTICS_DIGEST_SECRET'
        ]
      }
    });
    expect(
      await deployCommand(
        ['prod', ...APPLY, '--resume', '--secrets-file', join(tempHome(), 's')],
        t.deps
      )
    ).toBe(0);
    expect(t.errors()).toContain('vizoalica env add prod');
    expect(t.wrangler.names()).not.toContain('secret bulk');
    expect(existsSync(t.file)).toBe(false);
  });

  it('prints the administrator secret, once, if the environment cannot be saved', async () => {
    const t = setup({ stdin: 't\n' });
    writePrivate(t.home, 'environments.json', {
      version: 1,
      environments: { broken: { url: 'nope' } }
    });
    // A different, valid name is being deployed, but the file has an entry that saving would drop.
    expect(await deployCommand(['prod', ...APPLY], t.deps)).toBe(1);
    expect(t.errors()).toContain('could not be added');
    expect(t.text()).toContain(
      `VIZOALICA_ADMIN_SECRET=${t.wrangler.stored.VIZOALICA_ADMIN_SECRET}`
    );
  });

  it('adds the environment but says so when it does not verify yet', async () => {
    const t = setup({ stdin: 't\n' });
    t.deps.fetch = vi.fn(async (input: URL | string) =>
      String(input).endsWith('/healthz')
        ? Response.json({ ok: true })
        : Response.json({}, { status: 401 })
    );
    expect(
      await deployCommand(['prod', ...APPLY, '--secrets-file', join(tempHome(), 's')], t.deps)
    ).toBe(0);
    expect(t.text()).toContain('does not verify yet');
    expect(t.text()).toContain('vizoalica env check prod');
  });
});

describe('deploy pieces', () => {
  it('checkAccess lists accounts and turns an empty answer into a plain error with a hint', async () => {
    const accounts = await checkAccess(async () => ({
      code: 0,
      stdout: whoami(['Acme', ACCOUNT]),
      stderr: ''
    }));
    expect(accounts).toEqual([{ id: ACCOUNT, name: 'Acme' }]);
    await expect(
      checkAccess(async () => ({ code: 1, stdout: '', stderr: 'not logged in' }))
    ).rejects.toBeInstanceOf(DeployError);
  });

  it('applyDeploy only creates: never deletes, and stops first on an existing name', async () => {
    const wrangler = fakeWrangler({ databases: ['x-vizoalica-db'] });
    await expect(
      applyDeploy(
        {
          run: wrangler.run,
          workerBundle: 'b',
          wranglerTemplate: 't',
          schemaDir: 's',
          version: '1',
          configDir: tempHome(),
          log: () => undefined
        },
        buildPlan('x'),
        { resume: false }
      )
    ).rejects.toMatchObject({ step: 'Checking for existing resources' });
    expect(wrangler.calls.some((call) => call.args.includes('delete'))).toBe(false);
  });

  it('explain names the cause of the common failures and stays quiet otherwise', () => {
    expect(explain('spawn npm ENOENT', 'x')).toContain('npm');
    expect(explain('error 9109 not allowed to access from this ip address', 'x')).toContain(
      'IP addresses'
    );
    expect(explain('10042', 'x')).toContain('R2');
    expect(explain('Invalid API Token', 'x')).toContain('current API token');
    expect(explain('forbidden 403', 'the tables')).toContain('the tables');
    expect(explain('ECONNREFUSED', 'x')).toContain('online');
    expect(explain('something odd', 'x')).toBeUndefined();
  });

  it('buildPlan prefixes every name, and refuses a name that is too long or invalid', () => {
    const plan = buildPlan('stage', ACCOUNT);
    expect(plan.resources.map((resource) => resource.name)).toEqual([
      'stage-vizoalica-db',
      'stage-vizoalica-bucket',
      'stage-vizoalica-worker'
    ]);
    expect(plan.accountId).toBe(ACCOUNT);
    expect(() => buildPlan('x'.repeat(60))).toThrow('too long');
    expect(() => buildPlan('Bad')).toThrow();
  });

  it('wranglerFor gives a token only through the environment, replacing any ambient one', async () => {
    const run = wranglerFor(
      { token: 'the-token' },
      {
        VIZOALICA_WRANGLER: '/usr/bin/env',
        CLOUDFLARE_API_TOKEN: 'ambient',
        PATH: process.env.PATH
      }
    );
    const result = await run(['sh', '-c', 'printf %s "$CLOUDFLARE_API_TOKEN"']);
    expect(result).toMatchObject({ code: 0, stdout: 'the-token' });
    const missing = await wranglerFor(
      { token: 't' },
      { VIZOALICA_WRANGLER: '/nonexistent/program' }
    )(['x']);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain('ENOENT');
    const withStdin = await wranglerFor(
      { token: 't' },
      { VIZOALICA_WRANGLER: '/bin/cat', PATH: process.env.PATH }
    )([], { stdin: 'hello' });
    expect(withStdin.stdout).toBe('hello');
  });

  it('wranglerFor with OneCLI wraps Wrangler in onecli run, mapping the workspace to --project', async () => {
    const run = wranglerFor(
      { onecli: { workspace: 'acme', agent: 'vz', gateway: '127.0.0.1:10255' } },
      { VIZOALICA_WRANGLER: 'wrangler-stub', PATH: '/nonexistent' }
    );
    const result = await run(['whoami']);
    // onecli is not on this PATH: the failure proves the command that was tried.
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('onecli');
  });
});
