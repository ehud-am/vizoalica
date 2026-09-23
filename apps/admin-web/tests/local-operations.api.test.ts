import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../src/api/local-operations.js';

afterEach(() => vi.unstubAllGlobals());
describe('browser local operations client', () => {
  it('calls every loopback route with encoded IDs and JSON bodies', async () => {
    const fetch = vi.fn(
      async (_path: string, init?: RequestInit) =>
        new Response(
          init?.method === 'DELETE'
            ? JSON.stringify({ status: 'deleted', audit: 'recorded' })
            : JSON.stringify([]),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    );
    vi.stubGlobal('fetch', fetch);
    await api.listProjects();
    await api.createProject('One');
    await api.deleteProject('p/1');
    await api.listWebsites('p/1');
    await api.createWebsite('p1', { name: 'Site', allowedOrigins: ['https://site.test'] });
    await api.updateWebsite('p1', 's/1', { status: 'disabled' });
    await api.deleteWebsite('p1', 's1');
    await api.getSnippet('p1', 's1');
    await api.getStatus('p1', 's1');
    expect(fetch).toHaveBeenCalledTimes(9);
    expect(fetch.mock.calls.map(([path]) => path).join(' ')).toContain('p%2F1');
    expect(
      fetch.mock.calls.some(
        ([, init]) => init?.headers && JSON.stringify(init.headers).includes('content-type')
      )
    ).toBe(true);
  });
  it('supports empty session responses and maps structured and fallback errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 }))
    );
    await expect(api.bootstrapSession()).resolves.toBeUndefined();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'access_revoked', recovery: 'reauthorize' }, { status: 401 })
      )
    );
    await expect(api.listProjects()).rejects.toMatchObject({
      code: 'access_revoked',
      status: 401,
      recovery: 'reauthorize',
      message: 'Access expired'
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'remote_unavailable' }, { status: 503 }))
    );
    await expect(api.listProjects()).rejects.toMatchObject({ message: 'Service unavailable' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not json', { status: 400 }))
    );
    await expect(api.listProjects()).rejects.toMatchObject({
      code: 'request_failed',
      message: 'Request could not be completed'
    });
  });
});

describe('actions report client', () => {
  it('requests the report with the scope, range, and selection encoded', async () => {
    const fetch = vi.fn(async (_path: string) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await api.getAnalyticsActions(
      'p/1',
      undefined,
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z'
    );
    await api.getAnalyticsActions(
      'p1',
      's/1',
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
      { page: '/#/orders/:id', action: 'Start free trial' }
    );
    const [first, second] = fetch.mock.calls.map(([path]) => new URL(path, 'http://x'));
    expect(first!.pathname).toBe('/api/projects/p%2F1/analytics/actions');
    expect(first!.searchParams.get('start')).toBe('2026-01-01T00:00:00.000Z');
    expect([...first!.searchParams.keys()].sort()).toEqual(['end', 'start']);
    expect(second!.searchParams.get('source_id')).toBe('s/1');
    expect(second!.searchParams.get('page')).toBe('/#/orders/:id');
    expect(second!.searchParams.get('action')).toBe('Start free trial');
  });

  it('passes an abort signal through and maps failures like other analytics calls', async () => {
    const controller = new AbortController();
    const fetch = vi.fn(
      async (_path: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ error: 'access_revoked' }), { status: 401 })
    );
    vi.stubGlobal('fetch', fetch);
    await expect(
      api.getAnalyticsActions('p1', undefined, 'a', 'b', {}, controller.signal)
    ).rejects.toMatchObject({ code: 'access_revoked', status: 401 });
    expect(fetch.mock.calls[0]![1]!.signal).toBe(controller.signal);
  });
});

