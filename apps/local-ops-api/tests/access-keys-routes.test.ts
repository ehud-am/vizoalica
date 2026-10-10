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

describe('renaming and rotating a key', () => {
  it('renames through the Worker, with a trimmed name', async () => {
    const api = start();
    const cookie = await api.session();
    const result = await api.call('/api/access-keys/k1', {
      method: 'PATCH',
      cookie,
      body: { label: '  Renamed  ' }
    });
    expect(result.status).toBe(200);
    const sent = api.stub.requests.at(-1)!;
    expect(sent.path).toBe('/v1/admin/access-keys/k1');
    expect(JSON.parse(String(sent.body))).toEqual({ label: 'Renamed' });
    for (const label of ['', '   ', 'x'.repeat(65), 'bad\u0001name'])
      expect(
        (await api.call('/api/access-keys/k1', { method: 'PATCH', cookie, body: { label } })).status
      ).toBe(400);
  });

  it('rotates through the Worker and returns the new key once', async () => {
    const api = start();
    const cookie = await api.session();
    const result = await api.call('/api/access-keys/k1/rotate', { method: 'POST', cookie });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ key: 'vzk_rotated' });
    expect(api.stub.requests.at(-1)?.path).toBe('/v1/admin/access-keys/k1/rotate');
  });

  it('refuses both for anyone who is not the admin', async () => {
    for (const role of ['analyst', 'owner'] as const) {
      const api = start(role);
      const cookie = await api.session();
      expect(
        (await api.call('/api/access-keys/k1', { method: 'PATCH', cookie, body: { label: 'x' } }))
          .status
      ).toBeGreaterThanOrEqual(400);
      expect(
        (await api.call('/api/access-keys/k1/rotate', { method: 'POST', cookie })).status
      ).toBeGreaterThanOrEqual(400);
    }
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
