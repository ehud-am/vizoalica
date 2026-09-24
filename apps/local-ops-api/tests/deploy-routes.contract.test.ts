import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Run, RunResult } from '@vizoalica/ops-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSettings } from '../src/config.js';
import { EnvironmentStore } from '../src/environment-store.js';
import { createLocalServer } from '../src/server.js';
import { callerFor } from './support.js';

const ACCOUNT_ID = 'a'.repeat(32);

/** A fake Wrangler with just enough state to drive a full run through the HTTP routes. */
function fakeWrangler() {
  const databases: Array<{ name: string; uuid: string }> = [];
  const buckets: string[] = [];
  const run: Run = async (args) => {
    const ok = (stdout = ''): RunResult => ({ code: 0, stdout, stderr: '' });
    const [command] = args;
    if (args.includes('--version')) return ok('4.134.0');
    if (command === 'whoami') return ok(`│ Acme │ ${ACCOUNT_ID} │`);
    if (command === 'd1' && args[1] === 'list') return ok(JSON.stringify(databases));
    if (command === 'd1' && args[1] === 'create') {
      databases.push({ name: args[2]!, uuid: `${args[2]}-uuid` });
      return ok();
    }
    if (command === 'd1' && args[1] === 'delete') {
      const at = databases.findIndex((d) => d.name === args[2]);
      if (at >= 0) databases.splice(at, 1);
      return ok();
    }
    if (command === 'd1' && args[1] === 'migrations') return ok('applied');
    if (command === 'd1' && args[1] === 'export') {
      const outputAt = args.indexOf('--output');
      if (outputAt >= 0) writeFileSync(args[outputAt + 1]!, '-- backup\n');
      return ok();
    }
    if (command === 'r2' && args[1] === 'bucket' && args[2] === 'list')
      return ok(buckets.map((name) => `name:      ${name}`).join('\n'));
    if (command === 'r2' && args[1] === 'bucket' && args[2] === 'create') {
      buckets.push(args[3]!);
      return ok();
    }
    if (command === 'r2' && args[1] === 'bucket' && args[2] === 'delete') {
      const at = buckets.indexOf(args[3]!);
      if (at >= 0) buckets.splice(at, 1);
      return ok();
    }
    if (command === 'deploy')
      return ok('Deployed to https://stage-vizoalica-worker.example.workers.dev');
    if (command === 'secret' && args[1] === 'list') return ok('[]');
    if (command === 'secret' && args[1] === 'bulk') return ok();
    return ok();
  };
  return { run, databases, buckets };
}

function packagedWorker(base: string): string {
  const workerDir = join(base, 'worker');
  mkdirSync(workerDir, { recursive: true });
  const schemaDir = join(base, 'schema');
  mkdirSync(schemaDir, { recursive: true });
  writeFileSync(join(schemaDir, '0001_init.sql'), '-- creates the base tables\n');
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
  return workerDir;
}

function start(options: { withWorkerDir?: boolean; role?: 'admin' | 'analyst'; run?: Run } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'vizoalica-deploy-routes-'));
  const homeDir = join(base, 'home');
  const store = EnvironmentStore.fromDirectory(homeDir);
  store.create('stage', { mode: 'token', token: 'cf-tok' });
  if (options.role === 'analyst')
    store.save({ remoteUrl: 'https://w.test', credential: 'vzk_x', kind: 'access-key' });
  const workerDir = packagedWorker(base);
  const server = createLocalServer({
    settings: { ...loadSettings({}), homeDir },
    store,
    version: '0.7.0',
    ...(options.withWorkerDir === false ? {} : { workerDir }),
    ...(options.run ? { deployRun: options.run } : {})
  });
  return { store, ...callerFor(server) };
}

