import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Run, RunResult } from '@vizoalica/ops-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRun, type EngineDeps } from '../src/deploy/engine.js';
import {
  buildUpdatePlan,
  pendingMigrations,
  previewUpdate,
  resumeUpdateRun,
  startUpdateRun
} from '../src/deploy/update.js';
import { RunStore } from '../src/deploy/runs.js';
import { SecretVault } from '../src/deploy/vault.js';
import { EnvironmentStore } from '../src/environment-store.js';

const ACCOUNT = { id: 'a'.repeat(32), name: 'Acme' };
const WORKER_URL = 'https://stage-vizoalica-worker.example.workers.dev';

/** A fake Wrangler covering only the update engine's steps: signing in, backing up, migrating, deploying. */
function fakeWrangler(
  options: {
    migrateFails?: boolean;
    deployFails?: boolean;
    versionFails?: boolean;
    noAccounts?: boolean;
  } = {}
) {
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
    if (command === 'd1' && args[1] === 'export') {
      const outputAt = args.indexOf('--output');
      const path = args[outputAt + 1]!;
      writeFileSync(path, '-- backup\n');
      return ok();
    }
    if (command === 'd1' && args[1] === 'migrations' && args[2] === 'apply')
      return options.migrateFails ? fail('migration failed') : ok('Applied 1 migrations');
    if (command === 'deploy')
      return options.deployFails ? fail('deploy failed') : ok(`Deployed to ${WORKER_URL}`);
    return ok();
  };
  return { run, calls };
}

/** A fake backend HTTP surface: `/v1/admin/backend` and `/v1/admin/whoami`, with mutable version state. */
function fakeBackend(initial: { workerVersion: string | null; schemaApplied: number | null }) {
  const state = { ...initial };
  const fetchImpl = vi.fn(async (input: string | URL) => {
    const url = new URL(input);
    if (url.pathname === '/v1/admin/backend')
      return Response.json({
        workerVersion: state.workerVersion,
        schema: { applied: state.schemaApplied, expected: state.schemaApplied, appliedNames: [] },
        health: { database: 'ok', storage: 'ok' }
      });
    if (url.pathname === '/v1/admin/whoami')
      return Response.json({
        role: 'admin',
        scope: { projectId: null, sourceId: null },
        keyLabel: null,
        workerVersion: state.workerVersion,
        features: { accessKeys: true, versions: true }
      });
    return new Response(null, { status: 404 });
  });
  return { fetchImpl, state };
}

const dir = () => mkdtempSync(join(tmpdir(), 'vizoalica-update-'));

function deps(
  options: {
    fake?: ReturnType<typeof fakeWrangler>;
    backend?: { workerVersion: string | null; schemaApplied: number | null };
    consoleVersion?: string;
    noRenderedConfig?: boolean;
  } = {}
): EngineDeps & { fake: ReturnType<typeof fakeWrangler>; backend: ReturnType<typeof fakeBackend> } {
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
  writeFileSync(
    join(schemaDir, '0001_init.sql'),
    '-- creates the base tables\nCREATE TABLE a(x);\n'
  );
  writeFileSync(
    join(schemaDir, '0002_add_widgets.sql'),
    '-- adds the widgets table\nCREATE TABLE widgets(id);\n'
  );

  const environmentStore = EnvironmentStore.fromDirectory(join(base, 'home'));
  environmentStore.create('stage', { mode: 'token', token: 'cf-tok' });
  environmentStore.save({
    remoteUrl: WORKER_URL,
    credential: 'the-admin-secret',
    kind: 'admin-secret'
  });

  // A rendered config as a prior deploy would have left it, so the update engine has one to reuse.
  const configBaseDir = join(base, 'home', 'deploy');
  if (!options.noRenderedConfig) {
    const renderedDir = join(configBaseDir, 'stage-vizoalica-worker');
    mkdirSync(renderedDir, { recursive: true, mode: 0o700 });
    writeFileSync(
      join(renderedDir, 'wrangler.toml'),
      [
        'name = "stage-vizoalica-worker"',
        'main = "index.mjs"',
        'no_bundle = true',
        'compatibility_date = "2026-08-29"',
        '[[d1_databases]]',
        'binding = "VIZOALICA_DB"',
        'database_name = "stage-vizoalica-db"',
        'database_id = "stage-db-uuid"',
        'migrations_dir = "x"',
        '[[r2_buckets]]',
        'binding = "VIZOALICA_EVENTS"',
        'bucket_name = "stage-vizoalica-bucket"',
        '[vars]',
        'VIZOALICA_WORKER_VERSION = "0.6.2"'
      ].join('\n'),
      { mode: 0o600 }
    );
  }

  const fake = options.fake ?? fakeWrangler();
  const backend = fakeBackend(options.backend ?? { workerVersion: '0.6.2', schemaApplied: 1 });
  vi.stubGlobal('fetch', backend.fetchImpl);

  return {
    configBaseDir,
    workerBundle: join(workerDir, 'index.mjs'),
    wranglerTemplate: join(workerDir, 'wrangler.template.toml'),
    schemaDir,
    consoleVersion: options.consoleVersion ?? '0.7.0',
    store: new RunStore(join(base, 'home', 'deployments')),
    vault: new SecretVault(),
    environmentStore,
    run: fake.run,
    fake,
    backend
  };
}

