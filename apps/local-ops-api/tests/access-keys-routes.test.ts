import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSettings } from '../src/config.js';
import { EnvironmentStore } from '../src/environment-store.js';
import { createLocalServer } from '../src/server.js';
import { callerFor } from './support.js';
import { stubWorker } from './worker-stub.js';

afterEach(() => vi.unstubAllGlobals());

function start(role: 'admin' | 'analyst' | 'owner' = 'admin') {
  const dir = mkdtempSync(join(tmpdir(), 'vizoalica-keys-'));
  const store = EnvironmentStore.fromConnection('default', {
    remoteUrl: 'https://worker.example.workers.dev',
    credential: 'secret',
    kind: role === 'admin' ? 'admin-secret' : 'access-key'
  });
  const stub = stubWorker({
    role,
    projects: [{ id: 'p1', name: 'Site' }],
    sources: { p1: [{ id: 's1' }] }
  });
  const server = createLocalServer({
    settings: { ...loadSettings({}), homeDir: dir },
    store,
    version: '0.6.4',
    schemaDir: undefined
  });
  return { stub, ...callerFor(server) };
}

describe('access key routes', () => {
  it('issues, lists, and revokes a key, proxying the Worker for the admin', async () => {
    const api = start();
    const cookie = await api.session();
    const issued = await api.call('/api/access-keys', {
      method: 'POST',
      cookie,
      body: { label: 'Jane', role: 'analyst' }
    });
    expect(issued.status).toBe(201);
    expect(api.stub.requests.at(-1)?.path).toBe('/v1/admin/access-keys');

    const list = await api.call('/api/access-keys', { cookie });
    expect(list.status).toBe(200);

    const revoked = await api.call('/api/access-keys/k1', { method: 'DELETE', cookie });
    expect(revoked.status).toBe(200);
    expect(api.stub.requests.at(-1)?.path).toBe('/v1/admin/access-keys/k1');
  });

  it('rejects an invalid body before calling the Worker', async () => {
    const api = start();
    const cookie = await api.session();
    const before = api.stub.requests.length;
    const result = await api.call('/api/access-keys', {
      method: 'POST',
      cookie,
      body: { label: '', role: 'analyst' }
    });
    expect(result.status).toBe(400);
    expect(api.stub.requests.length).toBe(before);
  });

  it('forwards the caller credential, so an analyst or owner connection is refused by the Worker', async () => {
    // The service maps every Worker authorization refusal to the same local 401, as it already
    // does for every other proxied route (routes/websites.ts workerJson).
    for (const role of ['analyst', 'owner'] as const) {
      const api = start(role);
      const cookie = await api.session();
      const result = await api.call('/api/access-keys', { cookie });
      expect(result.status, role).toBe(401);
    }
  });
});

describe('sharing a website', () => {
  it('issues a scoped key and returns setup details with no administrator secret', async () => {
    const api = start();
    const cookie = await api.session();
    const result = await api.call('/api/projects/p1/websites/s1/share', {
      method: 'POST',
      cookie,
      body: {}
    });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      workerUrl: 'https://worker.example.workers.dev',
      projectId: 'p1',
      sourceId: 's1'
    });
    expect(result.text).not.toContain('secret');
  });

  it('issues an analyst key when asked', async () => {
    const api = start();
    const cookie = await api.session();
    await api.call('/api/projects/p1/websites/s1/share', {
      method: 'POST',
      cookie,
      body: { role: 'analyst' }
    });
    const issueCall = api.stub.requests.find((request) => request.path === '/v1/admin/access-keys');
    expect(issueCall).toBeDefined();
  });
});

describe('GET /api/backend', () => {
  it('reports versions and health for a connected backend', async () => {
    const api = start();
    const cookie = await api.session();
    const result = await api.call('/api/backend', { cookie });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ consoleVersion: '0.6.4' });
  });

  it('is readable by every role', async () => {
    for (const role of ['admin', 'analyst', 'owner'] as const) {
      const api = start(role);
      const cookie = await api.session();
      expect((await api.call('/api/backend', { cookie })).status, role).toBe(200);
    }
  });

  it('answers 409 with no connection', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vizoalica-keys-'));
    const store = EnvironmentStore.fromDirectory(dir);
    const server = createLocalServer({ settings: loadSettings({}), store, version: '0.6.4' });
    const api = callerFor(server);
    const cookie = await api.session();
    const result = await api.call('/api/backend', { cookie });
    expect(result.status).toBe(409);
  });
});