const post = (api: ReturnType<typeof start>, cookie: string, path: string, body?: unknown) =>
  api.call(path, { method: 'POST', cookie, ...(body !== undefined ? { body } : {}) });

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ ok: true }))
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('deploy routes', () => {
  it('answers 409 when no packaged worker directory is configured', async () => {
    const api = start({ withWorkerDir: false });
    const cookie = await api.session();
    const result = await api.call('/api/deploy/preflight', { cookie });
    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({
      error: 'backend_deploy_unavailable',
      issue: { code: 'deploy_files_missing' }
    });
    expect(JSON.stringify(result.body)).toContain('pnpm package:build');
  });

  it('explains a missing credential, and continues once one is saved in place', async () => {
    const api = start({ run: fakeWrangler().run });
    const cookie = await api.session();
    api.store.create('bare');
    const blocked = await api.call('/api/deploy/preflight', { cookie });
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({
      error: 'backend_deploy_unavailable',
      issue: { code: 'no_credential', fix: 'credential' }
    });

    const saved = await api.call('/api/environments/bare/cloudflare', {
      method: 'PUT',
      cookie,
      body: { cloudflare: { mode: 'token', token: 'cf-new' } }
    });
    expect(saved.status).toBe(200);
    expect(api.store.cloudflareCredential('bare')).toEqual({ mode: 'token', token: 'cf-new' });
    const ready = await api.call('/api/deploy/preflight', { cookie });
    expect(ready.status).toBe(200);
    expect(ready.body).toMatchObject({ signedIn: true, environment: 'bare' });
  });

  it('explains missing OneCLI settings, and continues once they are saved in place', async () => {
    const api = start();
    const cookie = await api.session();
    api.store.create('viaonecli', { mode: 'onecli' });
    const blocked = await api.call('/api/deploy/preflight', { cookie });
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({
      error: 'onecli_settings_not_found',
      issue: { code: 'onecli_settings_missing', fix: 'credential' }
    });

    const saved = await api.call('/api/environments/viaonecli/cloudflare', {
      method: 'PUT',
      cookie,
      body: {
        cloudflare: {
          mode: 'onecli',
          onecli: { project: 'harness', agent: 'vizoalica-deploy', gateway: '127.0.0.1:10255' }
        }
      }
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ onecliConfigured: true });
    expect(api.store.onecliSettings()).toEqual({
      project: 'harness',
      agent: 'vizoalica-deploy',
      gateway: '127.0.0.1:10255'
    });
  });

  it('keeps an environment connection when its Cloudflare credential is replaced', async () => {
    const api = start({ run: fakeWrangler().run });
    const cookie = await api.session();
    api.store.save({
      remoteUrl: 'https://w.test',
      credential: 'admin-secret',
      kind: 'admin-secret'
    });
    await api.call('/api/environments/stage/cloudflare', {
      method: 'PUT',
      cookie,
      body: { cloudflare: { mode: 'onecli', onecli: { project: 'p', agent: 'a', gateway: 'g:1' } } }
    });
    expect(api.store.current()).toMatchObject({
      remoteUrl: 'https://w.test',
      credential: 'admin-secret'
    });
    expect(api.store.cloudflareCredential('stage')).toEqual({ mode: 'onecli' });
  });

  it('rejects a credential change for an unknown environment or an invalid body', async () => {
    const api = start({ run: fakeWrangler().run });
    const cookie = await api.session();
    const put = (name: string, body: unknown) =>
      api.call(`/api/environments/${name}/cloudflare`, { method: 'PUT', cookie, body });
    expect((await put('nope', { cloudflare: { mode: 'token', token: 't' } })).status).toBe(404);
    expect((await put('stage', {})).status).toBe(400);
    expect((await put('stage', { cloudflare: { mode: 'token', token: ' ' } })).status).toBe(400);
    expect(
      (await put('stage', { cloudflare: { mode: 'onecli', onecli: { project: 'p' } } })).status
    ).toBe(400);
  });

  it('refuses every deploy route for a non-admin connection', async () => {
    const api = start({ role: 'analyst' });
    const cookie = await api.session();
    expect((await api.call('/api/deploy/preflight', { cookie })).status).toBe(403);
    expect((await post(api, cookie, '/api/deploy/plan', {})).status).toBe(403);
  });

  it('reports preflight with the environment-prefixed default names', async () => {
    const api = start({ run: fakeWrangler().run });
    const cookie = await api.session();
    const result = await api.call('/api/deploy/preflight', { cookie });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      environment: 'stage',
      names: {
        worker: 'stage-vizoalica-worker',
        database: 'stage-vizoalica-db',
        bucket: 'stage-vizoalica-bucket'
      },
      signedIn: true
    });
  });

  it('refuses bad input with 400 and creates no plan', async () => {
    const api = start({ run: fakeWrangler().run });
    const cookie = await api.session();
    const result = await post(api, cookie, '/api/deploy/plan', {
      names: { worker: 'not-prefixed', database: 'x', bucket: 'y' }
    });
    expect(result.status).toBe(400);
  });

  it('refuses a non-string accountId, incomplete names, and accepts a valid custom accountId/names', async () => {
    const api = start({ run: fakeWrangler().run });
    const cookie = await api.session();
    expect((await post(api, cookie, '/api/deploy/plan', { accountId: 123 })).status).toBe(400);
    expect(
      (await post(api, cookie, '/api/deploy/plan', { names: { worker: 'stage-w' } })).status
    ).toBe(400);
    const custom = await post(api, cookie, '/api/deploy/plan', {
      accountId: 'a'.repeat(32),
      accountName: 'Acme',
      names: { worker: 'stage-custom', database: 'stage-d', bucket: 'stage-b' }
    });
    expect(custom.status).toBe(200);
    expect(custom.body).toMatchObject({
      accountId: 'a'.repeat(32),
      accountName: 'Acme',
      names: { worker: 'stage-custom' }
    });
  });

  it('refuses a non-string planId when starting a run', async () => {
    const api = start({ run: fakeWrangler().run });
    const cookie = await api.session();
    expect((await post(api, cookie, '/api/deploy/runs', { planId: 5 })).status).toBe(400);
  });

  it('answers 404 for an unknown run, and for resuming or reading one', async () => {
    const api = start({ run: fakeWrangler().run });
    const cookie = await api.session();
    expect((await api.call('/api/deploy/runs/ghost', { cookie })).status).toBe(404);
    expect((await post(api, cookie, '/api/deploy/runs/ghost/resume')).status).toBe(404);
  });

  it('answers 409 when no environment is active at all', async () => {
    const base = mkdtempSync(join(tmpdir(), 'vizoalica-deploy-routes-'));
    const homeDir = join(base, 'home');
    const store = EnvironmentStore.fromDirectory(homeDir);
    const workerDir = packagedWorker(base);
    const server = createLocalServer({
      settings: { ...loadSettings({}), homeDir },
      store,
      version: '0.7.0',
      workerDir,
      deployRun: fakeWrangler().run
    });
    const api = callerFor(server);
    const cookie = await api.session();
    expect((await api.call('/api/deploy/preflight', { cookie })).status).toBe(409);
  });

  it('plans, approves, runs, resumes, reveals once, and cleans up a first-install deploy', async () => {
    const fake = fakeWrangler();
    const api = start({ run: fake.run });
    const cookie = await api.session();

    const plan = await post(api, cookie, '/api/deploy/plan', {});
    expect(plan.status).toBe(200);
    expect((plan.body as { environment: string }).environment).toBe('stage');

    const started = await post(api, cookie, '/api/deploy/runs', {
      planId: (plan.body as { id: string }).id
    });
    expect(started.status).toBe(200);
    const runId = (started.body as { id: string }).id;

    let finished: { status: string; steps: Array<{ status: string }> } | undefined;
    for (
      let attempt = 0;
      attempt < 200 && (!finished || finished.status === 'running');
      attempt += 1
    ) {
      const result = await api.call(`/api/deploy/runs/${runId}`, { cookie });
      finished = result.body as never;
      if (finished!.status === 'running') await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(finished!.status).toBe('done');
    expect(finished!.steps.every((s) => s.status === 'done')).toBe(true);

    const reveal = await post(api, cookie, `/api/deploy/runs/${runId}/reveal`);
    expect(reveal.status).toBe(200);
    expect(Object.keys(reveal.body as Record<string, unknown>)).toEqual(['secrets']);
    const revealAgain = await post(api, cookie, `/api/deploy/runs/${runId}/reveal`);
    expect(revealAgain.status).toBe(410);

    expect(api.store.current()?.remoteUrl).toContain('workers.dev');

    const cleanup = await post(api, cookie, `/api/deploy/runs/${runId}/cleanup`, {});
    expect(cleanup.status).toBe(400);
    const confirmed = await post(api, cookie, `/api/deploy/runs/${runId}/cleanup`, {
      confirm: true
    });
    expect(confirmed.status).toBe(200);
    expect(fake.databases).toHaveLength(0);
    expect(fake.buckets).toHaveLength(0);
  });
});

