import { describe, expect, it, vi } from 'vitest';
import { handleAdminRequest } from '../src/http/admin-adapter.js';
import type { RageClicksReport } from '../../ingest-api/src/domain/types.js';

const RANGE = 'start=2026-01-01T00:00:00.000Z&end=2026-01-02T00:00:00.000Z';
const PATH = '/v1/admin/projects/p1/analytics/rage-clicks';

function report(): RageClicksReport {
  return {
    scope: { projectId: 'p1', sourceId: null, label: 'All websites', identityMode: 'source-local' },
    range: {
      startUtc: '2026-01-01T00:00:00.000Z',
      endUtc: '2026-01-02T00:00:00.000Z',
      interval: 'hour',
      timezone: 'UTC'
    },
    totals: { bursts: 3, clicks: 40 },
    trend: [],
    rows: [{ page: '/pricing', action: 'Pay', kind: 'button', count: 3, clicks: 40 }],
    other: { rows: 0, count: 0 },
    availability: { state: 'complete', taxonomyVersions: [1] }
  };
}

function repository(
  getRageClicksReport = vi.fn(async (): Promise<RageClicksReport | undefined> => report())
) {
  return {
    getRageClicksReport,
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

describe('rage clicks report admin contract', () => {
  it('rejects a missing or wrong credential and never touches the repository', async () => {
    const repositories = repository();
    for (const authorization of [undefined, 'Bearer wrong', 'Basic secret']) {
      const response = await call(repositories, `${PATH}?${RANGE}`, {
        ...(authorization ? { authorization } : {})
      });
      expect(response?.status).toBe(401);
    }
    expect(repositories.getRageClicksReport).not.toHaveBeenCalled();
  });

  it('returns the report with a no-store header, passing project, website, range, and filters', async () => {
    const repositories = repository();
    const response = await call(
      repositories,
      `${PATH}?${RANGE}&source_id=s1&page=${encodeURIComponent('/pricing')}&action=${encodeURIComponent('Pay now')}`,
      auth
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get('cache-control')).toBe('no-store');
    expect(await response?.json()).toMatchObject({ totals: { bursts: 3, clicks: 40 } });
    expect(repositories.getRageClicksReport).toHaveBeenCalledWith(
      'p1',
      's1',
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
      { page: '/pricing', action: 'Pay now' }
    );
  });

  it('passes no filters and no website when none are given', async () => {
    const repositories = repository();
    await call(repositories, `${PATH}?${RANGE}`, auth);
    expect(repositories.getRageClicksReport).toHaveBeenCalledWith(
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
      const response = await call(repositories, `${PATH}?${query}`, auth);
      expect(response?.status).toBe(400);
      expect(await response?.json()).toMatchObject({ error: 'invalid_range' });
    }
    expect(repositories.getRageClicksReport).not.toHaveBeenCalled();
  });

  it('rejects filters over their limits or with control characters as invalid_request', async () => {
    const repositories = repository();
    for (const extra of [
      `action=${'a'.repeat(81)}`,
      `page=${'a'.repeat(1025)}`,
      `action=${encodeURIComponent('a\nb')}`
    ]) {
      const response = await call(repositories, `${PATH}?${RANGE}&${extra}`, auth);
      expect(response?.status).toBe(400);
      expect(await response?.json()).toEqual({ error: 'invalid_request' });
    }
    expect(repositories.getRageClicksReport).not.toHaveBeenCalled();
    const atLimit = await call(
      repositories,
      `${PATH}?${RANGE}&action=${'a'.repeat(80)}&page=${'b'.repeat(1024)}`,
      auth
    );
    expect(atLimit?.status).toBe(200);
  });

  it('returns not_found when the project or website is unknown', async () => {
    const repositories = repository(vi.fn(async () => undefined));
    const response = await call(repositories, `${PATH}?${RANGE}`, auth);
    expect(response?.status).toBe(404);
    expect(await response?.json()).toEqual({ error: 'not_found' });
  });

  it('does not route other methods, and does not disturb the overview route', async () => {
    const repositories = repository();
    const post = await call(repositories, `${PATH}?${RANGE}`, { ...auth, method: 'POST' });
    expect(post?.status).toBe(404);
    await call(repositories, `/v1/admin/projects/p1/analytics?${RANGE}`, auth);
    expect(repositories.getAnalyticsOverview).toHaveBeenCalled();
    expect(repositories.getRageClicksReport).not.toHaveBeenCalled();
  });

  it('answers a database that misses the newer tables with a clean 503, not an unhandled error', async () => {
    const repositories = repository(
      vi.fn(async () => {
        throw new Error('D1_ERROR: no such table: dashboard_minute_rage_clicks');
      })
    );
    const response = await call(repositories, `${PATH}?${RANGE}`, auth);
    expect(response?.status).toBe(503);
    expect(await response?.json()).toMatchObject({ error: 'database_update_needed' });
    const broken = repository(
      vi.fn(async () => {
        throw new Error('something else');
      })
    );
    await expect(call(broken, `${PATH}?${RANGE}`, auth)).rejects.toThrow('something else');
  });

  it('treats a repository without rage click support as not found', async () => {
    const response = await handleAdminRequest(
      new Request(`https://worker.test${PATH}?${RANGE}`, {
        headers: { authorization: auth.authorization }
      }),
      { repositories: { saveAdminAudit: vi.fn() } as never, adminSecret: 'secret' }
    );
    expect(response?.status).toBe(404);
  });
});
