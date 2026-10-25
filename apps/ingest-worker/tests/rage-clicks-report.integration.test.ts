import { describe, expect, it } from 'vitest';
import {
  actionEvent,
  context,
  count,
  END,
  rows,
  seededRepositories,
  START
} from './support/fixtures.js';

type Repositories = ReturnType<typeof seededRepositories>['repositories'];
const report = (
  repositories: Repositories,
  filters?: { page?: string; action?: string },
  options: { source?: string; start?: string; end?: string } = {}
) =>
  repositories.getRageClicksReport(
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
      // Pay: 4 clicks, 2 bursts. Save: 2 clicks, 1 burst. Docs link: 1 click, no burst.
      ...[1, 2, 3, 4].map((n) => actionEvent(`pay-${n}`, { name: 'Pay', visitor: `v${n}` })),
      actionEvent('pay-r1', { name: 'Pay', rage: true, visitor: 'v1' }),
      actionEvent('pay-r2', { name: 'Pay', rage: true, visitor: 'v2' }),
      actionEvent('save-1', { name: 'Save', page: '/settings' }),
      actionEvent('save-2', { name: 'Save', page: '/settings' }),
      actionEvent('save-r1', { name: 'Save', page: '/settings', rage: true }),
      actionEvent('doc-1', {
        name: 'Docs',
        kind: 'link',
        destination: { url_origin: 'https://docs.example.com', url_path: '/' }
      }),
      actionEvent('other-r1', { name: 'Pay', rage: true, source: 's2' })
    ],
    context
  );
  return seeded;
}