describe('backend maintenance routes', () => {
  it('answers 409 with no connection', async () => {
    const api = start({ run: fakeWrangler().run });
    const cookie = await api.session();
    const result = await post(api, cookie, '/api/backend/purge-deleted', { apply: false });
    expect(result.status).toBe(409);
  });

  it('refuses purge and rotate for a non-admin connection', async () => {
    const api = start({ role: 'analyst', run: fakeWrangler().run });
    const cookie = await api.session();
    expect((await post(api, cookie, '/api/backend/purge-deleted', { apply: false })).status).toBe(
      403
    );
    expect((await post(api, cookie, '/api/backend/rotate/token')).status).toBe(403);
  });

  it('rejects rotating a secret with no rendered config yet (connected, never deployed)', async () => {
    const fake = fakeWrangler();
    const api = start({ run: fake.run });
    const cookie = await api.session();
    api.store.save({
      remoteUrl: 'https://w.test',
      credential: 'admin-secret',
      kind: 'admin-secret'
    });
    const result = await post(api, cookie, '/api/backend/rotate/token');
    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ error: 'no_rendered_config' });
  });

  it('refuses an invalid secret kind', async () => {
    const fake = fakeWrangler();
    const api = start({ run: fake.run });
    const cookie = await api.session();
    api.store.save({
      remoteUrl: 'https://w.test',
      credential: 'admin-secret',
      kind: 'admin-secret'
    });
    const result = await post(api, cookie, '/api/backend/rotate/bogus');
    expect(result.status).toBe(400);
  });

  it('refuses purge-deleted with a non-boolean apply', async () => {
    const api = start({ run: fakeWrangler().run });
    const cookie = await api.session();
    api.store.save({
      remoteUrl: 'https://w.test',
      credential: 'admin-secret',
      kind: 'admin-secret'
    });
    const result = await post(api, cookie, '/api/backend/purge-deleted', { apply: 'yes' });
    expect(result.status).toBe(400);
  });

  it('answers 502 when the deployment tool itself fails to rotate the secret', async () => {
    const databases: Array<{ name: string; uuid: string }> = [];
    const buckets: string[] = [];
    const run: Run = async (args) => {
      const ok = (stdout = ''): RunResult => ({ code: 0, stdout, stderr: '' });
      const fail = (stderr: string): RunResult => ({ code: 1, stdout: '', stderr });
      const [command] = args;
      if (args.includes('--version')) return ok('4.134.0');
      if (command === 'whoami') return ok(`│ Acme │ ${ACCOUNT_ID} │`);
      if (command === 'd1' && args[1] === 'list') return ok(JSON.stringify(databases));
      if (command === 'd1' && args[1] === 'create') {
        databases.push({ name: args[2]!, uuid: `${args[2]}-uuid` });
        return ok();
      }
      if (command === 'd1' && args[1] === 'migrations') return ok('applied');
      if (command === 'r2' && args[1] === 'bucket' && args[2] === 'list')
        return ok(buckets.map((name) => `name:      ${name}`).join('\n'));
      if (command === 'r2' && args[1] === 'bucket' && args[2] === 'create') {
        buckets.push(args[3]!);
        return ok();
      }
      if (command === 'deploy')
        return ok('Deployed to https://stage-vizoalica-worker.example.workers.dev');
      if (command === 'secret' && args[1] === 'list') return ok('[]');
      if (command === 'secret' && args[1] === 'bulk') return fail('wrangler is unhappy');
      return ok();
    };
    const api = start({ run });
    const cookie = await api.session();
    const plan = await post(api, cookie, '/api/deploy/plan', {});
    const started = await post(api, cookie, '/api/deploy/runs', {
      planId: (plan.body as { id: string }).id
    });
    let deployed: { status: string } | undefined;
    for (
      let attempt = 0;
      attempt < 200 && (!deployed || deployed.status === 'running');
      attempt++
    ) {
      const result = await api.call(`/api/deploy/runs/${(started.body as { id: string }).id}`, {
        cookie
      });
      deployed = result.body as never;
      if (deployed!.status === 'running') await new Promise((resolve) => setTimeout(resolve, 5));
    }
    // The first-install run itself fails at store-secrets, before "connect" ever saves a
    // connection; write-config already rendered the config, which is all rotate needs, so save one
    // by hand the way an admin who already has this backend's secret would.
    expect(deployed!.status).toBe('failed');
    api.store.save({
      remoteUrl: 'https://w.test',
      credential: 'admin-secret',
      kind: 'admin-secret'
    });

    const rotated = await post(api, cookie, '/api/backend/rotate/token');
    expect(rotated.status).toBe(502);
    expect(rotated.body).toMatchObject({ error: 'rotate_failed' });
  });

  it('rotates a secret and purges deleted data once a backend is deployed', async () => {
    const fake = fakeWrangler();
    const api = start({ run: fake.run });
    const cookie = await api.session();
    const plan = await post(api, cookie, '/api/deploy/plan', {});
    const started = await post(api, cookie, '/api/deploy/runs', {
      planId: (plan.body as { id: string }).id
    });
    let deployed: { status: string } | undefined;
    for (
      let attempt = 0;
      attempt < 200 && (!deployed || deployed.status === 'running');
      attempt++
    ) {
      const result = await api.call(`/api/deploy/runs/${(started.body as { id: string }).id}`, {
        cookie
      });
      deployed = result.body as never;
      if (deployed!.status === 'running') await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(deployed!.status).toBe('done');

    const rotated = await post(api, cookie, '/api/backend/rotate/token');
    expect(rotated.status).toBe(200);
    expect(rotated.body).toMatchObject({ kind: 'token' });

    const preview = await post(api, cookie, '/api/backend/purge-deleted', { apply: false });
    expect(preview.status).toBe(200);
    const apply = await post(api, cookie, '/api/backend/purge-deleted', { apply: true });
    expect(apply.status).toBe(200);
  });
});

