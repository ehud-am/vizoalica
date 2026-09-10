import { afterEach, describe, expect, it } from 'vitest';
import { startApi } from './support.js';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

function overviewBody() {
  return {
    scope: { projectId: 'p1', sourceId: null, label: 'All websites', identityMode: 'project-supplied' },
    range: {
      startUtc: '2026-01-01T00:00:00.000Z',
      endUtc: '2026-01-02T00:00:00.000Z',
      interval: 'hour',
      timezone: 'UTC'
    },
    totals: { pageViews: 0, uniqueUsers: 0 },
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
  };
}

describe('local proxy range contract', () => {
  it('rejects a missing start or end without calling the remote worker', async () => {
    let remoteCalled = false;
    const api = await startApi(() => {
      remoteCalled = true;
      return Response.json(overviewBody());
    });
    closers.push(api.close);
    const cookie = await api.session();
    const result = await api.call('/api/projects/p1/analytics?end=2026-01-02T00:00:00.000Z', {
      cookie
    });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: 'invalid_range', field: 'start' });
    expect(remoteCalled).toBe(false);
  });

  it('rejects a malformed date string locally', async () => {
    const api = await startApi(() => Response.json(overviewBody()));
    closers.push(api.close);
    const cookie = await api.session();
    const result = await api.call(
      '/api/projects/p1/analytics?start=not-a-date&end=2026-01-02T00:00:00.000Z',
      { cookie }
    );
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: 'invalid_range', field: 'start' });
  });

  it('rejects a range unaligned to a whole minute', async () => {
    const api = await startApi(() => Response.json(overviewBody()));
    closers.push(api.close);
    const cookie = await api.session();
    const result = await api.call(
      '/api/projects/p1/analytics?start=2026-01-01T00:00:00.500Z&end=2026-01-02T00:00:00.000Z',
      { cookie }
    );
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: 'invalid_range', field: 'start' });
  });

  it('rejects a reversed range', async () => {
    const api = await startApi(() => Response.json(overviewBody()));
    closers.push(api.close);
    const cookie = await api.session();
    const result = await api.call(
      '/api/projects/p1/analytics?start=2026-01-02T00:00:00.000Z&end=2026-01-01T00:00:00.000Z',
      { cookie }
    );
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: 'invalid_range', field: 'end' });
  });

  it('rejects a range longer than 30 days', async () => {
    const api = await startApi(() => Response.json(overviewBody()));
    closers.push(api.close);
    const cookie = await api.session();
    const result = await api.call(
      '/api/projects/p1/analytics?start=2026-01-01T00:00:00.000Z&end=2026-03-01T00:00:00.000Z',
      { cookie }
    );
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: 'invalid_range', field: 'end' });
  });

  it('surfaces the upstream field-level error when the worker itself rejects the range', async () => {
    const api = await startApi(() =>
      Response.json(
        { error: 'invalid_range', field: 'end', message: 'End must be after start.' },
        { status: 400 }
      )
    );
    closers.push(api.close);
    const cookie = await api.session();
    const result = await api.call(
      '/api/projects/p1/analytics?start=2026-01-01T00:00:00.000Z&end=2026-01-01T01:00:00.000Z',
      { cookie }
    );
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: 'invalid_range', field: 'end' });
  });

  it('echoes back the exact accepted boundaries from the worker response', async () => {
    const api = await startApi(() => Response.json(overviewBody()));
    closers.push(api.close);
    const cookie = await api.session();
    const result = await api.call(
      '/api/projects/p1/analytics?start=2026-01-01T00:00:00.000Z&end=2026-01-02T00:00:00.000Z',
      { cookie }
    );
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      range: { startUtc: '2026-01-01T00:00:00.000Z', endUtc: '2026-01-02T00:00:00.000Z' }
    });
  });
});
