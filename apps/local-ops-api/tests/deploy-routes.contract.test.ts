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
      'bucket_name = "__BUCKET_NAME__"'
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
    expect(result.body).toMatchObject({ error: 'backend_deploy_unavailable' });
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
});
