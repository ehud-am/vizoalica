import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createService } from '../src/service.js';
import { callerFor } from './support.js';
import { stubWorker } from './worker-stub.js';

afterEach(() => vi.unstubAllGlobals());

const def = (secret: string, role = 'admin') => ({ url: 'https://w.test', role, secret });

/** A real service over a real home directory, so a hand edit of environments.json is what changes things. */
function start(environments?: Record<string, unknown>) {
  const home = mkdtempSync(join(tmpdir(), 'vizoalica-routes-'));
  const root = mkdtempSync(join(tmpdir(), 'vizoalica-routes-web-'));
  mkdirSync(join(root, 'console'));
  writeFileSync(join(root, 'console', 'index.html'), '<title>Vizoalica</title>');
  const file = join(home, 'environments.json');
  const save = (value: Record<string, unknown>) => {
    writeFileSync(file, JSON.stringify({ version: 1, environments: value }), { mode: 0o600 });
    chmodSync(file, 0o600);
  };
  if (environments) save(environments);
  const service = createService({
    homeDir: home,
    consoleDir: join(root, 'console'),
    version: '0.7.0',
    env: {},
    registry: { ttlMs: 0 }
  });
  return { ...service, save, home, ...callerFor(service.server) };
}
const worker = (accept: string[] = ['good', 'other']) =>
  stubWorker({
    role: 'admin',
    workerVersion: '0.7.0',
    schemaApplied: 1,
    accept,
    projects: [{ id: 'p1', name: 'Site' }]
  });

describe('with no usable environment', () => {
  it('still serves the console and a session, and lists nothing to use', async () => {
    worker();
    const api = start();
    expect((await api.call('/', { origin: null })).text).toContain('Vizoalica');
    const cookie = await api.session();
    expect((await api.call('/api/environments', { cookie })).body).toMatchObject({
      file: { status: 'ok' },
      environments: [],
      selected: null
    });
  });

  it('explains each unusable environment and answers backend routes with 409', async () => {
    worker(['nobody']);
    const api = start({ prod: def('bad') });
    const cookie = await api.session();
    const list = await api.call('/api/environments', { cookie });
    expect(list.body.selected).toBeNull();
    expect((list.body.environments as Array<{ problems: unknown[] }>)[0]!.problems).toHaveLength(1);
    for (const path of ['/api/projects', '/api/backend', '/api/setup/state']) {
      const result = await api.call(path, { cookie });
      expect(result.status, path).toBe(409);
    }
    expect((await api.call('/api/setup/state', { cookie })).body.error).toBe(
      'no_usable_environment'
    );
    expect(JSON.stringify(list.body)).not.toContain('bad"');
  });

  it('still keeps the personal theme, which needs no environment', async () => {
    worker();
    const api = start();
    const cookie = await api.session();
    expect((await api.call('/api/preferences/theme', { cookie })).status).toBe(200);
  });

  it('keeps requiring a session', async () => {
    const api = start();
    expect((await api.call('/api/environments')).status).toBe(401);
  });
});

describe('with environments', () => {
  it('opens the first usable one and serves its data', async () => {
    worker();
    const api = start({ dev: def('good'), prod: def('other') });
    const cookie = await api.session();
    const state = await api.call('/api/setup/state', { cookie });
    expect(state.status).toBe(200);
    expect(state.body).toMatchObject({ environment: 'dev', connection: { status: 'connected' } });
    expect((await api.call('/api/projects', { cookie })).body).toEqual([
      { id: 'p1', name: 'Site' }
    ]);
  });

  it('switches environments, sends that environment credential, and remembers the choice', async () => {
    const { requests } = worker();
    const api = start({ dev: def('good'), prod: def('other') });
    const cookie = await api.session();
    const selected = await api.call('/api/environments/prod/select', { method: 'POST', cookie });
    expect(selected.status).toBe(200);
    expect(selected.body.environment).toBe('prod');
    await api.call('/api/projects', { cookie });
    expect(requests.at(-1)).toMatchObject({
      path: '/v1/admin/projects',
      authorization: 'Bearer other'
    });
    const again = start();
    void again;
    expect((await api.call('/api/environments', { cookie })).body.selected).toBe('prod');
    expect((await api.call('/api/preferences/theme', { cookie })).status).toBe(200);
  });

  it('keeps the selection when the theme is saved, and the theme when an environment is selected', async () => {
    worker();
    const api = start({ dev: def('good'), prod: def('other') });
    const cookie = await api.session();
    await api.call('/api/environments/prod/select', { method: 'POST', cookie });
    await api.call('/api/preferences/theme', { method: 'PUT', cookie, body: { theme: 'dark' } });
    expect((await api.call('/api/environments', { cookie })).body.selected).toBe('prod');
    expect((await api.call('/api/preferences/theme', { cookie })).body.theme).toBe('dark');
  });

  it('refuses to select an unknown or an unusable environment', async () => {
    worker(['good']);
    const api = start({ dev: def('good'), prod: def('bad') });
    const cookie = await api.session();
    expect(
      (await api.call('/api/environments/nope/select', { method: 'POST', cookie })).status
    ).toBe(404);
    expect(
      (await api.call('/api/environments/prod/select', { method: 'POST', cookie })).status
    ).toBe(409);
    expect((await api.call('/api/environments', { cookie })).body.selected).toBe('dev');
  });

  it('picks up a hand edit of environments.json without a restart, and recheck re-verifies', async () => {
    worker(['good']);
    const api = start({ dev: def('bad') });
    const cookie = await api.session();
    expect((await api.call('/api/projects', { cookie })).status).toBe(409);
    api.save({ dev: def('good') });
    expect((await api.call('/api/projects', { cookie })).status).toBe(200);
    const recheck = await api.call('/api/environments/recheck', { method: 'POST', cookie });
    expect(recheck.body.selected).toBe('dev');
  });

  it('never offers a way to add, change, or remove an environment', async () => {
    worker();
    const api = start({ dev: def('good') });
    const cookie = await api.session();
    for (const [method, path] of [
      ['POST', '/api/environments'],
      ['DELETE', '/api/environments/dev'],
      ['PUT', '/api/environments/dev/cloudflare'],
      ['POST', '/api/environments/dev/connect'],
      ['POST', '/api/setup/connect'],
      ['POST', '/api/setup/disconnect'],
      ['POST', '/api/deploy/plan'],
      ['GET', '/api/deploy/preflight']
    ] as const) {
      const result = await api.call(path, { method, cookie, body: {} });
      expect(result.status, `${method} ${path}`).toBe(404);
    }
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