describe('rage clicks report', () => {
  it('counts bursts per control with the clicks on the same control, most bursts first', async () => {
    const { repositories } = await seed();
    const result = (await report(repositories))!;
    expect(result.rows).toEqual([
      { page: '/pricing', action: 'Pay', kind: 'button', count: 3, clicks: 4 },
      { page: '/settings', action: 'Save', kind: 'button', count: 1, clicks: 2 }
    ]);
    // Bursts are signals, not clicks: the ordinary click totals are untouched.
    expect(result.totals).toEqual({ bursts: 4, clicks: 7 });
    expect(result.other).toEqual({ rows: 0, count: 0 });
    expect(result.scope).toMatchObject({ sourceId: null, label: 'All websites' });
  });

  it('does not change the actions report', async () => {
    const { repositories } = await seed();
    const actions = (await repositories.getActionsReport('p1', undefined, START, END))!;
    expect(actions.totals.actions).toBe(7);
  });

  it('is limited to one website, and unknown or missing websites have no report', async () => {
    const { repositories } = await seed();
    const result = (await report(repositories, undefined, { source: 's2' }))!;
    expect(result.totals).toEqual({ bursts: 1, clicks: 0 });
    expect(result.rows).toEqual([
      { page: '/pricing', action: 'Pay', kind: 'button', count: 1, clicks: 0 }
    ]);
    expect(await report(repositories, undefined, { source: 's3' })).toBeUndefined();
    expect(
      await repositories.getRageClicksReport('missing', undefined, START, END)
    ).toBeUndefined();
  });

  it('narrows by exact page or action', async () => {
    const { repositories } = await seed();
    const page = (await report(repositories, { page: '/settings' }))!;
    expect(page.totals).toEqual({ bursts: 1, clicks: 2 });
    expect(page.rows.map((row) => row.action)).toEqual(['Save']);
    const action = (await report(repositories, { action: 'Pay' }))!;
    expect(action.totals).toEqual({ bursts: 3, clicks: 4 });
    expect((await report(repositories, { action: 'Nothing' }))!.rows).toEqual([]);
  });

  it('keeps the destination of a link', async () => {
    const { repositories } = seededRepositories();
    await repositories.recordDashboardRollups(
      [
        actionEvent('d1', {
          name: 'Docs',
          kind: 'link',
          rage: true,
          destination: { url_origin: 'https://docs.example.com', url_path: '/start' }
        })
      ],
      context
    );
    expect((await report(repositories))!.rows).toEqual([
      {
        page: '/pricing',
        action: 'Docs',
        kind: 'link',
        destination: 'https://docs.example.com/start',
        count: 1,
        clicks: 0
      }
    ]);
  });

  it('returns an empty report when nothing was reported', async () => {
    const { repositories } = seededRepositories();
    await repositories.recordDashboardRollups([actionEvent('a1')], context);
    const result = (await report(repositories))!;
    expect(result.totals).toEqual({ bursts: 0, clicks: 1 });
    expect(result.rows).toEqual([]);
    expect(result.trend.every((point) => point.bursts === 0)).toBe(true);
  });

  it('keeps the output bounded and exact for a thousand distinct controls', async () => {
    const seeded = seededRepositories();
    await seeded.repositories.recordDashboardRollups(
      Array.from({ length: 1000 }, (_, index) =>
        actionEvent(`n${index}`, { name: `Control ${String(index).padStart(4, '0')}`, rage: true })
      ),
      context
    );
    const result = (await report(seeded.repositories))!;
    expect(result.rows).toHaveLength(50);
    expect(result.other).toEqual({ rows: 950, count: 950 });
    expect(result.totals.bursts).toBe(1000);
    expect(result.rows.reduce((sum, row) => sum + row.count, 0) + result.other.count).toBe(1000);
  });

  it('uses days for ranges over 24 hours', async () => {
    const { repositories } = await seed();
    const result = (await report(repositories, undefined, {
      start: '2025-12-30T00:00:00.000Z',
      end: '2026-01-02T00:00:00.000Z'
    }))!;
    expect(result.range.interval).toBe('day');
    expect(result.trend.map((point) => [point.startUtc.slice(0, 10), point.bursts])).toEqual([
      ['2025-12-30', 0],
      ['2025-12-31', 0],
      ['2026-01-01', 4]
    ]);
  });

  it('says the range is partly available when it starts before reporting began', async () => {
    const { repositories, sqlite } = await seed();
    sqlite.exec(
      "UPDATE dashboard_rage_click_availability SET available_from_utc = '2026-01-01T06:00:00.000Z'"
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

describe('rage click rollups', () => {
  it('stores a count only: no visitor identifier or digest', async () => {
    const { sqlite, repositories } = seededRepositories();
    await repositories.recordDashboardRollups(
      [actionEvent('r1', { rage: true, visitor: 'anon-secret' })],
      context
    );
    const stored = rows(sqlite, 'SELECT * FROM dashboard_minute_rage_clicks');
    expect(stored).toHaveLength(1);
    expect(Object.keys(stored[0]!)).not.toContain('visitor_digest');
    expect(JSON.stringify(stored)).not.toContain('anon-secret');
    // A burst is not a click: no click row and no click visitor were written.
    expect(count(sqlite, 'dashboard_minute_actions')).toBe(0);
    expect(count(sqlite, 'dashboard_minute_action_visitors')).toBe(0);
  });

  it('counts a replayed signal once', async () => {
    const { sqlite, repositories } = seededRepositories();
    await repositories.recordDashboardRollups([actionEvent('r1', { rage: true })], context);
    await repositories.recordDashboardRollups([actionEvent('r1', { rage: true })], context);
    expect(rows(sqlite, 'SELECT burst_count FROM dashboard_minute_rage_clicks')).toEqual([
      { burst_count: 1 }
    ]);
  });

  it('writes nothing for ordinary clicks', async () => {
    const { sqlite, repositories } = seededRepositories();
    await repositories.recordDashboardRollups([actionEvent('a1')], context);
    expect(count(sqlite, 'dashboard_minute_rage_clicks')).toBe(0);
  });

  it('adds no statements for batches without a rage signal', async () => {
    const { sqlite, repositories } = seededRepositories();
    const prepared: string[] = [];
    const original = sqlite.prepare.bind(sqlite);
    sqlite.prepare = ((sql: string) => {
      prepared.push(sql);
      return original(sql);
    }) as typeof sqlite.prepare;
    await repositories.recordDashboardRollups([actionEvent('a1')], context);
    expect(prepared.filter((sql) => sql.includes('rage'))).toEqual([]);
  });

  it('removes rage rows at retention', async () => {
    const { sqlite, repositories } = seededRepositories();
    await repositories.recordDashboardRollups([actionEvent('r1', { rage: true })], context);
    await repositories.deleteExpiredDashboardData('2026-02-01T00:00:00.000Z');
    expect(count(sqlite, 'dashboard_minute_rage_clicks')).toBe(0);
  });
});
