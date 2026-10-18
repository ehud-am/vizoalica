import { describe, expect, it, vi } from 'vitest';
import { handleAdminRequest } from '../src/http/admin-adapter.js';
import type { CampaignsReport } from '../../ingest-api/src/domain/types.js';

const RANGE = 'start=2026-01-01T00:00:00.000Z&end=2026-01-02T00:00:00.000Z';

function report(): CampaignsReport {
  return {
    scope: { projectId: 'p1', sourceId: null, label: 'All websites', identityMode: 'source-local' },
    range: {
      startUtc: '2026-01-01T00:00:00.000Z',
      endUtc: '2026-01-02T00:00:00.000Z',
      interval: 'hour',
      timezone: 'UTC'
    },
    totals: { pageViews: 2, uniqueUsers: 1, allPageViews: 5 },
    trend: [],
    sources: { items: [{ label: 'newsletter', count: 2, visitors: 1 }], otherCount: 0 },
    mediums: { items: [], otherCount: 0 },
    campaigns: { items: [], otherCount: 0 },
    rows: [{ source: 'newsletter', medium: 'email', campaign: '', count: 2, visitors: 1 }],
    other: { rows: 0, count: 0 },
    availability: { state: 'complete', taxonomyVersions: [1] }
  };
}

function repository(
  getCampaignsReport = vi.fn(async (): Promise<CampaignsReport | undefined> => report())
) {
  return {
    getCampaignsReport,
    getAnalyticsOverview: vi.fn(),
    saveAdminAudit: vi.fn(async () => undefined)
  };
}

const call = (
  repositories: ReturnType<typeof repository>,
  path: string,
  options: { authorization?: string; method?: string } = {}
) =>
  handleAdminRequest(
    new Request(`https://worker.test${path}`, {
      method: options.method ?? 'GET',
      headers: options.authorization ? { authorization: options.authorization } : {}
    }),
    { repositories: repositories as never, adminSecret: 'secret' }
  );
const auth = { authorization: 'Bearer secret' };

