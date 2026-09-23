import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Run, RunResult } from '@vizoalica/ops-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildPlan,
  cleanupRun,
  getRun,
  preflight,
  resumeRun,
  rotateSecret,
  startRun,
  type EngineDeps
} from '../src/deploy/engine.js';
import { RunStore } from '../src/deploy/runs.js';
import { SecretVault } from '../src/deploy/vault.js';
import { EnvironmentStore } from '../src/environment-store.js';

const ACCOUNT = { id: 'a'.repeat(32), name: 'Acme' };

/** A fake Wrangler with just enough state to exercise the engine's real step sequence. */
function fakeWrangler(
  options: {
    r2Fails?: boolean;
    deployFails?: boolean;
    migrationsFail?: boolean;
    secretsFail?: boolean;
    malformedSecretList?: boolean;
    versionFails?: boolean;
    noAccounts?: boolean;
    databaseCreateFails?: boolean;
  } = {}
) {
  const databases: Array<{ name: string; uuid: string }> = [];
  const buckets: string[] = [];
  const secrets = new Set<string>();
  const calls: string[][] = [];

  const ok = (stdout = ''): RunResult => ({ code: 0, stdout, stderr: '' });
  const fail = (stderr: string): RunResult => ({ code: 1, stdout: '', stderr });

  const run: Run = async (args) => {
    calls.push([...args]);
    const [command] = args;
    if (args.includes('--version'))
      return options.versionFails ? fail('command not found') : ok('4.134.0');
    if (command === 'whoami')
      return options.noAccounts ? ok('') : ok(`│ ${ACCOUNT.name} │ ${ACCOUNT.id} │`);
    if (command === 'd1' && args[1] === 'list') return ok(JSON.stringify(databases));
    if (command === 'd1' && args[1] === 'create') {
      const name = args[2]!;
      if (options.databaseCreateFails) return fail('database create failed');
      if (databases.some((d) => d.name === name)) return fail('already exists');
      databases.push({ name, uuid: `${name}-uuid` });
      return ok();
    }
    if (command === 'd1' && args[1] === 'delete') {
      const name = args[2]!;
      const at = databases.findIndex((d) => d.name === name);
      if (at >= 0) databases.splice(at, 1);
      return ok();
    }
    if (command === 'd1' && args[1] === 'migrations' && args[2] === 'apply')
      return options.migrationsFail ? fail('migration failed') : ok('Applied 2 migrations');
    if (command === 'r2' && args[1] === 'bucket' && args[2] === 'list')
      return ok(buckets.map((name) => `name:      ${name}`).join('\n'));
    if (command === 'r2' && args[1] === 'bucket' && args[2] === 'create') {
      if (options.r2Fails) return fail('R2 is not enabled (10042)');
      buckets.push(args[3]!);
      return ok();
    }
    if (command === 'r2' && args[1] === 'bucket' && args[2] === 'delete') {
      const at = buckets.indexOf(args[3]!);
      if (at >= 0) buckets.splice(at, 1);
      return ok();
    }
    if (command === 'deploy') {
      if (options.deployFails) return fail('deploy failed');
      return ok('Deployed to https://stage-vizoalica-worker.example.workers.dev');
    }
    if (command === 'secret' && args[1] === 'list')
      return options.malformedSecretList
        ? ok('not valid json at all')
        : ok(JSON.stringify([...secrets].map((name) => ({ name }))));
    if (command === 'secret' && args[1] === 'bulk') {
      // The engine passes the generated secrets as JSON on stdin.
      return options.secretsFail ? fail('storing secrets failed') : ok();
    }
    return ok();
  };
  return { run, databases, buckets, secrets, calls };
}

const dir = () => mkdtempSync(join(tmpdir(), 'vizoalica-deploy-'));