async function waitForFinish(engineDeps: Pick<EngineDeps, 'store'>, runId: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const run = getRun(engineDeps, runId);
    if (run && run.status !== 'running') return run;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('run did not finish in time');
}

beforeEach(() => vi.useRealTimers());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('pendingMigrations', () => {
  it('lists only migrations above the applied version, in order, with their plain description', () => {
    const schemaDir = join(dir(), 'schema');
    mkdirSync(schemaDir, { recursive: true });
    writeFileSync(join(schemaDir, '0001_init.sql'), '-- creates the base tables\n');
    writeFileSync(join(schemaDir, '0002_add_widgets.sql'), '-- adds the widgets table\n');
    writeFileSync(
      join(schemaDir, '0003_drop_column.sql'),
      '-- drops an old column\n-- vizoalica:non-additive\n'
    );
    expect(pendingMigrations(schemaDir, 1)).toEqual([
      { name: '0002_add_widgets.sql', description: 'adds the widgets table', nonAdditive: false },
      { name: '0003_drop_column.sql', description: 'drops an old column', nonAdditive: true }
    ]);
    expect(pendingMigrations(schemaDir, null)).toHaveLength(3);
  });
});

describe('previewUpdate', () => {
  it('reports the Worker and schema versions and every pending migration, without changing anything', async () => {
    const engineDeps = deps();
    const preview = await previewUpdate(engineDeps);
    expect(preview.environment).toBe('stage');
    expect(preview.worker).toEqual({
      current: '0.6.2',
      expected: '0.7.0',
      status: 'update-available',
      message: expect.stringContaining('older')
    });
    expect(preview.schema.applied).toBe(1);
    expect(preview.schema.expected).toBe(2);
    expect(preview.pending.map((m) => m.name)).toEqual(['0002_add_widgets.sql']);
    expect(preview.upToDate).toBe(false);
    expect(engineDeps.fake.calls).toEqual([]);
  });

  it('reports up to date once the Worker and schema both match this console', async () => {
    const engineDeps = deps({ backend: { workerVersion: '0.7.0', schemaApplied: 2 } });
    const preview = await previewUpdate(engineDeps);
    expect(preview.upToDate).toBe(true);
    expect(preview.pending).toEqual([]);
  });

  it('refuses when there is no active, connected environment', async () => {
    const engineDeps = deps();
    const bare = EnvironmentStore.fromDirectory(mkdtempSync(join(tmpdir(), 'vizoalica-update-')));
    await expect(previewUpdate({ ...engineDeps, environmentStore: bare })).rejects.toThrow(
      'backend_not_connected'
    );
  });
});

