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
});
