import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createService } from '../src/service.js';
import { callerFor } from './support.js';
import { stubWorker } from './worker-stub.js';

afterEach(() => vi.unstubAllGlobals());

function start(role: 'admin' | 'analyst' | 'owner' = 'admin') {
  const stub = stubWorker({
    role,
    projects: [{ id: 'p1', name: 'Site' }],
    sources: { p1: [{ id: 's1' }] }
  });
  const { server } = createService({
    homeDir: mkdtempSync(join(tmpdir(), 'vizoalica-keys-')),
    version: '0.6.4',
    registry: {
      load: () => ({
        status: 'ok',
        path: '',
        entries: [
          {
            name: 'default',
            def: { url: 'https://worker.example.workers.dev', role, secret: 'secret' }
          }
        ]
      }),
      verify: async (name, def) => ({
        name,
        url: def.url,
        role: def.role,
        cloudflare: 'none',
        usable: true,
        problems: []
      })
    }
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

  it.each([
    { label: 'x'.repeat(65), role: 'analyst' },
    { label: 'has\u0000control', role: 'analyst' },
    { label: 'Jane', role: 'bogus' },
    { label: 'Jane', role: 'analyst', projectId: 5 },
    { label: 'Jane', role: 'analyst', sourceId: 5 }
  ])('rejects %j', async (body) => {
    const api = start();
    const cookie = await api.session();
    const result = await api.call('/api/access-keys', { method: 'POST', cookie, body });
    expect(result.status).toBe(400);
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
    const { server } = createService({
      homeDir: mkdtempSync(join(tmpdir(), 'vizoalica-keys-')),
      env: {},
      version: '0.6.4'
    });
    const api = callerFor(server);
    const cookie = await api.session();
    const result = await api.call('/api/backend', { cookie });
    expect(result.status).toBe(409);
  });
});
