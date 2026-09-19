import { describe, expect, it } from 'vitest';
import { D1Repositories } from '../src/storage/d1-repositories.js';
import type { D1Database, D1Statement } from '../src/env.js';

type Row = Record<string, unknown>;

function manyDimensionRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    label: `/page-${index}`,
    count: count - index
  }));
}

function fakeDb(
  options: {
    pageViews?: number;
    uniqueUsers?: number;
    pageTrend?: Row[];
    visitorTrend?: Row[];
    dimensionRows?: Row[];
    availableFromUtc?: string;
    lastCompletedAt?: string;
    identityKinds?: string[];
    taxonomyVersions?: number[];
    missingProject?: boolean;
    missingSource?: boolean;
    deletedSource?: boolean;
  } = {}
) {
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
    allowed_origins_json: '["https://docs.test"]',
    status: options.deletedSource ? 'deleted' : 'active',
    quota_policy_id: 'q1'
  };
  // What a query returns, keyed by the table it reads; single-row aggregates come back as one row.
  const rowsFor = (query: string): unknown[] => {
    const grouped = query.includes('GROUP BY');
    if (query.includes('FROM dashboard_minute_totals'))
      return grouped ? (options.pageTrend ?? []) : [{ pageViews: options.pageViews ?? 0 }];
    if (query.includes('DISTINCT identity_kind'))
      return (options.identityKinds ?? ['source-local']).map((kind) => ({ kind }));
    if (query.includes('FROM dashboard_minute_visitors'))
      return grouped ? (options.visitorTrend ?? []) : [{ uniqueUsers: options.uniqueUsers ?? 0 }];
    if (query.includes('DISTINCT taxonomy_version'))
      return (options.taxonomyVersions ?? [1]).map((version) => ({ version }));
    if (query.includes('FROM dashboard_minute_dimensions')) return options.dimensionRows ?? [];
    if (query.includes('FROM dashboard_aggregate_watermarks'))
      return options.availableFromUtc || options.lastCompletedAt
        ? [
            {
              availableFromUtc: options.availableFromUtc,
              lastCompletedAt: options.lastCompletedAt
            }
          ]
        : [{}];
    if (query.includes('FROM projects')) return options.missingProject ? [] : [project];
    if (query.includes('FROM sources')) return options.missingSource ? [] : [source];
    return [];
  };
  const trips: number[] = [];
  const statement = (query: string): D1Statement & { rows(): unknown[] } => {
    const self: D1Statement & { rows(): unknown[] } = {
      bind(...next: unknown[]) {
        calls.push({ query, values: next });
        return self;
      },
      rows: () => rowsFor(query),
      async run() {
        return { meta: { changes: 1 } };
      },
      async all<T>() {
        trips.push(1);
        return { results: self.rows() as T[] };
      },
      async first<T>() {
        trips.push(1);
        return (self.rows()[0] ?? null) as T | null;
      }
    };
    return self;
  };
  const db: D1Database = {
    prepare: (query: string) => statement(query),
    async batch(statements) {
      // One round trip, however many statements it carries.
      trips.push(1);
      return statements.map((item) => ({ results: (item as ReturnType<typeof statement>).rows() }));
    }
  };
  return { db, calls, trips };
}