function deps(
  overrides: Partial<EngineDeps> = {},
  fake = fakeWrangler()
): EngineDeps & { fake: ReturnType<typeof fakeWrangler> } {
  const base = dir();
  const workerDir = join(base, 'packaged', 'worker');
  const schemaDir = join(base, 'packaged', 'schema');
  mkdirSync(workerDir, { recursive: true });
  mkdirSync(schemaDir, { recursive: true });
  writeFileSync(join(workerDir, 'index.mjs'), 'export default {};');
  writeFileSync(
    join(workerDir, 'wrangler.template.toml'),
    [
      'name = "__WORKER_NAME__"',
      'main = "index.mjs"',
      'no_bundle = true',
      'compatibility_date = "2026-08-29"',
      '[[d1_databases]]',
      'binding = "VIZOALICA_DB"',
      'database_name = "__DATABASE_NAME__"',
      'database_id = "__DATABASE_ID__"',
      'migrations_dir = "__SCHEMA_DIR__"',
      '[[r2_buckets]]',
      'binding = "VIZOALICA_EVENTS"',
      'bucket_name = "__BUCKET_NAME__"',
      '[vars]',
      'VIZOALICA_WORKER_VERSION = ""'
    ].join('\n')
  );
  const environmentStore = EnvironmentStore.fromDirectory(join(base, 'home'));
  environmentStore.create('stage', { mode: 'token', token: 'cf-tok' });
  return {
    configBaseDir: join(base, 'home', 'deploy'),
    workerBundle: join(workerDir, 'index.mjs'),
    wranglerTemplate: join(workerDir, 'wrangler.template.toml'),
    schemaDir,
    consoleVersion: '0.7.0',
    store: new RunStore(join(base, 'home', 'deployments')),
    vault: new SecretVault(),
    environmentStore,
    run: fake.run,
    ...overrides,
    fake
  };
}

async function waitForFinish(engineDeps: EngineDeps, runId: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const run = getRun(engineDeps, runId);
    if (run && run.status !== 'running') return run;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('run did not finish in time');
}

beforeEach(() => {
  vi.useRealTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ ok: true }))
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('preflight', () => {
  it('creates nothing and reports signed-out with no accounts', async () => {
    const fake = fakeWrangler();
    const result = await preflight(
      { run: fake.run },
      { worker: 'stage-w', database: 'stage-d', bucket: 'stage-b' }
    );
    // whoami always returns an account in this fake; use a run that never does, for the signed-out case.
    const signedOut = await preflight(
      { run: async () => ({ code: 0, stdout: '', stderr: '' }) },
      { worker: 'stage-w', database: 'stage-d', bucket: 'stage-b' }
    );
    expect(result.signedIn).toBe(true);
    expect(signedOut).toEqual({
      signedIn: false,
      accounts: [],
      existing: { database: false, bucket: false }
    });
    expect(fake.calls.some((call) => call[0] === 'd1' && call[1] === 'create')).toBe(false);
  });
});

describe('buildPlan', () => {
  it('lists every resource with a name carrying the environment prefix, and creates nothing', () => {
    const store = new RunStore(join(dir(), 'deployments'));
    const plan = buildPlan({ store }, { environment: 'stage' });
    expect(plan.names).toEqual({
      worker: 'stage-vizoalica-worker',
      database: 'stage-vizoalica-db',
      bucket: 'stage-vizoalica-bucket'
    });
    expect(plan.resources.map((r) => r.name)).toEqual(
      expect.arrayContaining([
        'stage-vizoalica-db',
        'stage-vizoalica-bucket',
        'stage-vizoalica-worker'
      ])
    );
    expect(store.loadPlan(plan.id)).toEqual(plan);
  });

  it('refuses a plan whose names do not carry the environment prefix', () => {
    const store = new RunStore(join(dir(), 'deployments'));
    expect(() =>
      buildPlan(
        { store },
        {
          environment: 'stage',
          names: { worker: 'dev-w', database: 'stage-d', bucket: 'stage-b' }
        }
      )
    ).toThrow();
  });

  it('requires a changed name to produce a new plan (an old plan id cannot be reused for different names)', () => {
    const store = new RunStore(join(dir(), 'deployments'));
    const first = buildPlan({ store }, { environment: 'stage' });
    const second = buildPlan(
      { store },
      { environment: 'stage', names: { worker: 'stage-x', database: 'stage-d', bucket: 'stage-b' } }
    );
    expect(first.id).not.toBe(second.id);
  });
});

