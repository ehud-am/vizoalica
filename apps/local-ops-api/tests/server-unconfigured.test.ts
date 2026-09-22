import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSettings } from '../src/config.js';
import { ConnectionStore } from '../src/connection-store.js';
import { createLocalServer } from '../src/server.js';
import { callerFor } from './support.js';

afterEach(() => vi.unstubAllGlobals());

function start(
  store = ConnectionStore.fromFile(join(mkdtempSync(join(tmpdir(), 'vizoalica-u-')), 'c.json'))
) {
  const root = mkdtempSync(join(tmpdir(), 'vizoalica-u-web-'));
  mkdirSync(join(root, 'console'));
  writeFileSync(join(root, 'console', 'index.html'), '<title>Vizoalica</title>');
  const server = createLocalServer({
    settings: {
      ...loadSettings({}),
      configFilePath: join(mkdtempSync(join(tmpdir(), 'vizoalica-u-prefs-')), 'c.json')
    },
    store,
    consoleDir: join(root, 'console')
  });
  return { store, ...callerFor(server) };
}

describe('a service with no backend', () => {
  it('starts, serves the console, and issues a session', async () => {
    const api = start();
    const page = await api.call('/', { origin: null });
    expect(page.status).toBe(200);
    expect(page.text).toContain('Vizoalica');
    expect((await api.call('/api/session', { method: 'POST' })).status).toBe(204);
  });

  it('answers backend routes with 409 and a way forward', async () => {
    const api = start();
    const cookie = await api.session();
    for (const path of [
      '/api/projects',
      '/api/projects/p1/websites',
      '/api/projects/p1/analytics?start=2026-01-01T00:00:00Z&end=2026-01-02T00:00:00Z',
      '/api/projects/p1/websites/w1/status'
    ]) {
      const result = await api.call(path, { cookie });
      expect(result.status, path).toBe(409);
      expect(result.body).toEqual({ error: 'backend_not_connected', recovery: 'connect_backend' });
    }
    expect(
      (await api.call('/api/projects', { method: 'POST', cookie, body: { name: 'Site' } })).status
    ).toBe(409);
  });

  it('still keeps the personal theme, which needs no backend', async () => {
    const api = start();
    const cookie = await api.session();
    expect((await api.call('/api/preferences/theme', { cookie })).status).toBe(200);
  });

  it('keeps requiring a session', async () => {
    const api = start();
    expect((await api.call('/api/projects')).status).toBe(401);
  });
});

describe('origins and hosts', () => {
  it('accepts exactly the service address and the development server', async () => {
    const api = start();
    for (const origin of ['http://127.0.0.1:4318', 'http://127.0.0.1:5173'])
      expect((await api.call('/api/session', { method: 'POST', origin })).status).toBe(204);
    for (const origin of [
      'http://localhost:4318',
      'http://127.0.0.1:4319',
      'http://127.0.0.1.evil.test:4318',
      'https://127.0.0.1:4318',
      'http://example.com'
    ])
      expect((await api.call('/api/session', { method: 'POST', origin })).status, origin).toBe(403);
  });

  it('refuses a write with no origin at all', async () => {
    const api = start();
    expect((await api.call('/api/session', { method: 'POST', origin: null })).status).toBe(403);
  });

  it('uses the referer when a same-origin request carries no origin', async () => {
    const api = start();
    const response = await api.call('/api/session', {
      method: 'POST',
      origin: null,
      referer: 'http://127.0.0.1:4318/manage'
    });
    expect(response.status).toBe(204);
  });

  it('refuses hosts that are not loopback, for pages and for the API', async () => {
    const api = start();
    expect((await api.call('/', { host: 'evil.example', origin: null })).status).toBe(403);
    expect((await api.call('/api/session', { method: 'POST', host: 'evil.example' })).status).toBe(
      403
    );
  });
});

describe('saving a connection', () => {
  it('is picked up by the next request without a restart', async () => {
    const api = start();
    const cookie = await api.session();
    expect((await api.call('/api/projects', { cookie })).status).toBe(409);
    const fetchMock = vi.fn(async () => Response.json([{ id: 'p1', name: 'Site' }]));
    vi.stubGlobal('fetch', fetchMock);
    api.store.save({ remoteUrl: 'https://w.test', credential: 'k', kind: 'admin-secret' });
    const result = await api.call('/api/projects', { cookie });
    expect(result.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('https://w.test/v1/admin/projects');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer k');
    api.store.save({ remoteUrl: 'https://other.test', credential: 'k2', kind: 'admin-secret' });
    await api.call('/api/projects', { cookie });
    expect(String((fetchMock.mock.calls[1] as unknown as [URL])[0])).toBe(
      'https://other.test/v1/admin/projects'
    );
  });

  it('goes back to 409 after a disconnect', async () => {
    const api = start(
      ConnectionStore.fromConnection({
        remoteUrl: 'https://w.test',
        credential: 'k',
        kind: 'admin-secret'
      })
    );
    const cookie = await api.session();
    api.store.disconnect();
    expect((await api.call('/api/projects', { cookie })).status).toBe(409);
  });
});
