import { describe, expect, it } from 'vitest';
import {
  context,
  count,
  END,
  pageViewEvent,
  rows,
  seededRepositories,
  START
} from './support/fixtures.js';

type Repositories = ReturnType<typeof seededRepositories>['repositories'];
const report = (
  repositories: Repositories,
  filters?: { source?: string; medium?: string; campaign?: string },
  options: { source?: string; start?: string; end?: string } = {}
) =>
  repositories.getCampaignsReport(
    'p1',
    options.source,
    options.start ?? START,
    options.end ?? END,
    filters
  );

const newsletter = { source: 'newsletter', medium: 'email', campaign: 'spring-sale' };
const twitter = { source: 'twitter', medium: 'social' };

async function seed() {
  const seeded = seededRepositories();
  await seeded.repositories.recordDashboardRollups(
    [
      pageViewEvent('v1', { visitor: 'a', campaign: newsletter }),
      pageViewEvent('v2', { visitor: 'a', campaign: newsletter }),
      pageViewEvent('v3', { visitor: 'b', campaign: newsletter }),
      pageViewEvent('v4', { visitor: 'c', campaign: twitter }),
      pageViewEvent('v5', { visitor: 'd', campaign: { source: 'newsletter', medium: 'rss' } }),
      pageViewEvent('v6', { visitor: 'e' }),
      pageViewEvent('v7', { visitor: 'f', source: 's2', campaign: twitter })
    ],
    context
  );
  return seeded;
}

describe('campaigns report', () => {
  it('counts campaign page views and distinct visitors, and the share of all page views', async () => {
    const { repositories } = await seed();
    const result = (await report(repositories))!;
    expect(result.totals).toEqual({ pageViews: 6, uniqueUsers: 5, allPageViews: 7 });
    expect(result.rows).toEqual([
      { ...newsletter, count: 3, visitors: 2 },
      { source: 'twitter', medium: 'social', campaign: '', count: 2, visitors: 2 },
      { source: 'newsletter', medium: 'rss', campaign: '', count: 1, visitors: 1 }
    ]);
    expect(result.sources.items).toEqual([
      { label: 'newsletter', count: 4, visitors: 3 },
      { label: 'twitter', count: 2, visitors: 2 }
    ]);
    expect(result.mediums.items.map((item) => [item.label, item.count])).toEqual([
      ['email', 3],
      ['social', 2],
      ['rss', 1]
    ]);
    // The label '' means the link did not set it.
    expect(result.campaigns.items).toEqual([
      { label: '', count: 3, visitors: 3 },
      { label: 'spring-sale', count: 3, visitors: 2 }
    ]);
    expect(result.other).toEqual({ rows: 0, count: 0 });
    expect(result.scope).toMatchObject({ sourceId: null, label: 'All websites' });
  });

  it('is limited to one website, and unknown or missing websites have no report', async () => {
    const { repositories } = await seed();
    const result = (await report(repositories, undefined, { source: 's2' }))!;
    expect(result.totals).toEqual({ pageViews: 1, uniqueUsers: 1, allPageViews: 1 });
    expect(await report(repositories, undefined, { source: 's3' })).toBeUndefined();
    expect(await repositories.getCampaignsReport('missing', undefined, START, END)).toBeUndefined();
  });

  it('narrows totals, trend and combinations by a filter but keeps every source in the source ranking', async () => {
    const { repositories } = await seed();
    const result = (await report(repositories, { source: 'twitter' }))!;
    expect(result.totals).toEqual({ pageViews: 2, uniqueUsers: 2, allPageViews: 7 });
    expect(result.rows).toEqual([
      { source: 'twitter', medium: 'social', campaign: '', count: 2, visitors: 2 }
    ]);
    expect(result.trend.reduce((sum, point) => sum + point.pageViews, 0)).toBe(2);
    expect(result.sources.items.map((item) => item.label)).toEqual(['newsletter', 'twitter']);
    // The other rankings follow the selection.
    expect(result.mediums.items.map((item) => item.label)).toEqual(['social']);

    const combined = (await report(repositories, { source: 'newsletter', medium: 'email' }))!;
    expect(combined.totals.pageViews).toBe(3);
    expect(combined.mediums.items.map((item) => item.label)).toEqual(['email', 'rss']);
    expect(combined.sources.items.map((item) => item.label)).toEqual(['newsletter']);
  });

  it('returns an empty report when nothing is tagged', async () => {
    const { repositories } = seededRepositories();
    await repositories.recordDashboardRollups([pageViewEvent('v1')], context);
    const result = (await report(repositories))!;
    expect(result.totals).toEqual({ pageViews: 0, uniqueUsers: 0, allPageViews: 1 });
    expect(result.rows).toEqual([]);
    expect(result.sources).toEqual({ items: [], otherCount: 0 });
  });

  it('keeps the output bounded and exact for a thousand distinct campaigns', async () => {
    const seeded = seededRepositories();
    await seeded.repositories.recordDashboardRollups(
      Array.from({ length: 1000 }, (_, index) =>
        pageViewEvent(`n${index}`, {
          visitor: `visitor-${index}`,
          campaign: { source: `src-${String(index).padStart(4, '0')}`, campaign: 'flood' }
        })
      ),
      context
    );
    const result = (await report(seeded.repositories))!;
    expect(result.rows).toHaveLength(50);
    expect(result.sources.items).toHaveLength(20);
    expect(result.campaigns.items).toEqual([{ label: 'flood', count: 1000, visitors: 1000 }]);
    expect(result.other).toEqual({ rows: 950, count: 950 });
    expect(result.sources.otherCount).toBe(980);
    expect(result.totals.pageViews).toBe(1000);
    expect(result.rows.reduce((sum, row) => sum + row.count, 0) + result.other.count).toBe(1000);
  });

  it('uses days for ranges over 24 hours', async () => {
    const { repositories } = await seed();
    const result = (await report(repositories, undefined, {
      start: '2025-12-30T00:00:00.000Z',
      end: '2026-01-02T00:00:00.000Z'
    }))!;
    expect(result.range.interval).toBe('day');
    expect(result.trend.map((point) => [point.startUtc.slice(0, 10), point.pageViews])).toEqual([
      ['2025-12-30', 0],
      ['2025-12-31', 0],
      ['2026-01-01', 6]
    ]);
  });

  it('says the range is partly available when it starts before reporting began', async () => {
    const { repositories, sqlite } = await seed();
    sqlite.exec(
      "UPDATE dashboard_campaign_availability SET available_from_utc = '2026-01-01T06:00:00.000Z'"
    );
    expect((await report(repositories))!.availability).toMatchObject({
      state: 'incomplete',
      availableFromUtc: '2026-01-01T06:00:00.000Z'
    });
    expect(
      (await report(repositories, undefined, { start: '2026-01-01T07:00:00.000Z' }))!.availability
        .state
    ).toBe('complete');
  });
});

