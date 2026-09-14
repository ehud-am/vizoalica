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
    await api.getAnalytics('p1', 's1', '30d');
    expect(fetch).toHaveBeenCalledTimes(10);
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