describe('buildUpdatePlan', () => {
  it('carries the environment, reused names, and the update preview, and creates nothing', async () => {
    const engineDeps = deps();
    const plan = await buildUpdatePlan(engineDeps);
    expect(plan.mode).toBe('update-backend');
    expect(plan.environment).toBe('stage');
    expect(plan.names).toEqual({
      worker: 'stage-vizoalica-worker',
      database: 'stage-vizoalica-db',
      bucket: 'stage-vizoalica-bucket'
    });
    expect(plan.update?.pending.map((m) => m.name)).toEqual(['0002_add_widgets.sql']);
    expect(engineDeps.store.loadPlan(plan.id)).toEqual(plan);
    expect(engineDeps.fake.calls).toEqual([]);
  });

  it('refuses when this environment has no rendered config yet', async () => {
    const engineDeps = deps({ noRenderedConfig: true });
    await expect(buildUpdatePlan(engineDeps)).rejects.toThrow('no_rendered_config');
  });

  it('refuses when no environment is active', async () => {
    const engineDeps = deps();
    // No environment created at all: `active()` is undefined.
    const bare = EnvironmentStore.fromDirectory(mkdtempSync(join(tmpdir(), 'vizoalica-update-')));
    await expect(buildUpdatePlan({ ...engineDeps, environmentStore: bare })).rejects.toThrow(
      'no_active_environment'
    );
  });
});

