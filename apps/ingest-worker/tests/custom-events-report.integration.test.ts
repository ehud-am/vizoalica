import { describe, expect, it } from 'vitest';
import {
  context,
  count,
  customEvent,
  END,
  rows,
  seededRepositories,
  START
} from './support/fixtures.js';

type Repositories = ReturnType<typeof seededRepositories>['repositories'];
const report = (
  repositories: Repositories,
  filters?: { event?: string; page?: string },
  options: { source?: string; start?: string; end?: string } = {}
) =>
  repositories.getCustomEventsReport(
    'p1',
    options.source,
    options.start ?? START,
    options.end ?? END,
    filters
  );

async function seed() {
  const seeded = seededRepositories();
  await seeded.repositories.recordDashboardRollups(
    [
      customEvent('c1', { visitor: 'v1', properties: { plan: 'pro', annual: true, seats: 5 } }),
      customEvent('c2', { visitor: 'v1', properties: { plan: 'pro' } }),
      customEvent('c3', { visitor: 'v2', page: '/blog', properties: { plan: 'team' } }),
      customEvent('c4', { visitor: 'v3', page: null, properties: { plan: 'pro' } }),
      customEvent('c5', {
        name: 'download',
        visitor: 'v1',
        page: '/docs',
        at: '2026-01-01T15:10:00.000Z'
      }),
      customEvent('c6', { source: 's2', visitor: 'v9', page: '/docs' }),
      customEvent('c7', { source: 's3', visitor: 'v8' })
    ],
    context
  );
  return seeded;
}

describe('custom events report', () => {
  it('counts events and distinct visitors across the project, ranked by use', async () => {
    const { repositories } = await seed();
    const result = (await report(repositories))!;
    expect(result.totals).toEqual({ events: 6, uniqueUsers: 4 });
    expect(result.events).toEqual([
      { event: 'signup', count: 5, visitors: 4, pages: 3 },
      { event: 'download', count: 1, visitors: 1, pages: 1 }
    ]);
    expect(result.other).toEqual({ events: 0, count: 0 });
    expect(result.scope).toMatchObject({ sourceId: null, label: 'All websites' });
  });

  it('is limited to one website and ignores deleted websites', async () => {
    const { repositories } = await seed();
    const result = (await report(repositories, undefined, { source: 's1' }))!;
    expect(result.totals).toEqual({ events: 5, uniqueUsers: 3 });
    expect(result.scope).toMatchObject({ sourceId: 's1', label: 'Shop' });
    expect(await report(repositories, undefined, { source: 's3' })).toBeUndefined();
    expect(
      await repositories.getCustomEventsReport('missing', undefined, START, END)
    ).toBeUndefined();
  });

  it('breaks one event down by page, trend, and property values', async () => {
    const { repositories } = await seed();
    const result = (await report(repositories, { event: 'signup' }, { source: 's1' }))!;
    expect(result.totals).toEqual({ events: 4, uniqueUsers: 3 });
    expect(result.pages).toEqual([
      { page: '/pricing', count: 2, visitors: 1 },
      { page: '/blog', count: 1, visitors: 1 }
    ]);
    expect(result.withoutPage).toBe(1);
    expect(result.properties).toEqual([
      {
        key: 'plan',
        values: [
          { value: 'pro', count: 3 },
          { value: 'team', count: 1 }
        ]
      },
      { key: 'annual', values: [{ value: 'true', count: 1 }] }
    ]);
    expect(result.trend).toHaveLength(24);
    expect(result.trend.find((point) => point.startUtc === '2026-01-01T12:00:00.000Z')?.count).toBe(
      4
    );
    expect(result.trend.reduce((sum, point) => sum + point.count, 0)).toBe(4);
  });

  it('narrows to a page while still listing every event on it, and has no properties without an event', async () => {
    const { repositories } = await seed();
    const result = (await report(repositories, { page: '/docs' }))!;
    expect(result.totals).toEqual({ events: 2, uniqueUsers: 2 });
    expect(result.events.map((entry) => [entry.event, entry.count])).toEqual([
      ['download', 1],
      ['signup', 1]
    ]);
    expect(result.properties).toEqual([]);
  });

  it('keeps the event list exact when it is cut off', async () => {
    const seeded = seededRepositories();
    await seeded.repositories.recordDashboardRollups(
      Array.from({ length: 52 }, (_, index) =>
        customEvent(`n${index}`, { name: `event_${String(index).padStart(2, '0')}` })
      ),
      context
    );
    const result = (await report(seeded.repositories))!;
    expect(result.events).toHaveLength(50);
    expect(result.other).toEqual({ events: 2, count: 2 });
    expect(result.totals.events).toBe(52);
  });

  it('uses days for ranges over 24 hours', async () => {
    const { repositories } = await seed();
    const result = (await report(repositories, undefined, {
      start: '2025-12-30T00:00:00.000Z',
      end: '2026-01-02T00:00:00.000Z'
    }))!;
    expect(result.range.interval).toBe('day');
    expect(result.trend.map((point) => [point.startUtc.slice(0, 10), point.count])).toEqual([
      ['2025-12-30', 0],
      ['2025-12-31', 0],
      ['2026-01-01', 6]
    ]);
  });

  it('says the range is partly available when it starts before reporting began', async () => {
    const { repositories, sqlite } = await seed();
    sqlite.exec(
      "UPDATE dashboard_custom_event_availability SET available_from_utc = '2026-01-01T06:00:00.000Z'"
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

describe('custom event rollups', () => {
  it('stores digests rather than visitor ids, and redacts and limits property values', async () => {
    const { sqlite, repositories } = seededRepositories();
    await repositories.recordDashboardRollups(
      [
        customEvent('e1', {
          visitor: 'anon-secret',
          properties: {
            contact: 'person@example.com',
            order: '123456789',
            long: 'x'.repeat(200),
            empty: '',
            score: 9,
            nothing: null
          }
        })
      ],
      context
    );
    expect(
      JSON.stringify(rows(sqlite, 'SELECT * FROM dashboard_minute_custom_event_visitors'))
    ).not.toContain('anon-secret');
    const stored = rows(
      sqlite,
      'SELECT property_key AS k, property_value AS v FROM dashboard_minute_custom_event_properties ORDER BY k'
    );
    expect(stored).toEqual([
      { k: 'contact', v: '[email]' },
      { k: 'long', v: 'x'.repeat(64) },
      { k: 'order', v: '[number]' }
    ]);
  });

  it('counts a replayed event once', async () => {
    const { sqlite, repositories } = seededRepositories();
    await repositories.recordDashboardRollups(
      [customEvent('e1', { properties: { a: 'b' } })],
      context
    );
    await repositories.recordDashboardRollups(
      [customEvent('e1', { properties: { a: 'b' } })],
      context
    );
    expect(rows(sqlite, 'SELECT event_count FROM dashboard_minute_custom_events')).toEqual([
      { event_count: 1 }
    ]);
    expect(
      rows(sqlite, 'SELECT event_count FROM dashboard_minute_custom_event_properties')
    ).toEqual([{ event_count: 1 }]);
  });

  it('keeps the daily event counts the overview already used', async () => {
    const { sqlite, repositories } = seededRepositories();
    await repositories.recordDashboardRollups([customEvent('e1'), customEvent('e2')], context);
    expect(
      rows(
        sqlite,
        "SELECT event_count FROM dashboard_rollups WHERE event_type = 'com.vizoalica.custom_event.v1'"
      )
    ).toEqual([{ event_count: 2 }]);
    expect(count(sqlite, 'dashboard_minute_custom_events')).toBe(1);
  });
});
