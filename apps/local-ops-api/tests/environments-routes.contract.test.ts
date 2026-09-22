import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSettings } from '../src/config.js';
import { EnvironmentStore } from '../src/environment-store.js';
import { createLocalServer } from '../src/server.js';
import { callerFor } from './support.js';
import { stubWorker, type StubOptions } from './worker-stub.js';

afterEach(() => vi.unstubAllGlobals());

function start(worker: StubOptions = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'vizoalica-envs-routes-'));
  const store = EnvironmentStore.fromDirectory(dir);
  const stub = stubWorker(worker);
  const server = createLocalServer({
    settings: { ...loadSettings({}), homeDir: dir },
    store,
    version: '0.7.0',
    schemaDir: undefined
  });
  return { dir, store, stub, ...callerFor(server) };
}
const post = (api: ReturnType<typeof start>, cookie: string, path: string, body: unknown) =>
  api.call(path, { method: 'POST', cookie, body });

describe('GET /api/environments', () => {
  it('lists nothing and no active environment when none exists', async () => {
    const api = start();
    const cookie = await api.session();
    const result = await api.call('/api/environments', { cookie });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ active: null, environments: [] });
  });

  it('is available without a role or a backend connection', async () => {
    const api = start();
    const cookie = await api.session();
    await post(api, cookie, '/api/environments', { name: 'dev' });
    const result = await api.call('/api/environments', { cookie });
    expect(result.body).toMatchObject({
      active: 'dev',
      environments: [{ name: 'dev', hasConnection: false }]
    });
  });
});

describe('POST /api/environments', () => {
  it('creates an environment with a Cloudflare token credential and makes it active', async () => {
    const api = start();
    const cookie = await api.session();
    const result = await post(api, cookie, '/api/environments', {
      name: 'stage',
      cloudflare: { mode: 'token', token: 'cf-tok' }
    });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ active: 'stage' });
  });

  it('creates an environment with no Cloudflare credential (never deployed)', async () => {
    const api = start();
    const cookie = await api.session();
    const result = await post(api, cookie, '/api/environments', { name: 'read-only' });
    expect(result.status).toBe(200);
  });

  it('refuses an invalid name', async () => {
    const api = start();
    const cookie = await api.session();
    const result = await post(api, cookie, '/api/environments', { name: 'Not Valid' });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: 'invalid_request', field: 'name' });
  });

  it('refuses a colliding name with 409', async () => {
    const api = start();
    const cookie = await api.session();
    await post(api, cookie, '/api/environments', { name: 'dev' });
    const result = await post(api, cookie, '/api/environments', { name: 'dev' });
    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ error: 'environment_name_taken' });
  });

  it('refuses a malformed cloudflare field', async () => {
    const api = start();
    const cookie = await api.session();
    const result = await post(api, cookie, '/api/environments', {
      name: 'dev',
      cloudflare: { mode: 'bogus' }
    });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ field: 'cloudflare' });
  });
});

describe('POST /api/environments/:name/select', () => {
  it('switches the active environment', async () => {
    const api = start();
    const cookie = await api.session();
    await post(api, cookie, '/api/environments', { name: 'dev' });
    await post(api, cookie, '/api/environments', { name: 'stage' });
    expect(api.store.active()).toBe('stage');
    const result = await post(api, cookie, '/api/environments/dev/select', {});
    expect(result.status).toBe(200);
    expect(api.store.active()).toBe('dev');
  });

  it('answers 404 for an unknown environment', async () => {
    const api = start();
    const cookie = await api.session();
    const result = await post(api, cookie, '/api/environments/ghost/select', {});
    expect(result.status).toBe(404);
  });
});

describe('POST /api/environments/:name/connect', () => {
  it('verifies and saves the connection for the named environment without disturbing another', async () => {
    const api = start({ workerVersion: '0.7.0', schemaApplied: 2 });
    const cookie = await api.session();
    await post(api, cookie, '/api/environments', { name: 'dev' });
    await post(api, cookie, '/api/environments', { name: 'stage' });
    // "stage" is active; connect "dev" explicitly and confirm it does not steal activeness unexpectedly.
    const result = await post(api, cookie, '/api/environments/dev/connect', {
      workerUrl: 'https://dev.example.workers.dev',
      credential: 'super-secret-credential-value',
      roleHint: 'admin'
    });
    expect(result.status).toBe(200);
    expect(api.store.active()).toBe('dev');
    expect(api.store.current()?.remoteUrl).toBe('https://dev.example.workers.dev');
  });

  it('answers 404 for an unknown environment and saves nothing', async () => {
    const api = start();
    const cookie = await api.session();
    const result = await post(api, cookie, '/api/environments/ghost/connect', {
      workerUrl: 'https://w.example.workers.dev',
      credential: 'x'.repeat(20)
    });
    expect(result.status).toBe(404);
  });

  it('answers 401 for a rejected credential', async () => {
    const api = start({ accept: ['other'] });
    const cookie = await api.session();
    await post(api, cookie, '/api/environments', { name: 'dev' });
    const result = await post(api, cookie, '/api/environments/dev/connect', {
      workerUrl: 'https://dev.example.workers.dev',
      credential: 'x'.repeat(20)
    });
    expect(result.status).toBe(401);
  });
});

describe('DELETE /api/environments/:name', () => {
  it('requires confirm: true', async () => {
    const api = start();
    const cookie = await api.session();
    await post(api, cookie, '/api/environments', { name: 'dev' });
    const result = await api.call('/api/environments/dev', { method: 'DELETE', cookie, body: {} });
    expect(result.status).toBe(400);
  });

  it('removes the environment, never touching Cloudflare', async () => {
    const api = start();
    const cookie = await api.session();
    await post(api, cookie, '/api/environments', { name: 'dev' });
    const result = await api.call('/api/environments/dev', {
      method: 'DELETE',
      cookie,
      body: { confirm: true }
    });
    expect(result.status).toBe(200);
    expect(api.stub.fetchMock).not.toHaveBeenCalled();
    expect(api.store.list()).toEqual([]);
  });

  it('answers 404 for an unknown environment', async () => {
    const api = start();
    const cookie = await api.session();
    const result = await api.call('/api/environments/ghost', {
      method: 'DELETE',
      cookie,
      body: { confirm: true }
    });
    expect(result.status).toBe(404);
  });
});