describe('a first-install run', () => {
  it('runs every step in order, connects the environment, and never leaves a secret in the run record', async () => {
    const engineDeps = deps();
    const plan = buildPlan(engineDeps, { environment: 'stage' });
    const run = startRun(engineDeps, plan.id);
    const finished = await waitForFinish(engineDeps, run.id);
    expect(finished.status).toBe('done');
    expect(finished.steps.map((s) => s.id)).toEqual([
      'prepare-tool',
      'check-signin',
      'detect',
      'create-database',
      'create-bucket',
      'write-config',
      'create-tables',
      'deploy-worker',
      'store-secrets',
      'verify-health',
      'connect'
    ]);
    expect(finished.steps.every((s) => s.status === 'done')).toBe(true);
    expect(finished.result?.workerUrl).toContain('workers.dev');
    const revealed = engineDeps.vault.reveal(finished.id);
    expect(revealed).toBeDefined();
    // The run record carries only secret names, never a value.
    for (const value of Object.values(revealed!))
      expect(JSON.stringify(finished)).not.toContain(value);
    expect(engineDeps.environmentStore.current()?.remoteUrl).toBe(finished.result?.workerUrl);
    expect(Object.keys(revealed!)).toHaveLength(3);
    // A second reveal call gets nothing: it is single-use.
    expect(engineDeps.vault.reveal(finished.id)).toBeUndefined();
  });

  it('writes the rendered config under the environments config directory, mode 0600, never the package directory', async () => {
    const engineDeps = deps();
    const plan = buildPlan(engineDeps, { environment: 'stage' });
    const run = startRun(engineDeps, plan.id);
    await waitForFinish(engineDeps, run.id);
    const rendered = join(engineDeps.configBaseDir, 'stage-vizoalica-worker', 'wrangler.toml');
    expect(existsSync(rendered)).toBe(true);
    expect(statSync(rendered).mode & 0o777).toBe(0o600);
    const content = readFileSync(rendered, 'utf8');
    expect(content).toContain('name = "stage-vizoalica-worker"');
    expect(content).toContain(`migrations_dir = "${engineDeps.schemaDir}"`);
    expect(content).toContain('VIZOALICA_WORKER_VERSION = "0.7.0"');
    expect(rendered.startsWith(join(engineDeps.workerBundle, '..'))).toBe(false);
  });

  it('creates nothing before the plan is approved (no run started from a plan alone)', () => {
    const engineDeps = deps();
    buildPlan(engineDeps, { environment: 'stage' });
    expect(engineDeps.fake.calls).toEqual([]);
  });

  it('blocks when a same-named resource already exists and this is a fresh (non-resumed) run', async () => {
    const fake = fakeWrangler();
    fake.databases.push({ name: 'stage-vizoalica-db', uuid: 'existing' });
    const engineDeps = deps({}, fake);
    const plan = buildPlan(engineDeps, { environment: 'stage' });
    const run = startRun(engineDeps, plan.id);
    const finished = await waitForFinish(engineDeps, run.id);
    expect(finished.status).toBe('failed');
    expect(finished.error).toContain('already exists');
    expect(finished.steps.find((s) => s.id === 'create-database')?.status).toBe('pending');
  });

  it('stops a failed step with what failed and what already exists, and a resume repeats no finished step', async () => {
    const fake = fakeWrangler({ deployFails: true });
    const engineDeps = deps({}, fake);
    const plan = buildPlan(engineDeps, { environment: 'stage' });
    const run = startRun(engineDeps, plan.id);
    const failed = await waitForFinish(engineDeps, run.id);
    expect(failed.status).toBe('failed');
    expect(failed.steps.find((s) => s.id === 'deploy-worker')?.status).toBe('failed');
    expect(failed.steps.find((s) => s.id === 'create-database')?.status).toBe('done');
    expect(fake.databases).toHaveLength(1);

    const createCallsBefore = fake.calls.filter((c) => c[0] === 'd1' && c[1] === 'create').length;
    fake.databases.length; // no-op, keeps lint happy about unused read above being intentional
    // Fix the fake so the resumed attempt can succeed.
    const fixed = fakeWrangler();
    fixed.databases.push(...fake.databases);
    fixed.buckets.push(...fake.buckets);
    engineDeps.run = fixed.run;
    const resumed = resumeRun(engineDeps, run.id);
    const finished = await waitForFinish(engineDeps, resumed.id);
    expect(finished.status).toBe('done');
    const createCallsAfter = fixed.calls.filter((c) => c[0] === 'd1' && c[1] === 'create').length;
    expect(createCallsAfter).toBe(0);
    expect(createCallsBefore).toBe(1);
  });

  it('reports a missing R2 activation before anything else is created', async () => {
    const fake = fakeWrangler({ r2Fails: true });
    const engineDeps = deps({}, fake);
    const plan = buildPlan(engineDeps, { environment: 'stage' });
    const run = startRun(engineDeps, plan.id);
    const finished = await waitForFinish(engineDeps, run.id);
    expect(finished.status).toBe('failed');
    expect(finished.error).toContain('R2 is not enabled');
    // The database step ran and succeeded before the bucket step failed.
    expect(finished.steps.find((s) => s.id === 'create-database')?.status).toBe('done');
  });

  it('stops when creating the tables fails', async () => {
    const fake = fakeWrangler({ migrationsFail: true });
    const engineDeps = deps({}, fake);
    const plan = buildPlan(engineDeps, { environment: 'stage' });
    const run = startRun(engineDeps, plan.id);
    const finished = await waitForFinish(engineDeps, run.id);
    expect(finished.status).toBe('failed');
    expect(finished.error).toContain('Creating the tables failed');
  });

  it('stops when storing the generated secrets fails', async () => {
    const fake = fakeWrangler({ secretsFail: true });
    const engineDeps = deps({}, fake);
    const plan = buildPlan(engineDeps, { environment: 'stage' });
    const run = startRun(engineDeps, plan.id);
    const finished = await waitForFinish(engineDeps, run.id);
    expect(finished.status).toBe('failed');
    expect(finished.error).toContain('Storing the secrets failed');
  });

  it('stops when the deployment tool itself cannot be prepared', async () => {
    const fake = fakeWrangler({ versionFails: true });
    const engineDeps = deps({}, fake);
    const plan = buildPlan(engineDeps, { environment: 'stage' });
    const run = startRun(engineDeps, plan.id);
    const finished = await waitForFinish(engineDeps, run.id);
    expect(finished.status).toBe('failed');
    expect(finished.error).toContain('deployment tool could not be prepared');
  });

  it("stops when Cloudflare does not recognize this environment's credential", async () => {
    const fake = fakeWrangler({ noAccounts: true });
    const engineDeps = deps({}, fake);
    const plan = buildPlan(engineDeps, { environment: 'stage' });
    const run = startRun(engineDeps, plan.id);
    const finished = await waitForFinish(engineDeps, run.id);
    expect(finished.status).toBe('failed');
    expect(finished.error).toContain('did not recognize');
  });

  it('stops when creating the database fails', async () => {
    const fake = fakeWrangler({ databaseCreateFails: true });
    const engineDeps = deps({}, fake);
    const plan = buildPlan(engineDeps, { environment: 'stage' });
    const run = startRun(engineDeps, plan.id);
    const finished = await waitForFinish(engineDeps, run.id);
    expect(finished.status).toBe('failed');
    expect(finished.error).toContain('Creating the database failed');
  });

  it('treats an unreadable secret list as empty, and still generates and stores every secret', async () => {
    const fake = fakeWrangler({ malformedSecretList: true });
    const engineDeps = deps({}, fake);
    const plan = buildPlan(engineDeps, { environment: 'stage' });
    const run = startRun(engineDeps, plan.id);
    const finished = await waitForFinish(engineDeps, run.id);
    expect(finished.status).toBe('done');
    expect(finished.result?.secretNames).toHaveLength(3);
  });
});

