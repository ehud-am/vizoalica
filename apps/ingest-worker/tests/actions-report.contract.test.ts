import { describe, expect, it, vi } from 'vitest';
import { handleAdminRequest } from '../src/http/admin-adapter.js';
import type { ActionsReport } from '../../ingest-api/src/domain/types.js';

const RANGE = 'start=2026-01-01T00:00:00.000Z&end=2026-01-02T00:00:00.000Z';

function report(): ActionsReport {
  return {
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
}

function repository(
  getActionsReport = vi.fn(async (): Promise<ActionsReport | undefined> => report())
) {
  return {
    getActionsReport,
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

describe('actions report admin contract', () => {
  it('rejects a missing or wrong credential and never touches the repository', async () => {
    const repositories = repository();
    for (const authorization of [undefined, 'Bearer wrong', 'Basic secret']) {
      const response = await call(
        repositories,
        `/v1/admin/projects/p1/analytics/actions?${RANGE}`,
        {
          ...(authorization ? { authorization } : {})
        }
      );
      expect(response?.status).toBe(401);
    }
    expect(repositories.getActionsReport).not.toHaveBeenCalled();
    expect(repositories.saveAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'denied' })
    );
  });

  it('returns the report with a no-store header, passing project, website, range, and filters', async () => {
    const repositories = repository();
    const response = await call(
      repositories,
      `/v1/admin/projects/p1/analytics/actions?${RANGE}&source_id=s1&page=${encodeURIComponent('/#/orders/:id')}&action=Go`,
      auth
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get('cache-control')).toBe('no-store');
    expect(await response?.json()).toMatchObject({ totals: { actions: 2, uniqueUsers: 1 } });
    expect(repositories.getActionsReport).toHaveBeenCalledWith(
      'p1',
      's1',
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
      { page: '/#/orders/:id', action: 'Go' }
    );
  });

  it('passes no filters and no website when none are given, treating empty filters as absent', async () => {
    const repositories = repository();
    await call(
      repositories,
      `/v1/admin/projects/p1/analytics/actions?${RANGE}&page=&action=`,
      auth
    );
    expect(repositories.getActionsReport).toHaveBeenCalledWith(
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
        `/v1/admin/projects/p1/analytics/actions?${query}`,
        auth
      );
      expect(response?.status).toBe(400);
      expect(await response?.json()).toMatchObject({ error: 'invalid_range' });
    }
    expect(repositories.getActionsReport).not.toHaveBeenCalled();
  });

  it('rejects filters over their limits or with control characters as invalid_request', async () => {
    const repositories = repository();
    for (const extra of [
      `page=${'a'.repeat(1025)}`,
      `action=${'a'.repeat(81)}`,
      `page=${encodeURIComponent('/a\nb')}`,
      `action=${encodeURIComponent('a\u0000b')}`
    ]) {
      const response = await call(
        repositories,
        `/v1/admin/projects/p1/analytics/actions?${RANGE}&${extra}`,
        auth
      );
      expect(response?.status).toBe(400);
      expect(await response?.json()).toEqual({ error: 'invalid_request' });
    }
    expect(repositories.getActionsReport).not.toHaveBeenCalled();
  });

  it('accepts filters exactly at the limits', async () => {
    const repositories = repository();
    const response = await call(
      repositories,
      `/v1/admin/projects/p1/analytics/actions?${RANGE}&page=${'a'.repeat(1024)}&action=${'b'.repeat(80)}`,
      auth
    );
    expect(response?.status).toBe(200);
  });

  it('returns not_found when the project or website is unknown', async () => {
    const repositories = repository(vi.fn(async () => undefined));
    const response = await call(
      repositories,
      `/v1/admin/projects/nope/analytics/actions?${RANGE}`,
      auth
    );
    expect(response?.status).toBe(404);
    expect(await response?.json()).toEqual({ error: 'not_found' });
  });

  it('does not route other methods, and does not disturb the overview route', async () => {
    const repositories = repository();
    const post = await call(repositories, `/v1/admin/projects/p1/analytics/actions?${RANGE}`, {
      ...auth,
      method: 'POST'
    });
    expect(post?.status).toBe(404);
    expect(repositories.getActionsReport).not.toHaveBeenCalled();
    await call(repositories, `/v1/admin/projects/p1/analytics?${RANGE}`, auth);
    expect(repositories.getAnalyticsOverview).toHaveBeenCalled();
    expect(repositories.getActionsReport).not.toHaveBeenCalled();
  });

  it('treats a repository without action support as not found', async () => {
    const response = await handleAdminRequest(
      new Request(`https://worker.test/v1/admin/projects/p1/analytics/actions?${RANGE}`, {
        headers: auth.authorization ? { authorization: auth.authorization } : {}
      }),
      { repositories: { saveAdminAudit: vi.fn() } as never, adminSecret: 'secret' }
    );
    expect(response?.status).toBe(404);
  });
});
