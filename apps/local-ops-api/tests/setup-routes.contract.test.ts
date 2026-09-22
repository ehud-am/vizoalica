import { readFileSync, statSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSettings } from '../src/config.js';
import { ConnectionStore } from '../src/connection-store.js';
import { createLocalServer } from '../src/server.js';
import { callerFor } from './support.js';
import { stubWorker, type StubOptions } from './worker-stub.js';

afterEach(() => vi.unstubAllGlobals());

const SECRET = 'super-secret-credential-value';

function start(worker: StubOptions = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'vizoalica-setup-'));
  const path = join(dir, 'local-operations.json');
  const store = ConnectionStore.fromFile(path);
  const stub = stubWorker(worker);
  const server = createLocalServer({
    settings: { ...loadSettings({}), configFilePath: path },
    store,
    version: '0.6.3',
    schemaDir: undefined
  });
  return { path, store, stub, ...callerFor(server) };
}
const post = (api: ReturnType<typeof start>, cookie: string, path: string, body: unknown) =>
  api.call(path, { method: 'POST', cookie, body });
const connectBody = (extra: Record<string, unknown> = {}) => ({
  workerUrl: 'https://worker.example.workers.dev',
  credential: SECRET,
  roleHint: 'admin',
  ...extra
});

describe('GET /api/setup/state', () => {
  it('reports first run before anything is saved', async () => {
    const api = start();
    const cookie = await api.session();
    const result = await api.call('/api/setup/state', { cookie });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ needsFirstRun: true, connection: { status: 'none' } });
  });

  it('needs a session like every other route', async () => {
    const api = start();
    expect((await api.call('/api/setup/state')).status).toBe(401);
  });
});

describe('POST /api/setup/connect', () => {
  it('verifies the credential, saves it privately, and returns the new state', async () => {
    const api = start({ workerVersion: '0.6.3', schemaApplied: null });
    const cookie = await api.session();
    const result = await post(api, cookie, '/api/setup/connect', connectBody());
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      needsFirstRun: false,
      connection: {
        status: 'connected',
        workerHost: 'worker.example.workers.dev',
        roleHint: 'admin'
      },
      principal: { role: 'admin' }
    });
    expect(statSync(api.path).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(api.path, 'utf8'))).toEqual({
      VIZOALICA_REMOTE_URL: 'https://worker.example.workers.dev',
      VIZOALICA_ADMIN_SECRET: SECRET,
      VIZOALICA_ROLE_HINT: 'admin'
    });
    expect(api.store.current()?.credential).toBe(SECRET);
  });

  it('never returns or logs the credential', async () => {
    const api = start();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cookie = await api.session();
    const results = [
      await post(api, cookie, '/api/setup/connect', connectBody()),
      await api.call('/api/setup/state', { cookie }),
      await post(api, cookie, '/api/setup/role', { roleHint: 'analyst' }),
      await post(api, cookie, '/api/setup/disconnect', {})
    ];
    for (const result of results) expect(result.text).not.toContain(SECRET);
    for (const call of [...log.mock.calls, ...error.mock.calls])
      expect(JSON.stringify(call)).not.toContain(SECRET);
    log.mockRestore();
    error.mockRestore();
  });

  it('normalizes the address to its origin', async () => {
    const api = start();
    const cookie = await api.session();
    await post(
      api,
      cookie,
      '/api/setup/connect',
      connectBody({ workerUrl: 'https://Worker.Example.workers.dev/x?y=1' })
    );
    expect(api.store.current()?.remoteUrl).toBe('https://worker.example.workers.dev');
  });

  it('answers 401 for a rejected credential and saves nothing', async () => {
    const api = start({ accept: ['other'] });
    const cookie = await api.session();
    const result = await post(api, cookie, '/api/setup/connect', connectBody());
    expect(result.status).toBe(401);
    expect(result.body).toEqual({ error: 'unauthorized', recovery: 'reauthorize' });
    expect(api.store.current()).toBeUndefined();
    // A refusal here is about the pasted credential; it must not end the console's own session.
    expect((await api.call('/api/setup/state', { cookie })).status).toBe(200);
  });

  it('answers 503 for a backend that cannot be reached', async () => {
    for (const fail of ['network', 500] as const) {
      const api = start({ fail });
      const cookie = await api.session();
      const result = await post(api, cookie, '/api/setup/connect', connectBody());
      expect(result.status).toBe(503);
      expect(result.body).toEqual({ error: 'unreachable', recovery: 'retry_safely' });
      expect(api.store.current()).toBeUndefined();
    }
  });

  it('refuses bad input with 400 and no request to the backend', async () => {
    const api = start();
    const cookie = await api.session();
    for (const body of [
      {},
      connectBody({ workerUrl: 'http://worker.example.com' }),
      connectBody({ workerUrl: 'not a url' }),
      connectBody({ workerUrl: 42 }),
      connectBody({ credential: '' }),
      connectBody({ credential: 'a\nb' }),
      connectBody({ credential: 'x'.repeat(513) }),
      connectBody({ credential: 'onecli-managed' }),
      connectBody({ roleHint: 'root' })
    ]) {
      const result = await post(api, cookie, '/api/setup/connect', body);
      expect(result.status, JSON.stringify(body)).toBe(400);
      expect(result.body).toMatchObject({ error: 'invalid_request' });
    }
    expect(api.stub.fetchMock).not.toHaveBeenCalled();
  });

  it('allows loopback http for local development', async () => {
    const api = start();
    const cookie = await api.session();
    const result = await post(
      api,
      cookie,
      '/api/setup/connect',
      connectBody({ workerUrl: 'http://127.0.0.1:8787' })
    );
    expect(result.status).toBe(200);
  });

  it('accepts a backend from before access keys for an administrator secret', async () => {
    const api = start({ role: 'legacy' });
    const cookie = await api.session();
    const result = await post(api, cookie, '/api/setup/connect', connectBody());
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ backend: { worker: { status: 'unknown' } } });
  });

  it('saves the role the backend reports and says so when the choice was wrong', async () => {
    const admin = start({ role: 'admin' });
    const adminCookie = await admin.session();
    const usedSecret = await post(
      admin,
      adminCookie,
      '/api/setup/connect',
      connectBody({ roleHint: 'analyst' })
    );
    expect(usedSecret.body).toMatchObject({
      notice: 'administrator_secret_used',
      principal: { role: 'admin' }
    });
    expect(admin.store.current()?.roleHint).toBe('admin');

    const analyst = start({ role: 'analyst' });
    const analystCookie = await analyst.session();
    const corrected = await post(
      analyst,
      analystCookie,
      '/api/setup/connect',
      connectBody({ roleHint: 'admin' })
    );
    expect(corrected.body).toMatchObject({
      notice: 'role_corrected',
      principal: { role: 'analyst' }
    });
    expect(analyst.store.current()).toMatchObject({ kind: 'access-key', roleHint: 'analyst' });
    expect(JSON.parse(readFileSync(analyst.path, 'utf8')).VIZOALICA_READ_KEY).toBe(SECRET);

    const right = start({ role: 'owner' });
    const rightCookie = await right.session();
    const same = await post(
      right,
      rightCookie,
      '/api/setup/connect',
      connectBody({ roleHint: 'website-owner' })
    );
    expect((same.body as { notice?: string }).notice).toBeUndefined();
    expect(right.store.current()?.roleHint).toBe('website-owner');
  });

  it('refuses a backend this console cannot work with', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vizoalica-setup-'));
    const store = ConnectionStore.fromFile(join(dir, 'c.json'));
    stubWorker({ role: 'admin', workerVersion: '0.6.3', schemaApplied: 5 });
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const schemaDir = join(dir, 'schema');
    mkdirSync(schemaDir);
    writeFileSync(join(schemaDir, '0001_initial.sql'), '');
    const api = callerFor(
      createLocalServer({ settings: loadSettings({}), store, version: '0.6.3', schemaDir })
    );
    const cookie = await api.session();
    const result = await api.call('/api/setup/connect', {
      method: 'POST',
      cookie,
      body: connectBody()
    });
    expect(result.status).toBe(422);
    expect(result.body).toMatchObject({ error: 'incompatible' });
    expect(String(result.body.message)).toContain('npm update -g vizoalica');
    expect(store.current()).toBeUndefined();
  });

  it('is used by the very next request without a restart', async () => {
    const api = start({ projects: [{ id: 'p1', name: 'Site' }] });
    const cookie = await api.session();
    expect((await api.call('/api/projects', { cookie })).status).toBe(409);
    await post(api, cookie, '/api/setup/connect', connectBody());
    expect((await api.call('/api/projects', { cookie })).status).toBe(200);
    expect(api.stub.requests.at(-1)?.authorization).toBe(`Bearer ${SECRET}`);
  });
});

