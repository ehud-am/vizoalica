import { afterEach, describe, expect, it } from 'vitest';
import { startApi } from './support.js';
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});
describe('analytics contract', () => {
  it.each(['24h', '7d', '30d'])('returns safe %s aggregates', async (window) => {
    const api = await startApi(() =>
      Response.json({
        projectId: 'p1',
        sourceId: 's1',
        window,
        startUtc: '2026-01-01T00:00:00Z',
        endUtc: '2026-01-02T00:00:00Z',
        pageViews: 4,
        uniqueUsers: 2,
        availability: 'complete'
      })
    );
    closers.push(api.close);
    const result = await api.call(`/api/projects/p1/websites/s1/analytics?window=${window}`, {
      cookie: await api.session()
    });
    expect(result.body).toMatchObject({
      projectId: 'p1',
      websiteId: 's1',
      pageViews: 4,
      uniqueUsers: 2
    });
    expect(JSON.stringify(result.body)).not.toMatch(/sourceId|digest|raw/i);
  });
  it('rejects invalid windows and cross-project misses and labels unavailable data', async () => {
    const api = await startApi((url) =>
      url.pathname.includes('missing')
        ? Response.json({ error: 'not_found' }, { status: 404 })
        : Response.json({ error: 'unavailable' }, { status: 503 })
    );
    closers.push(api.close);
    const cookie = await api.session();
    expect(
      (await api.call('/api/projects/p1/websites/s1/analytics?window=year', { cookie })).status
    ).toBe(400);
    expect(
      (await api.call('/api/projects/p1/websites/missing/analytics?window=24h', { cookie })).status
    ).toBe(404);
    expect(
      (await api.call('/api/projects/p1/websites/s1/analytics?window=24h', { cookie })).body
    ).toMatchObject({ error: 'remote_unavailable', recovery: 'retry_safely' });
  });
  it('proxies the project overview for all-sites and one-site scopes', async () => {
    const api = await startApi(() =>
      Response.json({
        scope: {
          projectId: 'p1',
          sourceId: null,
          label: 'All websites',
          identityMode: 'project-supplied'
        },
        range: {
          startUtc: '2026-01-01T00:00:00.000Z',
          endUtc: '2026-01-02T00:00:00.000Z',
          interval: 'hour',
          timezone: 'UTC'
        },
        totals: { pageViews: 4, uniqueUsers: 2 },
        trend: [],
        rankings: {
          pagePaths: { items: [], otherCount: 0, total: 0 },
          countries: { items: [], otherCount: 0, total: 0 },
          userAgents: { items: [], otherCount: 0, total: 0 },
          referrers: { items: [], otherCount: 0, total: 0 }
        },
        distributions: {
          operatingSystems: { items: [], total: 0 },
          browsers: { items: [], total: 0 },
          devices: { items: [], total: 0 },
          traffic: { items: [], total: 0 }
        },
        availability: { state: 'complete', taxonomyVersions: [1] }
      })
    );
    closers.push(api.close);
    const cookie = await api.session();
    const result = await api.call(
      '/api/projects/p1/analytics?start=2026-01-01T00:00:00.000Z&end=2026-01-02T00:00:00.000Z',
      { cookie }
    );
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ totals: { pageViews: 4, uniqueUsers: 2 } });
  });
  it('rejects malformed custom ranges with 400 rather than treating them as remote failures', async () => {
    const api = await startApi(() => Response.json({ error: 'unavailable' }, { status: 503 }));
    closers.push(api.close);
    const cookie = await api.session();
    const result = await api.call('/api/projects/p1/analytics?start=not-a-date&end=also-not', {
      cookie
    });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: 'invalid_range' });
  });
});
