import { describe, expect, it } from 'vitest';
import { D1Repositories } from '../src/storage/d1-repositories.js';
import type { D1Database, D1Statement } from '../src/env.js';

type Options = {
  missingProject?: boolean;
  missingSource?: boolean;
  badSourceJson?: boolean;
  deletedSource?: boolean;
  missingQuota?: boolean;
  changes?: number;
  emptyAnalytics?: boolean;
};
function fakeDb(options: Options = {}) {
  const calls: Array<{ query: string; values: unknown[] }> = [];
  const project = {
    id: 'p1',
    name: 'Project',
    mode: 'production',
    default_retention_days: 7,
    quota_policy_id: 'q1'
  };
  const source = {
    id: 's1',
    project_id: 'p1',
    name: 'Docs',
    public_source_key: 'public',
    allowed_origins_json: options.badSourceJson ? '{' : '["https://docs.test"]',
    status: options.deletedSource ? 'deleted' : 'active',
    quota_policy_id: 'q1',
    created_at: '2026-01-01',
    updated_at: '2026-01-02'
  };
  const quota = {
    id: 'q1',
    max_request_bytes: 1000,
    max_events_per_batch: 25,
    max_events_per_token: 25,
    max_events_per_second: 10,
    max_events_per_day: 100,
    max_property_count: 20,
    max_property_value_length: 256,
    retention_days: 7
  };
  const db: D1Database = {
    prepare(query: string): D1Statement {
      let values: unknown[] = [];
      return {
        bind(...next: unknown[]) {
          values = next;
          calls.push({ query, values });
          return this;
        },
        async run() {
          return { meta: { changes: options.changes ?? 1 } };
        },
        async all<T>() {
          if (query.includes('FROM projects')) return { results: [project] as T[] };
          if (query.includes('FROM sources')) return { results: [source] as T[] };
          if (query.includes('dashboard_rollups'))
            return {
              results: [
                { date: '2026-01-01', path: '/', count: 3 },
                { date: '2026-01-02', path: '/docs', count: 2 }
              ] as T[]
            };
          return { results: [] };
        },
        async first<T>() {
          if (query.includes('FROM projects'))
            return (options.missingProject ? null : project) as T | null;
          if (query.includes('quota_policies'))
            return (options.missingQuota ? null : quota) as T | null;
          if (query.includes('SELECT id FROM sources'))
            return (options.missingSource ? null : { id: 's1' }) as T | null;
          if (query.includes('FROM sources'))
            return (options.missingSource ? null : source) as T | null;
          if (query.includes('SUM(page_view_count)'))
            return (options.emptyAnalytics ? null : { pageViews: 3 }) as T | null;
          if (query.includes('COUNT(DISTINCT'))
            return (options.emptyAnalytics ? null : { uniqueUsers: 2 }) as T | null;
          return null;
        }
      };
    }
  };
  return { db, calls };
}

const policy = {
  id: 'q1',
  maxRequestBytes: 1000,
  maxEventsPerBatch: 25,
  maxEventsPerToken: 25,
  maxEventsPerSecond: 10,
  maxEventsPerDay: 100,
  maxPropertyCount: 20,
  maxPropertyValueLength: 256,
  retentionDays: 7
};
const source = {
  id: 's1',
  projectId: 'p1',
  name: 'Docs',
  publicSourceKey: 'public',
  allowedOrigins: ['https://docs.test'],
  status: 'active' as const,
  quotaPolicyId: 'q1'
};

