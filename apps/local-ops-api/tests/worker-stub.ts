import { vi } from 'vitest';

export type StubOptions = {
  /** `legacy` is a Worker from before access keys: no whoami and no backend routes. */
  role?: 'admin' | 'analyst' | 'owner' | 'legacy';
  scope?: { projectId: string | null; sourceId: string | null };
  workerVersion?: string | null;
  schemaApplied?: number | null;
  /** Credentials the stub accepts; any credential is accepted when omitted. */
  accept?: string[];
  projects?: Array<{ id: string; name: string; status?: string }>;
  sources?: Record<string, Array<{ id: string; status?: string }>>;
  pageViews?: number;
  /** Answer every request with this status (or a network error) instead. */
  fail?: number | 'network';
  failOverview?: boolean;
};

/** Stubs `fetch` as a Worker, so the local service can be exercised end to end without a network. */
export function stubWorker(options: StubOptions = {}) {
  const role = options.role ?? 'admin';
  const requests: Array<{ path: string; authorization: string | null }> = [];
  const json = (body: unknown, status = 200) => Response.json(body, { status });
  const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const authorization = headers.get('authorization');
    requests.push({ path: url.pathname, authorization });
    if (options.fail === 'network') throw new TypeError('offline');
    if (typeof options.fail === 'number') return json({ error: 'failed' }, options.fail);
    if (options.accept && !options.accept.includes((authorization ?? '').replace('Bearer ', '')))
      return json({ error: 'unauthorized' }, 401);
    const path = url.pathname;
    if (path === '/v1/admin/whoami')
      return role === 'legacy'
        ? json({ error: 'not_found' }, 404)
        : json({
            role,
            scope: options.scope ?? { projectId: null, sourceId: null },
            keyLabel: role === 'admin' ? null : 'Jane',
            workerVersion: options.workerVersion ?? null,
            features: { accessKeys: true, versions: true }
          });
    if (path === '/v1/admin/backend')
      return role === 'legacy'
        ? json({ error: 'not_found' }, 404)
        : json({
            workerVersion: options.workerVersion ?? null,
            schema: {
              applied: options.schemaApplied ?? null,
              expected: 1,
              appliedNames: [],
              status: 'unknown'
            },
            health: { database: 'ok', storage: 'ok' }
          });
    if (path === '/v1/admin/projects') return json(options.projects ?? []);
    const sources = /^\/v1\/admin\/projects\/([^/]+)\/sources$/.exec(path);
    if (sources) return json(options.sources?.[sources[1]!] ?? []);
    if (/^\/v1\/admin\/projects\/[^/]+\/analytics$/.test(path))
      return options.failOverview
        ? json({ error: 'failed' }, 500)
        : json({ totals: { pageViews: options.pageViews ?? 0, uniqueUsers: 0 } });
    if (/^\/v1\/admin\/projects\/[^/]+\/sources\/[^/]+\/snippet$/.test(path))
      return json({ publicSourceKey: 'public-key', allowedOrigins: ['https://example.test'] });
    if (path === '/v1/admin/access-keys' || /^\/v1\/admin\/access-keys\/[^/]+$/.test(path)) {
      if (role !== 'admin') return json({ error: 'forbidden' }, 403);
      const method = init?.method ?? 'GET';
      if (method === 'GET') return json([]);
      if (method === 'POST')
        return json({ id: 'k1', label: 'x', role: 'analyst', scope: {}, key: 'vzk_test' }, 201);
      if (method === 'DELETE') return json({ status: 'revoked' });
    }
    return json({ error: 'not_found' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, requests };
}