describe('campaigns report admin contract', () => {
  it('rejects a missing or wrong credential and never touches the repository', async () => {
    const repositories = repository();
    for (const authorization of [undefined, 'Bearer wrong', 'Basic secret']) {
      const response = await call(
        repositories,
        `/v1/admin/projects/p1/analytics/campaigns?${RANGE}`,
        {
          ...(authorization ? { authorization } : {})
        }
      );
      expect(response?.status).toBe(401);
    }
    expect(repositories.getCampaignsReport).not.toHaveBeenCalled();
    expect(repositories.saveAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'denied' })
    );
  });

  it('returns the report with a no-store header, passing project, website, range, and filters', async () => {
    const repositories = repository();
    const response = await call(
      repositories,
      `/v1/admin/projects/p1/analytics/campaigns?${RANGE}&source_id=s1&source=newsletter&medium=email&campaign=${encodeURIComponent('spring sale')}`,
      auth
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get('cache-control')).toBe('no-store');
    expect(await response?.json()).toMatchObject({
      totals: { pageViews: 2, uniqueUsers: 1, allPageViews: 5 }
    });
    expect(repositories.getCampaignsReport).toHaveBeenCalledWith(
      'p1',
      's1',
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
      { source: 'newsletter', medium: 'email', campaign: 'spring sale' }
    );
  });

  it('passes no filters and no website when none are given', async () => {
    const repositories = repository();
    await call(repositories, `/v1/admin/projects/p1/analytics/campaigns?${RANGE}`, auth);
    expect(repositories.getCampaignsReport).toHaveBeenCalledWith(
      'p1',
      undefined,
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
      {}
    );
  });

  it('refuses an empty filter instead of treating it as no filter', async () => {
    const repositories = repository();
    for (const name of ['source', 'medium', 'campaign']) {
      const response = await call(
        repositories,
        `/v1/admin/projects/p1/analytics/campaigns?${RANGE}&${name}=`,
        auth
      );
      expect(response?.status, name).toBe(400);
      expect(await response?.json()).toEqual({ error: 'invalid_request' });
    }
    expect(repositories.getCampaignsReport).not.toHaveBeenCalled();
  });

  it('rejects a missing, malformed, or unaligned range with 400 and the offending field', async () => {
    const repositories = repository();
    for (const query of [
      '',
      'start=not-a-date&end=also-not',
      'start=2026-01-01T00:00:00.500Z&end=2026-01-02T00:00:00.000Z',
      'start=2026-01-02T00:00:00.000Z&end=2026-01-01T00:00:00.000Z'
    ]) {
      const response = await call(
        repositories,
        `/v1/admin/projects/p1/analytics/campaigns?${query}`,
        auth
      );
      expect(response?.status).toBe(400);
      expect(await response?.json()).toMatchObject({ error: 'invalid_range' });
    }
    expect(repositories.getCampaignsReport).not.toHaveBeenCalled();
  });

  it('rejects filters over their limits or with control characters as invalid_request', async () => {
    const repositories = repository();
    for (const extra of [
      `source=${'a'.repeat(65)}`,
      `medium=${'a'.repeat(65)}`,
      `campaign=${encodeURIComponent('a\nb')}`,
      `source=${encodeURIComponent('a\u0000b')}`
    ]) {
      const response = await call(
        repositories,
        `/v1/admin/projects/p1/analytics/campaigns?${RANGE}&${extra}`,
        auth
      );
      expect(response?.status).toBe(400);
      expect(await response?.json()).toEqual({ error: 'invalid_request' });
    }
    expect(repositories.getCampaignsReport).not.toHaveBeenCalled();
  });

  it('accepts filters exactly at the limits', async () => {
    const repositories = repository();
    const response = await call(
      repositories,
      `/v1/admin/projects/p1/analytics/campaigns?${RANGE}&source=${'a'.repeat(64)}&campaign=${'b'.repeat(64)}`,
      auth
    );
    expect(response?.status).toBe(200);
  });

  it('returns not_found when the project or website is unknown', async () => {
    const repositories = repository(vi.fn(async () => undefined));
    const response = await call(
      repositories,
      `/v1/admin/projects/nope/analytics/campaigns?${RANGE}`,
      auth
    );
    expect(response?.status).toBe(404);
    expect(await response?.json()).toEqual({ error: 'not_found' });
  });

  it('does not route other methods, and does not disturb the overview route', async () => {
    const repositories = repository();
    const post = await call(repositories, `/v1/admin/projects/p1/analytics/campaigns?${RANGE}`, {
      ...auth,
      method: 'POST'
    });
    expect(post?.status).toBe(404);
    expect(repositories.getCampaignsReport).not.toHaveBeenCalled();
    await call(repositories, `/v1/admin/projects/p1/analytics?${RANGE}`, auth);
    expect(repositories.getAnalyticsOverview).toHaveBeenCalled();
    expect(repositories.getCampaignsReport).not.toHaveBeenCalled();
  });

  it('answers a database that misses the newer tables with a clean 503, not an unhandled error', async () => {
    const repositories = repository(
      vi.fn(async () => {
        throw new Error('D1_ERROR: no such table: dashboard_minute_campaigns');
      })
    );
    const response = await call(
      repositories,
      `/v1/admin/projects/p1/analytics/campaigns?${RANGE}`,
      auth
    );
    expect(response?.status).toBe(503);
    expect(await response?.json()).toMatchObject({ error: 'database_update_needed' });
    // Anything else still fails loudly.
    const broken = repository(
      vi.fn(async () => {
        throw new Error('something else');
      })
    );
    await expect(
      call(broken, `/v1/admin/projects/p1/analytics/campaigns?${RANGE}`, auth)
    ).rejects.toThrow('something else');
  });

  it('treats a repository without campaign support as not found', async () => {
    const response = await handleAdminRequest(
      new Request(`https://worker.test/v1/admin/projects/p1/analytics/campaigns?${RANGE}`, {
        headers: auth.authorization ? { authorization: auth.authorization } : {}
      }),
      { repositories: { saveAdminAudit: vi.fn() } as never, adminSecret: 'secret' }
    );
    expect(response?.status).toBe(404);
  });
});