describe('an update run', () => {
  it('backs up, migrates, redeploys, and records the before/after versions', async () => {
    const engineDeps = deps();
    const plan = await buildUpdatePlan(engineDeps);
    const run = startUpdateRun(engineDeps, plan.id);
    // The migrate/deploy-worker steps look "current" until the fake backend reports the new version,
    // so flip it the moment the deploy actually happens (mirroring what a real redeploy would do).
    const finished = await waitForFinish(engineDeps, run.id);
    expect(finished.status).toBe('done');
    expect(finished.steps.map((s) => s.id)).toEqual([
      'prepare-tool',
      'check-signin',
      'read-versions',
      'backup',
      'migrate',
      'deploy-worker',
      'verify',
      'record'
    ]);
    expect(finished.steps.every((s) => s.status === 'done' || s.status === 'skipped')).toBe(true);
    expect(engineDeps.fake.calls.some((c) => c[0] === 'd1' && c[1] === 'export')).toBe(true);
    expect(engineDeps.fake.calls.some((c) => c[0] === 'd1' && c[1] === 'migrations')).toBe(true);
    expect(engineDeps.fake.calls.some((c) => c[0] === 'deploy')).toBe(true);
    expect(finished.versions?.before).toEqual({ worker: '0.6.2', schema: 1 });
    expect(finished.versions?.migrationsApplied).toEqual(['0002_add_widgets.sql']);
    expect(finished.versions?.backupPath).toBeDefined();
    expect(existsSync(finished.versions!.backupPath!)).toBe(true);
    expect(statSync(finished.versions!.backupPath!).mode & 0o777).toBe(0o600);
    const rendered = join(engineDeps.configBaseDir, 'stage-vizoalica-worker', 'wrangler.toml');
    expect(readFileSync(rendered, 'utf8')).toContain('VIZOALICA_WORKER_VERSION = "0.7.0"');
  });

  it('skips backup, migrate, and deploy when already up to date', async () => {
    const engineDeps = deps({ backend: { workerVersion: '0.7.0', schemaApplied: 2 } });
    const plan = await buildUpdatePlan(engineDeps);
    const run = startUpdateRun(engineDeps, plan.id);
    const finished = await waitForFinish(engineDeps, run.id);
    expect(finished.status).toBe('done');
    expect(finished.steps.find((s) => s.id === 'backup')?.status).toBe('skipped');
    expect(finished.steps.find((s) => s.id === 'migrate')?.status).toBe('skipped');
    expect(finished.steps.find((s) => s.id === 'deploy-worker')?.status).toBe('skipped');
    expect(engineDeps.fake.calls.some((c) => c[0] === 'd1' && c[1] === 'export')).toBe(false);
    expect(engineDeps.fake.calls.some((c) => c[0] === 'deploy')).toBe(false);
  });

  it('honors an explicit skip of the backup, for a purely additive pending change', async () => {
    const engineDeps = deps();
    const plan = await buildUpdatePlan(engineDeps);
    const run = startUpdateRun(engineDeps, plan.id, { skipBackup: { confirm: true } });
    const finished = await waitForFinish(engineDeps, run.id);
    expect(finished.status).toBe('done');
    expect(finished.steps.find((s) => s.id === 'backup')?.status).toBe('skipped');
    expect(finished.versions?.backupDeclined).toBe(true);
    expect(engineDeps.fake.calls.some((c) => c[0] === 'd1' && c[1] === 'export')).toBe(false);
  });

  it('refuses to skip the backup when a pending change is not purely additive', async () => {
    const engineDeps = deps();
    writeFileSync(
      join(engineDeps.schemaDir, '0003_drop_column.sql'),
      '-- drops an old column\n-- vizoalica:non-additive\n'
    );
    const plan = await buildUpdatePlan(engineDeps);
    const run = startUpdateRun(engineDeps, plan.id, { skipBackup: { confirm: true } });
    const finished = await waitForFinish(engineDeps, run.id);
    expect(finished.status).toBe('failed');
    expect(finished.error).toContain('not purely additive');
  });

  it('refuses to run against a backend newer than this console', async () => {
    const engineDeps = deps({
      backend: { workerVersion: '9.9.9', schemaApplied: 1 },
      consoleVersion: '0.7.0'
    });
    const plan = await buildUpdatePlan(engineDeps);
    const run = startUpdateRun(engineDeps, plan.id);
    const finished = await waitForFinish(engineDeps, run.id);
    expect(finished.status).toBe('failed');
    expect(finished.error).toContain('newer than this console');
  });

  it('stops on a failed migration and a resume repeats no step already done', async () => {
    const fake = fakeWrangler({ migrateFails: true });
    const engineDeps = deps({ fake });
    const plan = await buildUpdatePlan(engineDeps);
    const run = startUpdateRun(engineDeps, plan.id);
    const failed = await waitForFinish(engineDeps, run.id);
    expect(failed.status).toBe('failed');
    expect(failed.steps.find((s) => s.id === 'migrate')?.status).toBe('failed');
    expect(failed.steps.find((s) => s.id === 'backup')?.status).toBe('done');

    const fixed = fakeWrangler();
    engineDeps.run = fixed.run;
    const resumed = resumeUpdateRun(engineDeps, run.id);
    const finished = await waitForFinish(engineDeps, resumed.id);
    expect(finished.status).toBe('done');
    expect(fixed.calls.some((c) => c[0] === 'd1' && c[1] === 'migrations')).toBe(true);
  });

  it('stops when the deployment tool cannot be prepared', async () => {
    const engineDeps = deps({ fake: fakeWrangler({ versionFails: true }) });
    const plan = await buildUpdatePlan(engineDeps);
    const run = startUpdateRun(engineDeps, plan.id);
    const finished = await waitForFinish(engineDeps, run.id);
    expect(finished.status).toBe('failed');
    expect(finished.error).toContain('deployment tool could not be prepared');
  });

  it("stops when Cloudflare does not recognize this environment's credential", async () => {
    const engineDeps = deps({ fake: fakeWrangler({ noAccounts: true }) });
    const plan = await buildUpdatePlan(engineDeps);
    const run = startUpdateRun(engineDeps, plan.id);
    const finished = await waitForFinish(engineDeps, run.id);
    expect(finished.status).toBe('failed');
    expect(finished.error).toContain('did not recognize');
  });

  it('refuses an unsupported schema, older than this console can update in place', async () => {
    const engineDeps = deps({ backend: { workerVersion: '0.7.0', schemaApplied: 0 } });
    const plan = await buildUpdatePlan(engineDeps);
    const run = startUpdateRun(engineDeps, plan.id);
    const finished = await waitForFinish(engineDeps, run.id);
    expect(finished.status).toBe('failed');
    expect(finished.error).toContain('Set up a new backend instead');
  });

  it('refuses to resume a run that has not failed', async () => {
    const engineDeps = deps();
    const plan = await buildUpdatePlan(engineDeps);
    const run = startUpdateRun(engineDeps, plan.id);
    await waitForFinish(engineDeps, run.id);
    expect(() => resumeUpdateRun(engineDeps, run.id)).toThrow('run_not_resumable');
  });

  it('refuses to resume or start against an unknown run or plan', () => {
    const engineDeps = deps();
    expect(() => resumeUpdateRun(engineDeps, 'ghost')).toThrow('run_not_found');
    expect(() => startUpdateRun(engineDeps, 'ghost')).toThrow('plan_not_found');
  });
});
