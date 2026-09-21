import { afterEach, describe, expect, it } from 'vitest';
import { startApi } from './support.js';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

const RANGE = 'start=2026-01-01T00:00:00.000Z&end=2026-01-02T00:00:00.000Z';
const report = {
  scope: { projectId: 'p1', sourceId: null, label: 'All websites', identityMode: 'source-local' },
  range: {
    startUtc: '2026-01-01T00:00:00.000Z',
    endUtc: '2026-01-02T00:00:00.000Z',
    interval: 'hour',
    timezone: 'UTC'
  },
  totals: { actions: 2, uniqueUsers: 1 },
  rows: [{ page: '/', action: 'Go', kind: 'button', count: 2, visitors: 1, pageViews: 5 }],
  other: { rows: 0, count: 0 },
  actions: [{ action: 'Go', kind: 'button', count: 2, visitors: 1, pages: 1 }],
  availability: { state: 'complete', taxonomyVersions: [1] }
};

async function start(remote: (url: URL) => Response | Promise<Response>) {
  const seen: URL[] = [];
  const api = await startApi((url) => {
    seen.push(url);
    return remote(url);
  });
  closers.push(api.close);
  return { api, seen, cookie: await api.session() };
}

describe('actions report local API contract', () => {
  it('proxies to the Worker and returns the body unchanged', async () => {
    const { api, seen, cookie } = await start(() => Response.json(report));
    const result = await api.call(`/api/projects/p1/analytics/actions?${RANGE}`, { cookie });
    expect(result.status).toBe(200);
    expect(result.body).toEqual(report);
    const remote = seen.find((url) => url.pathname.endsWith('/analytics/actions'))!;
    expect(remote.pathname).toBe('/v1/admin/projects/p1/analytics/actions');
    expect(remote.searchParams.get('start')).toBe('2026-01-01T00:00:00.000Z');
    expect(remote.searchParams.has('source_id')).toBe(false);
    expect(remote.searchParams.has('page')).toBe(false);
  });

  it('passes the website and filters, encoded, to the Worker', async () => {
    const { api, seen, cookie } = await start(() => Response.json(report));
    await api.call(
      `/api/projects/p1/analytics/actions?${RANGE}&source_id=s1&page=${encodeURIComponent('/#/orders/:id')}&action=${encodeURIComponent('Start free trial')}`,
      { cookie }
    );
    const remote = seen.find((url) => url.pathname.endsWith('/analytics/actions'))!;
    expect(remote.searchParams.get('source_id')).toBe('s1');
    expect(remote.searchParams.get('page')).toBe('/#/orders/:id');
    expect(remote.searchParams.get('action')).toBe('Start free trial');
  });

  it('refuses unsafe identifiers, oversized or control-character filters, and bad ranges before proxying', async () => {
    const { api, seen, cookie } = await start(() => Response.json(report));
    const bad = [
      `/api/projects/p%201/analytics/actions?${RANGE}`,
      `/api/projects/p1/analytics/actions?${RANGE}&source_id=${encodeURIComponent('s 1')}`,
      `/api/projects/p1/analytics/actions?${RANGE}&page=${'a'.repeat(1025)}`,
      `/api/projects/p1/analytics/actions?${RANGE}&action=${'a'.repeat(81)}`,
      `/api/projects/p1/analytics/actions?${RANGE}&action=${encodeURIComponent('a\nb')}`
    ];
    for (const path of bad) expect((await api.call(path, { cookie })).status, path).toBe(400);
    const range = await api.call('/api/projects/p1/analytics/actions?start=nope&end=nope', {
      cookie
    });
    expect(range.status).toBe(400);
    expect(range.body).toMatchObject({ error: 'invalid_range' });
    expect(seen.some((url) => url.pathname.endsWith('/analytics/actions'))).toBe(false);
  });

  it('maps Worker failures the way the overview does', async () => {
    const cases: Array<[Response, number, string]> = [
      [Response.json({ error: 'unauthorized' }, { status: 401 }), 401, 'access_revoked'],
      [Response.json({ error: 'forbidden' }, { status: 403 }), 401, 'access_revoked'],
      [Response.json({ error: 'not_found' }, { status: 404 }), 404, 'not_found'],
      [Response.json({ error: 'invalid_request' }, { status: 400 }), 400, 'invalid_request'],
      [
        Response.json(
          { error: 'invalid_range', field: 'start', message: 'Bad start.' },
          { status: 400 }
        ),
        400,
        'invalid_range'
      ],
      [Response.json({ error: 'boom' }, { status: 500 }), 503, 'remote_unavailable']
    ];
    for (const [remoteResponse, status, error] of cases) {
      const { api, cookie } = await start(() => remoteResponse.clone());
      const result = await api.call(`/api/projects/p1/analytics/actions?${RANGE}`, { cookie });
      expect(result.status).toBe(status);
      expect(result.body).toMatchObject({ error });
    }
  });

  it('requires the browser session like every other API route', async () => {
    const { api, seen } = await start(() => Response.json(report));
    const result = await api.call(`/api/projects/p1/analytics/actions?${RANGE}`);
    expect(result.status).toBe(401);
    expect(seen.some((url) => url.pathname.endsWith('/analytics/actions'))).toBe(false);
  });
});
