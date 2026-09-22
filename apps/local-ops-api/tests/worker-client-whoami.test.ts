import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkerClient } from '../src/remote-client/worker-client.js';

const respond = (routes: Record<string, () => Response>) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL) => {
      const handler = routes[new URL(String(input)).pathname];
      if (!handler) return new Response('nope', { status: 500 });
      return handler();
    })
  );
afterEach(() => vi.unstubAllGlobals());
const client = () => new WorkerClient('https://w.test', 'the-secret');

describe('WorkerClient.whoami', () => {
  it('returns the principal the backend reports', async () => {
    respond({
      '/v1/admin/whoami': () =>
        Response.json({
          role: 'owner',
          scope: { projectId: 'p1', sourceId: null },
          keyLabel: 'Jane',
          workerVersion: '0.6.4',
          features: { accessKeys: true, versions: true }
        })
    });
    expect(await client().whoami()).toEqual({
      role: 'owner',
      scope: { projectId: 'p1', sourceId: null },
      keyLabel: 'Jane',
      workerVersion: '0.6.4',
      features: { accessKeys: true, versions: true }
    });
  });

  it('falls back to the project list on a backend older than access keys', async () => {
    respond({
      '/v1/admin/whoami': () => new Response('{}', { status: 404 }),
      '/v1/admin/projects': () => Response.json([])
    });
    expect(await client().whoami()).toEqual({
      role: 'admin',
      scope: { projectId: null, sourceId: null },
      keyLabel: null,
      workerVersion: null,
      features: { accessKeys: false, versions: false }
    });
  });

  it('maps a rejected credential to unauthorized on both paths', async () => {
    respond({ '/v1/admin/whoami': () => new Response('{}', { status: 401 }) });
    await expect(client().whoami()).rejects.toThrow('unauthorized');
    respond({ '/v1/admin/whoami': () => new Response('{}', { status: 403 }) });
    await expect(client().whoami()).rejects.toThrow('unauthorized');
    respond({
      '/v1/admin/whoami': () => new Response('{}', { status: 404 }),
      '/v1/admin/projects': () => new Response('{}', { status: 401 })
    });
    await expect(client().whoami()).rejects.toThrow('unauthorized');
    respond({
      '/v1/admin/whoami': () => new Response('{}', { status: 404 }),
      '/v1/admin/projects': () => new Response('{}', { status: 403 })
    });
    await expect(client().whoami()).rejects.toThrow('unauthorized');
  });

  it('maps failures and malformed answers to remote_unavailable', async () => {
    respond({
      '/v1/admin/whoami': () => new Response('{}', { status: 404 }),
      '/v1/admin/projects': () => new Response('{}', { status: 500 })
    });
    await expect(client().whoami()).rejects.toThrow('remote_unavailable');
    respond({ '/v1/admin/whoami': () => new Response('{}', { status: 502 }) });
    await expect(client().whoami()).rejects.toThrow('remote_unavailable');
    respond({ '/v1/admin/whoami': () => Response.json({ role: 'root' }) });
    await expect(client().whoami()).rejects.toThrow('remote_unavailable');
    respond({ '/v1/admin/whoami': () => new Response('not json', { status: 200 }) });
    await expect(client().whoami()).rejects.toThrow('remote_unavailable');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(client().whoami()).rejects.toThrow('remote_unavailable');
  });

  it('tolerates missing optional fields', async () => {
    respond({ '/v1/admin/whoami': () => Response.json({ role: 'analyst' }) });
    expect(await client().whoami()).toEqual({
      role: 'analyst',
      scope: { projectId: null, sourceId: null },
      keyLabel: null,
      workerVersion: null,
      features: { accessKeys: false, versions: false }
    });
  });

  it('never puts the credential in a URL or a thrown message', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline the-secret'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(client().whoami()).rejects.toThrow(/^remote_unavailable$/);
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('the-secret');
  });
});

describe('WorkerClient.backendInfo', () => {
  it('returns the reported versions and health', async () => {
    respond({
      '/v1/admin/backend': () =>
        Response.json({
          workerVersion: '0.6.4',
          schema: {
            applied: 2,
            expected: 2,
            appliedNames: ['0001_initial.sql', 7],
            status: 'current'
          },
          health: { database: 'ok', storage: 'nope' }
        })
    });
    expect(await client().backendInfo()).toEqual({
      workerVersion: '0.6.4',
      schema: { applied: 2, expected: 2, appliedNames: ['0001_initial.sql'], status: 'current' },
      health: { database: 'ok', storage: 'unavailable' }
    });
  });

  it('reports unknown versions for an older backend, an odd answer, or missing fields', async () => {
    const unknown = {
      workerVersion: null,
      schema: { applied: null, expected: null, appliedNames: [], status: 'unknown' },
      health: null
    };
    respond({ '/v1/admin/backend': () => new Response('{}', { status: 404 }) });
    expect(await client().backendInfo()).toEqual(unknown);
    respond({ '/v1/admin/backend': () => new Response('bad', { status: 200 }) });
    expect(await client().backendInfo()).toEqual(unknown);
    respond({ '/v1/admin/backend': () => Response.json({ schema: { status: 'weird' } }) });
    expect(await client().backendInfo()).toEqual(unknown);
  });

  it('maps errors', async () => {
    respond({ '/v1/admin/backend': () => new Response('{}', { status: 401 }) });
    await expect(client().backendInfo()).rejects.toThrow('unauthorized');
    respond({ '/v1/admin/backend': () => new Response('{}', { status: 500 }) });
    await expect(client().backendInfo()).rejects.toThrow('remote_unavailable');
  });
});