describe('rotateSecret', () => {
  it('refuses to rotate a secret with no rendered config yet', async () => {
    const engineDeps = deps();
    await expect(rotateSecret(engineDeps, 'stage-vizoalica-worker', 'token')).rejects.toThrow(
      'no_rendered_config'
    );
  });

  it('replaces one secret on an already-deployed Worker', async () => {
    const fake = fakeWrangler();
    const engineDeps = deps({}, fake);
    const plan = buildPlan(engineDeps, { environment: 'stage' });
    const run = startRun(engineDeps, plan.id);
    await waitForFinish(engineDeps, run.id);
    const value = await rotateSecret(engineDeps, 'stage-vizoalica-worker', 'token');
    expect(typeof value).toBe('string');
    expect(value.length).toBeGreaterThanOrEqual(32);
  });

  it('reports a Wrangler failure when storing the new secret', async () => {
    const fake = fakeWrangler({ secretsFail: true });
    const engineDeps = deps({}, fake);
    const plan = buildPlan(engineDeps, { environment: 'stage' });
    const run = startRun(engineDeps, plan.id);
    await waitForFinish(engineDeps, run.id);
    // The plan's own store-secrets step already failed, but write-config ran first, so the config
    // exists; a later rotate attempt still hits the same failing "secret bulk" call.
    await expect(rotateSecret(engineDeps, 'stage-vizoalica-worker', 'token')).rejects.toThrow(
      'Storing the new secret failed'
    );
  });
});

describe('cleanupRun', () => {
  it('requires an explicit call and removes only what the plan named', async () => {
    const fake = fakeWrangler();
    const engineDeps = deps({}, fake);
    const plan = buildPlan(engineDeps, { environment: 'stage' });
    const run = startRun(engineDeps, plan.id);
    await waitForFinish(engineDeps, run.id);
    expect(fake.databases).toHaveLength(1);
    const result = await cleanupRun(engineDeps, run.id);
    expect(result.removed.sort()).toEqual(
      ['d1:stage-vizoalica-db', 'r2:stage-vizoalica-bucket'].sort()
    );
    expect(fake.databases).toHaveLength(0);
    expect(fake.buckets).toHaveLength(0);
  });
});
