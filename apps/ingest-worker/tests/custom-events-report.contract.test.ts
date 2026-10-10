import { describe, expect, it, vi } from 'vitest';
import { handleAdminRequest } from '../src/http/admin-adapter.js';
import type { CustomEventsReport } from '../../ingest-api/src/domain/types.js';

const RANGE = 'start=2026-01-01T00:00:00.000Z&end=2026-01-02T00:00:00.000Z';

function report(): CustomEventsReport {
  return {
    scope: { projectId: 'p1', sourceId: null, label: 'All websites', identityMode: 'source-local' },
    range: {
      startUtc: '2026-01-01T00:00:00.000Z',
      endUtc: '2026-01-02T00:00:00.000Z',
      interval: 'hour',
      timezone: 'UTC'
    },
    totals: { events: 2, uniqueUsers: 1 },
    events: [{ event: 'signup', count: 2, visitors: 1, pages: 1 }],
    other: { events: 0, count: 0 },
    trend: [],
    pages: [],
    withoutPage: 0,
    properties: [],
    availability: { state: 'complete', taxonomyVersions: [1] }
  };
}

function repository(
  getCustomEventsReport = vi.fn(async (): Promise<CustomEventsReport | undefined> => report())
) {
  return {
    getCustomEventsReport,
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

describe('custom events report admin contract', () => {
  it('rejects a missing or wrong credential and never touches the repository', async () => {
    const repositories = repository();
    for (const authorization of [undefined, 'Bearer wrong', 'Basic secret']) {
      const response = await call(
        repositories,
        `/v1/admin/projects/p1/analytics/custom-events?${RANGE}`,
        {
          ...(authorization ? { authorization } : {})
        }
      );
      expect(response?.status).toBe(401);
    }
    expect(repositories.getCustomEventsReport).not.toHaveBeenCalled();
    expect(repositories.saveAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'denied' })
    );
  });

  it('returns the report with a no-store header, passing project, website, range, and filters', async () => {
    const repositories = repository();
    const response = await call(
      repositories,
      `/v1/admin/projects/p1/analytics/custom-events?${RANGE}&source_id=s1&page=${encodeURIComponent('/#/orders/:id')}&event=signup`,
      auth
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get('cache-control')).toBe('no-store');
    expect(await response?.json()).toMatchObject({ totals: { events: 2, uniqueUsers: 1 } });
    expect(repositories.getCustomEventsReport).toHaveBeenCalledWith(
      'p1',
      's1',
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
      { page: '/#/orders/:id', event: 'signup' }
    );
  });

  it('passes no filters and no website when none are given, treating empty filters as absent', async () => {
    const repositories = repository();
    await call(
      repositories,
      `/v1/admin/projects/p1/analytics/custom-events?${RANGE}&page=&event=`,
      auth
    );
    expect(repositories.getCustomEventsReport).toHaveBeenCalledWith(
      'p1',
      undefined,
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
      {}
    );
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
        `/v1/admin/projects/p1/analytics/custom-events?${query}`,
        auth
      );
      expect(response?.status).toBe(400);
      expect(await response?.json()).toMatchObject({ error: 'invalid_range' });
    }
    expect(repositories.getCustomEventsReport).not.toHaveBeenCalled();
  });

  it('rejects filters over their limits or with control characters as invalid_request', async () => {
    const repositories = repository();
    for (const extra of [
      `page=${'a'.repeat(1025)}`,
      `event=${'a'.repeat(65)}`,
      `page=${encodeURIComponent('/a\nb')}`,
      `event=${encodeURIComponent('a\u0000b')}`
    ]) {
      const response = await call(
        repositories,
        `/v1/admin/projects/p1/analytics/custom-events?${RANGE}&${extra}`,
        auth
      );
      expect(response?.status).toBe(400);
      expect(await response?.json()).toEqual({ error: 'invalid_request' });
    }
    expect(repositories.getCustomEventsReport).not.toHaveBeenCalled();
  });

  it('accepts filters exactly at the limits', async () => {
    const repositories = repository();
    const response = await call(
      repositories,
      `/v1/admin/projects/p1/analytics/custom-events?${RANGE}&page=${'a'.repeat(1024)}&event=${'b'.repeat(64)}`,
      auth
    );
    expect(response?.status).toBe(200);
  });

  it('returns not_found when the project or website is unknown', async () => {
    const repositories = repository(vi.fn(async () => undefined));
    const response = await call(
      repositories,
      `/v1/admin/projects/nope/analytics/custom-events?${RANGE}`,
      auth
    );
    expect(response?.status).toBe(404);
    expect(await response?.json()).toEqual({ error: 'not_found' });
  });

  it('does not route other methods, and does not disturb the overview route', async () => {
    const repositories = repository();
    const post = await call(
      repositories,
      `/v1/admin/projects/p1/analytics/custom-events?${RANGE}`,
      {
        ...auth,
        method: 'POST'
      }
    );
    expect(post?.status).toBe(404);
    expect(repositories.getCustomEventsReport).not.toHaveBeenCalled();
    await call(repositories, `/v1/admin/projects/p1/analytics?${RANGE}`, auth);
    expect(repositories.getAnalyticsOverview).toHaveBeenCalled();
    expect(repositories.getCustomEventsReport).not.toHaveBeenCalled();
  });

  it('treats a repository without custom event support as not found', async () => {
    const response = await handleAdminRequest(
      new Request(`https://worker.test/v1/admin/projects/p1/analytics/custom-events?${RANGE}`, {
        headers: auth.authorization ? { authorization: auth.authorization } : {}
      }),
      { repositories: { saveAdminAudit: vi.fn() } as never, adminSecret: 'secret' }
    );
    expect(response?.status).toBe(404);
  });
});