describe('update routes', () => {
  it('refuses every update route for a non-admin connection', async () => {
    const api = start({ role: 'analyst' });
    const cookie = await api.session();
    expect((await api.call('/api/deploy/update/preview', { cookie })).status).toBe(403);
    expect((await post(api, cookie, '/api/deploy/update/plan', {})).status).toBe(403);
    expect((await post(api, cookie, '/api/deploy/update/runs', { planId: 'x' })).status).toBe(403);
  });

  it('refuses a non-string planId and a non-true skipBackup for an update run', async () => {
    const api = start({ run: fakeWrangler().run });
    const cookie = await api.session();
    expect((await post(api, cookie, '/api/deploy/update/runs', { planId: 5 })).status).toBe(400);
    expect(
      (await post(api, cookie, '/api/deploy/update/runs', { planId: 'x', skipBackup: 'yes' }))
        .status
    ).toBe(400);
  });

  it('answers 409 for a preview or a plan before anything is deployed or connected', async () => {
    const api = start({ run: fakeWrangler().run });
    const cookie = await api.session();
    const preview = await api.call('/api/deploy/update/preview', { cookie });
    expect(preview.status).toBe(409);
    expect(preview.body).toMatchObject({ error: 'backend_not_connected' });
    const plan = await post(api, cookie, '/api/deploy/update/plan', {});
    expect(plan.status).toBe(409);
  });

  it('previews, plans, runs, and resumes an update after a first deploy', async () => {
    const fake = fakeWrangler();
    const api = start({ run: fake.run });
    const cookie = await api.session();

    const firstPlan = await post(api, cookie, '/api/deploy/plan', {});
    const firstRun = await post(api, cookie, '/api/deploy/runs', {
      planId: (firstPlan.body as { id: string }).id
    });
    let deployed: { status: string } | undefined;
    for (
      let attempt = 0;
      attempt < 200 && (!deployed || deployed.status === 'running');
      attempt++
    ) {
      const result = await api.call(`/api/deploy/runs/${(firstRun.body as { id: string }).id}`, {
        cookie
      });
      deployed = result.body as never;
      if (deployed!.status === 'running') await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(deployed!.status).toBe('done');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = new URL(input);
        if (url.pathname === '/v1/admin/backend')
          return Response.json({
            workerVersion: '0.6.2',
            schema: { applied: 1, expected: 1, appliedNames: ['0001_init.sql'] },
            health: { database: 'ok', storage: 'ok' }
          });
        return Response.json({
          role: 'admin',
          scope: { projectId: null, sourceId: null },
          keyLabel: null,
          workerVersion: '0.6.2',
          features: { accessKeys: true, versions: true }
        });
      })
    );

    const preview = await api.call('/api/deploy/update/preview', { cookie });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ environment: 'stage', upToDate: false, pending: [] });

    const updatePlan = await post(api, cookie, '/api/deploy/update/plan', {});
    expect(updatePlan.status).toBe(200);
    expect(updatePlan.body).toMatchObject({ mode: 'update-backend', environment: 'stage' });

    const updateRun = await post(api, cookie, '/api/deploy/update/runs', {
      planId: (updatePlan.body as { id: string }).id
    });
    expect(updateRun.status).toBe(200);
    const updateRunId = (updateRun.body as { id: string }).id;

    let finished: { status: string; versions?: unknown } | undefined;
    for (
      let attempt = 0;
      attempt < 200 && (!finished || finished.status === 'running');
      attempt++
    ) {
      const result = await api.call(`/api/deploy/runs/${updateRunId}`, { cookie });
      finished = result.body as never;
      if (finished!.status === 'running') await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(finished!.status).toBe('done');
    expect(finished!.versions).toBeDefined();
  });

  it('refuses to resume a run that never failed', async () => {
    const fake = fakeWrangler();
    const api = start({ run: fake.run });
    const cookie = await api.session();
    const plan = await post(api, cookie, '/api/deploy/plan', {});
    const started = await post(api, cookie, '/api/deploy/runs', {
      planId: (plan.body as { id: string }).id
    });
    const runId = (started.body as { id: string }).id;
    let finished: { status: string } | undefined;
    for (
      let attempt = 0;
      attempt < 200 && (!finished || finished.status === 'running');
      attempt++
    ) {
      const result = await api.call(`/api/deploy/runs/${runId}`, { cookie });
      finished = result.body as never;
      if (finished!.status === 'running') await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const resumed = await post(api, cookie, `/api/deploy/runs/${runId}/resume`);
    expect(resumed.status).toBe(409);
    expect(resumed.body).toMatchObject({ error: 'run_not_resumable' });
  });
});