describe('campaign rollups', () => {
  it('stores cleaned labels and digests rather than visitor ids', async () => {
    const { sqlite, repositories } = seededRepositories();
    await repositories.recordDashboardRollups(
      [
        pageViewEvent('e1', {
          visitor: 'anon-secret',
          campaign: {
            source: 'Jane@Example.com',
            medium: '<b>EMAIL</b>',
            campaign: '4111111111111111'
          }
        })
      ],
      context
    );
    expect(
      rows(sqlite, 'SELECT utm_source, utm_medium, utm_campaign FROM dashboard_minute_campaigns')
    ).toEqual([{ utm_source: '[email]', utm_medium: 'bemail/b', utm_campaign: '[number]' }]);
    expect(
      JSON.stringify(rows(sqlite, 'SELECT * FROM dashboard_minute_campaign_visitors'))
    ).not.toContain('anon-secret');
  });

  it('counts a replayed page view once', async () => {
    const { sqlite, repositories } = seededRepositories();
    await repositories.recordDashboardRollups(
      [pageViewEvent('e1', { campaign: newsletter })],
      context
    );
    await repositories.recordDashboardRollups(
      [pageViewEvent('e1', { campaign: newsletter })],
      context
    );
    expect(rows(sqlite, 'SELECT page_view_count FROM dashboard_minute_campaigns')).toEqual([
      { page_view_count: 1 }
    ]);
    expect(count(sqlite, 'dashboard_minute_campaign_visitors')).toBe(1);
  });

  it('writes nothing for a page view without a campaign, or with one that cleans to nothing', async () => {
    const { sqlite, repositories } = seededRepositories();
    await repositories.recordDashboardRollups(
      [
        pageViewEvent('e1'),
        pageViewEvent('e2', { campaign: { source: '<>' } }),
        pageViewEvent('e3', { campaign: 'utm_source=x' })
      ],
      context
    );
    expect(count(sqlite, 'dashboard_minute_campaigns')).toBe(0);
    expect(count(sqlite, 'dashboard_minute_campaign_visitors')).toBe(0);
    expect(count(sqlite, 'dashboard_minute_totals')).toBe(1);
  });

  it('does not add statements for untagged page views', async () => {
    const { sqlite, repositories } = seededRepositories();
    const prepared: string[] = [];
    const original = sqlite.prepare.bind(sqlite);
    sqlite.prepare = ((sql: string) => {
      prepared.push(sql);
      return original(sql);
    }) as typeof sqlite.prepare;
    await repositories.recordDashboardRollups([pageViewEvent('e1')], context);
    expect(prepared.filter((sql) => sql.includes('campaign'))).toEqual([]);
  });

  it('removes campaign rows at retention', async () => {
    const { sqlite, repositories } = seededRepositories();
    await repositories.recordDashboardRollups(
      [pageViewEvent('e1', { campaign: newsletter })],
      context
    );
    await repositories.deleteExpiredDashboardData('2026-02-01T00:00:00.000Z');
    expect(count(sqlite, 'dashboard_minute_campaigns')).toBe(0);
    expect(count(sqlite, 'dashboard_minute_campaign_visitors')).toBe(0);
  });
});