describe('dashboard analytics overview query', () => {
  it('returns totals and distinct visitors for the all-sites scope', async () => {
    const fake = fakeDb({ pageViews: 42, uniqueUsers: 17 });
    const repositories = new D1Repositories(fake.db);
    const overview = await repositories.getAnalyticsOverview(
      'p1',
      undefined,
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z'
    );
    expect(overview?.totals).toEqual({ pageViews: 42, uniqueUsers: 17 });
    expect(overview?.scope).toMatchObject({ sourceId: null, label: 'All websites' });
    const scopedCall = fake.calls.find((call) => call.query.includes('SUM(page_view_count)'));
    expect(scopedCall?.query).toMatch(/source_id IN \(SELECT id FROM sources/);
  });

  it('scopes totals to one source and labels it by name', async () => {
    const fake = fakeDb({ pageViews: 9, uniqueUsers: 4 });
    const repositories = new D1Repositories(fake.db);
    const overview = await repositories.getAnalyticsOverview(
      'p1',
      's1',
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z'
    );
    expect(overview?.totals).toEqual({ pageViews: 9, uniqueUsers: 4 });
    expect(overview?.scope).toMatchObject({ sourceId: 's1', label: 'Docs' });
    const scopedCall = fake.calls.find((call) => call.query.includes('SUM(page_view_count)'));
    expect(scopedCall?.query).toMatch(/AND source_id = \?/);
    expect(scopedCall?.values).toEqual([
      'p1',
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
      's1'
    ]);
  });

  it('excludes a deleted source rather than returning its analytics', async () => {
    const repositories = new D1Repositories(fakeDb({ deletedSource: true }).db);
    const overview = await repositories.getAnalyticsOverview(
      'p1',
      's1',
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z'
    );
    expect(overview).toBeUndefined();
  });

  it('returns undefined for a project the caller does not own', async () => {
    const repositories = new D1Repositories(fakeDb({ missingProject: true }).db);
    const overview = await repositories.getAnalyticsOverview(
      'other-project',
      undefined,
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z'
    );
    expect(overview).toBeUndefined();
  });

  it('selects an hourly trend bucket for a range at or under 24 hours and a daily bucket beyond it', async () => {
    const shortRange = await new D1Repositories(fakeDb().db).getAnalyticsOverview(
      'p1',
      undefined,
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z'
    );
    expect(shortRange?.range.interval).toBe('hour');
    const longRange = await new D1Repositories(fakeDb().db).getAnalyticsOverview(
      'p1',
      undefined,
      '2026-01-01T00:00:00.000Z',
      '2026-01-10T00:00:00.000Z'
    );
    expect(longRange?.range.interval).toBe('day');
  });

  it('fills zero uniqueUsers/pageViews when only one of the two trend queries has a bucket', async () => {
    const fake = fakeDb({
      pageTrend: [{ startUtc: '2026-01-01T00:00:00.000Z', pageViews: 5 }],
      visitorTrend: [{ startUtc: '2026-01-01T01:00:00.000Z', uniqueUsers: 3 }]
    });
    const overview = await new D1Repositories(fake.db).getAnalyticsOverview(
      'p1',
      undefined,
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z'
    );
    expect(overview?.trend).toEqual([
      { startUtc: '2026-01-01T00:00:00.000Z', pageViews: 5, uniqueUsers: 0 },
      { startUtc: '2026-01-01T01:00:00.000Z', pageViews: 0, uniqueUsers: 3 }
    ]);
  });

  it('returns every ranked row when there are fewer than the ranking limits', async () => {
    const fake = fakeDb({ dimensionRows: manyDimensionRows(13) });
    const overview = await new D1Repositories(fake.db).getAnalyticsOverview(
      'p1',
      undefined,
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z'
    );
    expect(overview?.rankings.pagePaths.items).toHaveLength(13);
    expect(overview?.rankings.countries.items).toHaveLength(13);
    expect(overview?.rankings.pagePaths.otherCount).toBe(0);
    expect(overview?.rankings.pagePaths.total).toBe(
      manyDimensionRows(13).reduce((sum, row) => sum + row.count, 0)
    );
  });

  it('caps pages, referrers, and user agents at 100 rows and countries at 300, folding the rest into otherCount', async () => {
    const rows = manyDimensionRows(350);
    const fake = fakeDb({ dimensionRows: rows });
    const overview = await new D1Repositories(fake.db).getAnalyticsOverview(
      'p1',
      undefined,
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z'
    );
    const sum = (list: typeof rows) => list.reduce((total, row) => total + row.count, 0);
    expect(overview?.rankings.pagePaths.items).toHaveLength(100);
    expect(overview?.rankings.pagePaths.otherCount).toBe(sum(rows.slice(100)));
    expect(overview?.rankings.referrers.items).toHaveLength(100);
    expect(overview?.rankings.userAgents.items).toHaveLength(100);
    expect(overview?.rankings.countries.items).toHaveLength(300);
    expect(overview?.rankings.countries.otherCount).toBe(sum(rows.slice(300)));
    expect(overview?.rankings.countries.total).toBe(sum(rows));
  });

  it('caps distributions at eleven explicit items with a synthesized Other slice beyond that', async () => {
    const fake = fakeDb({ dimensionRows: manyDimensionRows(13) });
    const overview = await new D1Repositories(fake.db).getAnalyticsOverview(
      'p1',
      undefined,
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z'
    );
    expect(overview?.distributions.operatingSystems.items).toHaveLength(12);
    expect(overview?.distributions.operatingSystems.items.at(-1)).toMatchObject({ label: 'Other' });
  });

  it('does not add an Other row to a distribution with ten or fewer values', async () => {
    const fake = fakeDb({ dimensionRows: manyDimensionRows(5) });
    const overview = await new D1Repositories(fake.db).getAnalyticsOverview(
      'p1',
      undefined,
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z'
    );
    expect(overview?.distributions.operatingSystems.items).toHaveLength(5);
    expect(
      overview?.distributions.operatingSystems.items.some((item) => item.label === 'Other')
    ).toBe(false);
  });

  it('reports complete availability for empty data and lists taxonomy version 1', async () => {
    const overview = await new D1Repositories(fakeDb().db).getAnalyticsOverview(
      'p1',
      undefined,
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z'
    );
    expect(overview?.totals).toEqual({ pageViews: 0, uniqueUsers: 0 });
    expect(overview?.availability).toMatchObject({ state: 'complete', taxonomyVersions: [1] });
  });

  it('marks the range incomplete when it starts before the watermark says expanded analytics were available', async () => {
    const fake = fakeDb({ availableFromUtc: '2026-01-01T12:00:00.000Z' });
    const overview = await new D1Repositories(fake.db).getAnalyticsOverview(
      'p1',
      undefined,
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z'
    );
    expect(overview?.availability.state).toBe('incomplete');
    expect(overview?.availability.availableFromUtc).toBe('2026-01-01T12:00:00.000Z');
  });

  it('reports mixed identity mode when both source-local and project-supplied visitors are present', async () => {
    const fake = fakeDb({ identityKinds: ['source-local', 'project-supplied'] });
    const overview = await new D1Repositories(fake.db).getAnalyticsOverview(
      'p1',
      undefined,
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z'
    );
    expect(overview?.scope.identityMode).toBe('mixed');
  });

  it('reads the whole overview in one batched round trip after the two authorization lookups', async () => {
    const fake = fakeDb({ pageViews: 5, uniqueUsers: 2 });
    await new D1Repositories(fake.db).getAnalyticsOverview(
      'p1',
      's1',
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z'
    );
    // findProject + getSource, then all 15 reads together.
    expect(fake.trips).toHaveLength(3);
    const reads = fake.calls.filter((call) => /FROM dashboard_/.test(call.query));
    expect(reads).toHaveLength(15);
    // Every read is scoped to the project and the website, and binds (never concatenates) its values.
    for (const read of reads) {
      expect(
        read.values.slice(0, 4).filter((value) => value === 's1').length
      ).toBeGreaterThanOrEqual(read.query.includes('watermarks') ? 0 : 1);
      expect(read.query).not.toContain('p1');
      expect(read.query).not.toContain('2026-01-01');
    }
  });

  it('still returns the same overview when the database cannot batch', async () => {
    const withBatch = fakeDb({ pageViews: 9, uniqueUsers: 4, dimensionRows: manyDimensionRows(3) });
    const withoutBatch = fakeDb({
      pageViews: 9,
      uniqueUsers: 4,
      dimensionRows: manyDimensionRows(3)
    });
    delete (withoutBatch.db as { batch?: unknown }).batch;
    const args = ['p1', undefined, '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z'] as const;
    const expected = await new D1Repositories(withBatch.db).getAnalyticsOverview(...args);
    const actual = await new D1Repositories(withoutBatch.db).getAnalyticsOverview(...args);
    expect(actual).toEqual(expected);
    expect(actual?.totals).toEqual({ pageViews: 9, uniqueUsers: 4 });
    expect(withoutBatch.trips.length).toBeGreaterThan(withBatch.trips.length);
  });
});
