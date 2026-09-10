import { describe, expect, it, vi } from 'vitest';
import { handleAdminRequest } from '../src/http/admin-adapter.js';
import type { AnalyticsOverview } from '../../ingest-api/src/domain/types.js';

function overview(overrides: Partial<AnalyticsOverview> = {}): AnalyticsOverview {
  return {
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
    availability: { state: 'complete', taxonomyVersions: [1] },
    ...overrides
  };
}

function repository(
  getAnalyticsOverview = vi.fn(async (): Promise<AnalyticsOverview | undefined> => overview())
) {
  return {
    listProjects: vi.fn(async () => [{ id: 'p1' }]),
    listSources: vi.fn(async () => []),
    getSource: vi.fn(async (): Promise<unknown> => undefined),
    updateSource: vi.fn(),
    setSourceStatus: vi.fn(),
    getAnalyticsSummary: vi.fn(),
    getAnalyticsOverview,
    saveAdminAudit: vi.fn(async () => undefined),
    createQuotaPolicy: vi.fn(),
    createProject: vi.fn(),
    createSource: vi.fn(),
    getPageViewCounts: vi.fn()
  };
}

const req = (path: string, authorization?: string) =>
  new Request(`https://worker.test${path}`, {
    headers: authorization !== undefined ? { authorization } : {}
  });

describe('dashboard analytics admin contract', () => {
  it('rejects the overview endpoint without a valid admin credential and never touches the repository', async () => {
    const repositories = repository();
    const response = await handleAdminRequest(
      req(
        '/v1/admin/projects/p1/analytics?start=2026-01-01T00:00:00.000Z&end=2026-01-02T00:00:00.000Z'
      ),
      { repositories: repositories as never, adminSecret: 'secret' }
    );
    expect(response?.status).toBe(401);
    expect(repositories.getAnalyticsOverview).not.toHaveBeenCalled();
    expect(repositories.saveAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'denied' })
    );
  });

  it('returns a coherent overview with a no-store cache header for a valid all-sites request', async () => {
    const repositories = repository();
    const response = await handleAdminRequest(
      req(
        '/v1/admin/projects/p1/analytics?start=2026-01-01T00:00:00.000Z&end=2026-01-02T00:00:00.000Z',
        'Bearer secret'
      ),
      { repositories: repositories as never, adminSecret: 'secret' }
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get('cache-control')).toBe('no-store');
    expect(await response?.json()).toMatchObject({ totals: { pageViews: 4, uniqueUsers: 2 } });
    expect(repositories.getAnalyticsOverview).toHaveBeenCalledWith(
      'p1',
      undefined,
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z'
    );
  });

  it('passes source_id through for a one-site scoped request', async () => {
    const repositories = repository();
    await handleAdminRequest(
      req(
        '/v1/admin/projects/p1/analytics?start=2026-01-01T00:00:00.000Z&end=2026-01-02T00:00:00.000Z&source_id=s1',
        'Bearer secret'
      ),
      { repositories: repositories as never, adminSecret: 'secret' }
    );
    expect(repositories.getAnalyticsOverview).toHaveBeenCalledWith(
      'p1',
      's1',
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z'
    );
  });

  it('rejects a missing, malformed, or unaligned range with 400 before reaching the repository', async () => {
    const repositories = repository();
    for (const query of [
      '',
      '?start=not-a-date&end=also-not',
      '?start=2026-01-01T00:00:00.500Z&end=2026-01-02T00:00:00.000Z'
    ]) {
      const response = await handleAdminRequest(
        req(`/v1/admin/projects/p1/analytics${query}`, 'Bearer secret'),
        {
          repositories: repositories as never,
          adminSecret: 'secret'
        }
      );
      expect(response?.status).toBe(400);
    }
    expect(repositories.getAnalyticsOverview).not.toHaveBeenCalled();
  });

  it('returns not_found for a project the repository has no overview for, isolating cross-project access', async () => {
    const repositories = repository(vi.fn(async () => undefined));
    const response = await handleAdminRequest(
      req(
        '/v1/admin/projects/other-project/analytics?start=2026-01-01T00:00:00.000Z&end=2026-01-02T00:00:00.000Z',
        'Bearer secret'
      ),
      { repositories: repositories as never, adminSecret: 'secret' }
    );
    expect(response?.status).toBe(404);
  });

  it('keeps the legacy per-source fixed-window analytics endpoint available alongside the overview route', async () => {
    const repositories = repository();
    repositories.getSource.mockResolvedValue({
      id: 's1',
      projectId: 'p1',
      name: 'Docs',
      publicSourceKey: 'public',
      allowedOrigins: ['https://docs.test'],
      status: 'active'
    });
    repositories.getAnalyticsSummary.mockResolvedValue({
      projectId: 'p1',
      sourceId: 's1',
      window: '24h',
      startUtc: '2026-01-01T00:00:00.000Z',
      endUtc: '2026-01-02T00:00:00.000Z',
      availability: 'complete'
    });
    const response = await handleAdminRequest(
      req('/v1/admin/projects/p1/sources/s1/analytics?window=24h', 'Bearer secret'),
      { repositories: repositories as never, adminSecret: 'secret' }
    );
    expect(response?.status).toBe(200);
    expect(repositories.getAnalyticsSummary).toHaveBeenCalledWith('p1', 's1', '24h');
  });
});
