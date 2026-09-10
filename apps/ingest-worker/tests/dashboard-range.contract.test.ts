import { describe, expect, it, vi } from 'vitest';
import { handleAdminRequest } from '../src/http/admin-adapter.js';
import type { AnalyticsOverview } from '../../ingest-api/src/domain/types.js';

function overview(): AnalyticsOverview {
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

function repository() {
  return {
    listProjects: vi.fn(async () => [{ id: 'p1' }]),
    listSources: vi.fn(async () => []),
    getSource: vi.fn(async () => undefined),
    updateSource: vi.fn(),
    setSourceStatus: vi.fn(),
    getAnalyticsSummary: vi.fn(),
    getAnalyticsOverview: vi.fn(async (): Promise<AnalyticsOverview | undefined> => overview()),
    saveAdminAudit: vi.fn(async () => undefined),
    createQuotaPolicy: vi.fn(),
    createProject: vi.fn(),
    createSource: vi.fn(),
    getPageViewCounts: vi.fn()
  };
}

const req = (query: string) =>
  new Request(`https://worker.test/v1/admin/projects/p1/analytics${query}`, {
    headers: { authorization: 'Bearer secret' }
  });

describe('dashboard range Worker contract', () => {
  it('rejects a request missing start or end, naming the missing field', async () => {
    const repositories = repository();
    const dependencies = { repositories: repositories as never, adminSecret: 'secret' };
    const missingStart = await handleAdminRequest(req('?end=2026-01-02T00:00:00.000Z'), dependencies);
    expect(missingStart?.status).toBe(400);
    expect(await missingStart?.json()).toMatchObject({ error: 'invalid_range', field: 'start' });

    const missingEnd = await handleAdminRequest(req('?start=2026-01-01T00:00:00.000Z'), dependencies);
    expect(missingEnd?.status).toBe(400);
    expect(await missingEnd?.json()).toMatchObject({ error: 'invalid_range', field: 'end' });
  });

  it('rejects a malformed date string', async () => {
    const response = await handleAdminRequest(
      req('?start=not-a-date&end=2026-01-02T00:00:00.000Z'),
      { repositories: repository() as never, adminSecret: 'secret' }
    );
    expect(response?.status).toBe(400);
    expect(await response?.json()).toMatchObject({ error: 'invalid_range', field: 'start' });
  });

  it('rejects a range unaligned to a whole minute', async () => {
    const response = await handleAdminRequest(
      req('?start=2026-01-01T00:00:00.500Z&end=2026-01-02T00:00:00.000Z'),
      { repositories: repository() as never, adminSecret: 'secret' }
    );
    expect(response?.status).toBe(400);
    expect(await response?.json()).toMatchObject({ error: 'invalid_range', field: 'start' });
  });

  it('rejects an end later than the current complete minute', async () => {
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    farFuture.setUTCSeconds(0, 0);
    const response = await handleAdminRequest(
      req(`?start=2026-01-01T00:00:00.000Z&end=${farFuture.toISOString()}`),
      { repositories: repository() as never, adminSecret: 'secret' }
    );
    expect(response?.status).toBe(400);
    expect(await response?.json()).toMatchObject({ error: 'invalid_range', field: 'end' });
  });

  it('rejects a reversed range', async () => {
    const response = await handleAdminRequest(
      req('?start=2026-01-02T00:00:00.000Z&end=2026-01-01T00:00:00.000Z'),
      { repositories: repository() as never, adminSecret: 'secret' }
    );
    expect(response?.status).toBe(400);
    expect(await response?.json()).toMatchObject({ error: 'invalid_range', field: 'end' });
  });

  it('rejects a range longer than 30 days', async () => {
    const response = await handleAdminRequest(
      req('?start=2026-01-01T00:00:00.000Z&end=2026-03-01T00:00:00.000Z'),
      { repositories: repository() as never, adminSecret: 'secret' }
    );
    expect(response?.status).toBe(400);
    expect(await response?.json()).toMatchObject({ error: 'invalid_range', field: 'end' });
  });

  it('echoes back exactly the accepted boundaries in the response range', async () => {
    const repositories = repository();
    const response = await handleAdminRequest(
      req('?start=2026-01-01T00:00:00.000Z&end=2026-01-02T00:00:00.000Z'),
      { repositories: repositories as never, adminSecret: 'secret' }
    );
    expect(response?.status).toBe(200);
    expect(repositories.getAnalyticsOverview).toHaveBeenCalledWith(
      'p1',
      undefined,
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z'
    );
    const body = (await response?.json()) as AnalyticsOverview;
    expect(body.range).toMatchObject({
      startUtc: '2026-01-01T00:00:00.000Z',
      endUtc: '2026-01-02T00:00:00.000Z'
    });
  });
});