describe('POST /api/setup/disconnect and /role', () => {
  it('disconnects back to first run and forgets the credential', async () => {
    const api = start();
    const cookie = await api.session();
    await post(api, cookie, '/api/setup/connect', connectBody());
    const result = await post(api, cookie, '/api/setup/disconnect', {});
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ needsFirstRun: true, connection: { status: 'none' } });
    expect(readFileSync(api.path, 'utf8')).not.toContain(SECRET);
  });

  it('changes only the remembered role, never access', async () => {
    const api = start({ role: 'analyst' });
    const cookie = await api.session();
    const before = await api.call('/api/setup/state', { cookie });
    expect(before.body).toMatchObject({ connection: { status: 'none' } });
    const hinted = await post(api, cookie, '/api/setup/role', { roleHint: 'website-owner' });
    expect(hinted.status).toBe(200);
    expect(hinted.body).toMatchObject({ connection: { roleHint: 'website-owner' } });
    await post(api, cookie, '/api/setup/connect', connectBody());
    const changed = await post(api, cookie, '/api/setup/role', { roleHint: 'admin' });
    expect(changed.body).toMatchObject({
      principal: { role: 'analyst' },
      connection: { roleHint: 'admin' }
    });
  });

  it('refuses an unknown role', async () => {
    const api = start();
    const cookie = await api.session();
    expect((await post(api, cookie, '/api/setup/role', { roleHint: 'root' })).status).toBe(400);
    expect((await post(api, cookie, '/api/setup/role', {})).status).toBe(400);
  });

  it('answers 404 for anything else under /api/setup', async () => {
    const api = start();
    const cookie = await api.session();
    expect((await api.call('/api/setup/nothing', { cookie })).status).toBe(404);
  });
});