describe('setup client calls', () => {
  it('reads the state and posts connect, disconnect, and role changes', async () => {
    const fetch = vi.fn(
      async (_path: string, init?: RequestInit) =>
        new Response(JSON.stringify({ needsFirstRun: false, method: init?.method ?? 'GET' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
    );
    vi.stubGlobal('fetch', fetch);
    await api.getSetupState();
    await api.connectBackend({ workerUrl: 'https://w.test', credential: 'c', roleHint: 'analyst' });
    await api.disconnectBackend();
    await api.setRoleHint('website-owner');
    expect(fetch.mock.calls.map(([path, init]) => `${init?.method ?? 'GET'} ${path}`)).toEqual([
      'GET /api/setup/state',
      'POST /api/setup/connect',
      'POST /api/setup/disconnect',
      'POST /api/setup/role'
    ]);
    expect(JSON.parse(String(fetch.mock.calls[1]![1]!.body))).toEqual({
      workerUrl: 'https://w.test',
      credential: 'c',
      roleHint: 'analyst'
    });
    expect(JSON.parse(String(fetch.mock.calls[3]![1]!.body))).toEqual({
      roleHint: 'website-owner'
    });
  });

  it('carries the error code and status of a refused connect', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'unauthorized', recovery: 'reauthorize' }, { status: 401 })
      )
    );
    await expect(
      api.connectBackend({ workerUrl: 'https://w.test', credential: 'c' })
    ).rejects.toMatchObject({
      code: 'unauthorized',
      status: 401
    });
  });

  it('imports a pre-0.7.0 single connection file as the first environment', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ needsFirstRun: false }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
    );
    vi.stubGlobal('fetch', fetch);
    await api.importLegacySetup('prod');
    expect(fetch.mock.calls[0]![0]).toBe('/api/setup/import-legacy');
    expect(JSON.parse(String(fetch.mock.calls[0]![1]!.body))).toEqual({ name: 'prod' });
  });
});

describe('environment client calls', () => {
  it('lists, creates, selects, connects, and removes environments', async () => {
    const fetch = vi.fn(
      async (_path: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ active: null, environments: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
    );
    vi.stubGlobal('fetch', fetch);
    await api.listEnvironments();
    await api.createEnvironment('stage', { mode: 'token', token: 'cf-tok' });
    await api.selectEnvironment('dev');
    await api.connectEnvironment('dev', { workerUrl: 'https://w.test', credential: 'c' });
    await api.removeEnvironment('dev');
    expect(fetch.mock.calls.map(([path, init]) => `${init?.method ?? 'GET'} ${path}`)).toEqual([
      'GET /api/environments',
      'POST /api/environments',
      'POST /api/environments/dev/select',
      'POST /api/environments/dev/connect',
      'DELETE /api/environments/dev'
    ]);
    expect(JSON.parse(String(fetch.mock.calls[1]![1]!.body))).toEqual({
      name: 'stage',
      cloudflare: { mode: 'token', token: 'cf-tok' }
    });
    expect(JSON.parse(String(fetch.mock.calls[4]![1]!.body))).toEqual({ confirm: true });
  });

  it('creates an environment with no Cloudflare credential', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ active: 'x', environments: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
    );
    vi.stubGlobal('fetch', fetch);
    await api.createEnvironment('x');
    expect(JSON.parse(String(fetch.mock.calls[0]![1]!.body))).toEqual({ name: 'x' });
  });
});

describe('deploy and backend maintenance client calls', () => {
  it('drives preflight, plan, run polling, resume, reveal, and cleanup', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 'r1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
    );
    vi.stubGlobal('fetch', fetch);
    await api.getDeployPreflight();
    await api.createDeployPlan({ accountId: 'a'.repeat(32) });
    await api.startDeployRun('p1');
    await api.getDeployRun('r1');
    await api.resumeDeployRun('r1');
    await api.cleanupDeployRun('r1');
    await api.revealDeploySecrets('r1');
    expect(fetch.mock.calls.map(([path, init]) => `${init?.method ?? 'GET'} ${path}`)).toEqual([
      'GET /api/deploy/preflight',
      'POST /api/deploy/plan',
      'POST /api/deploy/runs',
      'GET /api/deploy/runs/r1',
      'POST /api/deploy/runs/r1/resume',
      'POST /api/deploy/runs/r1/cleanup',
      'POST /api/deploy/runs/r1/reveal'
    ]);
    expect(JSON.parse(String(fetch.mock.calls[5]![1]!.body))).toEqual({ confirm: true });
  });

  it('rotates a secret and purges deleted data', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ kind: 'token', value: 'x' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
    );
    vi.stubGlobal('fetch', fetch);
    await api.rotateBackendSecret('token');
    await api.purgeDeleted(false);
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      '/api/backend/rotate/token',
      '/api/backend/purge-deleted'
    ]);
    expect(JSON.parse(String(fetch.mock.calls[1]![1]!.body))).toEqual({ apply: false });
  });
});