describe('D1 repositories', () => {
  it('maps project, source, and quota rows including misses and corrupt source JSON', async () => {
    const repositories = new D1Repositories(fakeDb().db);
    expect(await repositories.findProject('p1')).toMatchObject({
      id: 'p1',
      defaultRetentionDays: 7
    });
    expect(await repositories.findSourceByPublicKey('public')).toMatchObject({
      name: 'Docs',
      createdAt: '2026-01-01'
    });
    expect(await repositories.findQuotaPolicy('q1')).toEqual(policy);
    expect(
      await new D1Repositories(fakeDb({ missingProject: true }).db).findProject('x')
    ).toBeUndefined();
    expect(
      await new D1Repositories(fakeDb({ missingSource: true }).db).findSourceByPublicKey('x')
    ).toBeUndefined();
    expect(
      await new D1Repositories(fakeDb({ badSourceJson: true }).db).findSourceByPublicKey('x')
    ).toBeUndefined();
    expect(
      await new D1Repositories(fakeDb({ missingQuota: true }).db).findQuotaPolicy('x')
    ).toBeUndefined();
  });

  it('persists decisions, quota reservations, projects, policies, sources, and audits', async () => {
    const fake = fakeDb();
    const repositories = new D1Repositories(fake.db);
    await repositories.saveDecision({
      decision: 'accepted',
      reasonCodes: [],
      acceptedCount: 1,
      rejectedCount: 0,
      receivedAt: new Date('2026-01-01')
    });
    expect(
      await repositories.reserveQuota({
        projectId: 'p1',
        sourceId: 's1',
        eventCount: 1,
        requestBytes: 100,
        maxEventsPerSecond: 10,
        maxEventsPerDay: 100,
        now: new Date('2026-01-01T12:30:00Z')
      })
    ).toBe(true);
    expect(
      await new D1Repositories(fakeDb({ changes: 0 }).db).reserveQuota({
        projectId: 'p1',
        sourceId: 's1',
        eventCount: 1,
        requestBytes: 100,
        maxEventsPerSecond: 10,
        maxEventsPerDay: 100,
        now: new Date()
      })
    ).toBe(false);
    await repositories.createProject({
      id: 'p1',
      name: 'Project',
      mode: 'production',
      defaultRetentionDays: 7,
      quotaPolicyId: 'q1'
    });
    await repositories.createQuotaPolicy(policy);
    await repositories.createSource(source);
    await repositories.createSource({
      ...source,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02'
    });
    await repositories.saveAdminAudit({
      operation: 'create',
      outcome: 'allowed',
      reasonCode: 'ok'
    });
    expect(await repositories.listDecisions()).toEqual([]);
    expect(
      fake.calls.some(
        ({ query, values }) => query.includes('administrative_audit') && values.includes(null)
      )
    ).toBe(true);
  });

  it('lists and mutates source metadata with terminal deletion behavior', async () => {
    const repositories = new D1Repositories(fakeDb().db);
    expect(await repositories.listProjects()).toHaveLength(1);
    expect(await repositories.listSources('p1')).toHaveLength(1);
    expect(await repositories.getSource('p1', 's1')).toMatchObject(source);
    expect(await repositories.setSourceStatus('p1', 's1', 'disabled')).toMatchObject({ id: 's1' });
    expect(
      await repositories.updateSource('p1', 's1', {
        name: 'New',
        allowedOrigins: ['https://new.test'],
        status: 'disabled'
      })
    ).toMatchObject({ id: 's1' });
    expect(await repositories.updateSource('p1', 's1', {})).toMatchObject({ id: 's1' });
    expect(
      await new D1Repositories(fakeDb({ missingSource: true }).db).getSource('p1', 'x')
    ).toBeUndefined();
    expect(
      await new D1Repositories(fakeDb({ changes: 0 }).db).setSourceStatus('p1', 's1', 'disabled')
    ).toBeUndefined();
    expect(
      await new D1Repositories(fakeDb({ deletedSource: true }).db).updateSource('p1', 's1', {
        name: 'No'
      })
    ).toBeUndefined();
  });

  it('reads page-view and fixed-window aggregates for every supported window', async () => {
    const repositories = new D1Repositories(fakeDb().db);
    expect(await repositories.getPageViewCounts('p1', 's1', '2026-01-01', '2026-01-02')).toEqual({
      total: 5,
      byDateAndPath: [
        { date: '2026-01-01', path: '/', count: 3 },
        { date: '2026-01-02', path: '/docs', count: 2 }
      ]
    });
    expect(
      await new D1Repositories(fakeDb({ missingSource: true }).db).getPageViewCounts(
        'p1',
        's1',
        'a',
        'b'
      )
    ).toBeUndefined();
    for (const window of ['24h', '7d', '30d'] as const)
      expect(
        await repositories.getAnalyticsSummary('p1', 's1', window, new Date('2026-01-31T00:00:00Z'))
      ).toMatchObject({ window, pageViews: 3, uniqueUsers: 2 });
    expect(
      await new D1Repositories(fakeDb({ emptyAnalytics: true }).db).getAnalyticsSummary(
        'p1',
        's1',
        '24h'
      )
    ).toMatchObject({ pageViews: 0, uniqueUsers: 0 });
    expect(
      await new D1Repositories(fakeDb({ missingSource: true }).db).getAnalyticsSummary(
        'p1',
        's1',
        '24h'
      )
    ).toBeUndefined();
  });

  it('records custom and page-view rollups without storing absent visitors', async () => {
    const fake = fakeDb();
    const repositories = new D1Repositories(fake.db);
    const base = {
      projectId: 'p1',
      sourceId: 's1',
      trustLevel: 'signed-session' as const,
      consentState: 'analytics-granted' as const,
      receivedAt: new Date('2026-01-01T12:00:00Z')
    };
    await repositories.recordDashboardRollups([
      { ...base, event: { type: 'custom', data: {} } },
      {
        ...base,
        event: { type: 'com.vizoalica.page_view.v1', data: { page: { url_path: 3 }, visitor: {} } }
      }
    ] as never);
    expect(
      fake.calls.filter(({ query }) => query.includes('dashboard_hourly_visitors'))
    ).toHaveLength(0);
  });
});
