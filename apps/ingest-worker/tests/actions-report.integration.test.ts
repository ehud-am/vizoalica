import { describe, expect, it } from 'vitest';
import {
  actionEvent,
  context,
  END,
  pageViewEvent,
  seededRepositories,
  START
} from './support/fixtures.js';

const report = (
  repositories: ReturnType<typeof seededRepositories>['repositories'],
  options: { project?: string; source?: string; start?: string; end?: string } = {},
  filters?: { page?: string; action?: string }
) =>
  repositories.getActionsReport(
    options.project ?? 'p1',
    options.source,
    options.start ?? START,
    options.end ?? END,
    filters
  );

async function seedShop() {
  const seeded = seededRepositories();
  const events = [
    // /pricing: "Start free trial" x3 by 2 visitors, "Contact sales" x1
    actionEvent('a1', {
      name: 'Start free trial',
      kind: 'link',
      visitor: 'v1',
      destination: { url_origin: 'https://app.example.com', url_path: '/signup' }
    }),
    actionEvent('a2', {
      name: 'Start free trial',
      kind: 'link',
      visitor: 'v1',
      destination: { url_origin: 'https://app.example.com', url_path: '/signup' }
    }),
    actionEvent('a3', {
      name: 'Start free trial',
      kind: 'link',
      visitor: 'v2',
      destination: { url_origin: 'https://app.example.com', url_path: '/signup' }
    }),
    actionEvent('a4', { name: 'Contact sales', visitor: 'v1' }),
    // /#/orders/:id: "Download invoice" x2 by 1 visitor; "Contact sales" x1 by another
    actionEvent('a5', { page: '/#/orders/:id', name: 'Download invoice', visitor: 'v3' }),
    actionEvent('a6', {
      page: '/#/orders/:id',
      name: 'Download invoice',
      visitor: 'v3',
      at: '2026-01-01T12:40:00.000Z'
    }),
    actionEvent('a7', { page: '/#/orders/:id', name: 'Contact sales', visitor: 'v4' }),
    // Page views: 10 for /pricing, 4 for /#/orders/:id
    ...Array.from({ length: 10 }, (_, index) =>
      pageViewEvent(`p${index}`, { page: '/pricing', visitor: `pv${index}` })
    ),
    ...Array.from({ length: 4 }, (_, index) =>
      pageViewEvent(`o${index}`, { page: '/#/orders/:id', visitor: `ov${index}` })
    ),
    // A second website of the same project
    actionEvent('d1', { source: 's2', page: '/docs', name: 'Copy', visitor: 'v9' })
  ];
  await seeded.repositories.recordDashboardRollups(events, context);
  return seeded;
}

describe('actions report', () => {
  it('ranks page-and-action rows with counts, distinct visitors, and the page views of each page', async () => {
    const { repositories } = await seedShop();
    const result = (await report(repositories))!;
    expect(result.totals).toEqual({ actions: 8, uniqueUsers: 5 });
    expect(
      result.rows.map((row) => [row.page, row.action, row.count, row.visitors, row.pageViews])
    ).toEqual([
      ['/pricing', 'Start free trial', 3, 2, 10],
      ['/#/orders/:id', 'Download invoice', 2, 1, 4],
      ['/#/orders/:id', 'Contact sales', 1, 1, 4],
      ['/docs', 'Copy', 1, 1, 0],
      ['/pricing', 'Contact sales', 1, 1, 10]
    ]);
    expect(result.rows[0]).toMatchObject({
      kind: 'link',
      destination: 'https://app.example.com/signup'
    });
    expect(result.rows[1]).not.toHaveProperty('destination');
    expect(result.other).toEqual({ rows: 0, count: 0 });
  });

  it('totals each action across pages', async () => {
    const { repositories } = await seedShop();
    const result = (await report(repositories))!;
    expect(result.actions).toEqual([
      { action: 'Start free trial', kind: 'link', count: 3, visitors: 2, pages: 1 },
      { action: 'Contact sales', kind: 'button', count: 2, visitors: 2, pages: 2 },
      { action: 'Download invoice', kind: 'button', count: 2, visitors: 1, pages: 1 },
      { action: 'Copy', kind: 'button', count: 1, visitors: 1, pages: 1 }
    ]);
  });

  it('limits to one website, and never includes a deleted website in the project view', async () => {
    const { repositories, sqlite } = await seedShop();
    expect((await report(repositories, { source: 's2' }))!.totals.actions).toBe(1);
    expect((await report(repositories, { source: 's1' }))!.totals.actions).toBe(7);
    sqlite.exec("UPDATE sources SET status = 'deleted' WHERE id = 's2'");
    expect((await report(repositories))!.totals.actions).toBe(7);
    expect(await report(repositories, { source: 's2' })).toBeUndefined();
  });

  it('returns nothing for an unknown project or website, and keeps projects apart', async () => {
    const { repositories } = await seedShop();
    expect(await report(repositories, { project: 'nope' })).toBeUndefined();
    expect(await report(repositories, { source: 'x1' })).toBeUndefined();
    const other = (await report(repositories, { project: 'p2' }))!;
    expect(other.totals).toEqual({ actions: 0, uniqueUsers: 0 });
    expect(other.rows).toEqual([]);
  });

  it('honors the range: start inclusive, end exclusive, at minute boundaries', async () => {
    const { repositories } = await seedShop();
    expect(
      (await report(repositories, {
        start: '2026-01-01T12:34:00.000Z',
        end: '2026-01-01T12:35:00.000Z'
      }))!.totals.actions
    ).toBe(7);
    expect(
      (await report(repositories, {
        start: '2026-01-01T12:35:00.000Z',
        end: '2026-01-01T12:40:00.000Z'
      }))!.totals.actions
    ).toBe(0);
    expect(
      (await report(repositories, {
        start: '2026-01-01T12:40:00.000Z',
        end: '2026-01-01T12:41:00.000Z'
      }))!.totals.actions
    ).toBe(1);
  });

  it('narrows to a page with its views and total actions, and to an action', async () => {
    const { repositories } = await seedShop();
    const page = (await report(repositories, {}, { page: '/pricing' }))!;
    expect(page.rows.map((row) => row.action)).toEqual(['Start free trial', 'Contact sales']);
    expect(page.totals.actions).toBe(4);
    expect(page.selection).toEqual({ page: { path: '/pricing', views: 10, actions: 4 } });
    // Per-action totals ignore the page filter.
    expect(page.actions.find((entry) => entry.action === 'Contact sales')!.count).toBe(2);

    const action = (await report(repositories, {}, { action: 'Contact sales' }))!;
    expect(action.rows.map((row) => row.page)).toEqual(['/#/orders/:id', '/pricing']);
    expect(action.actions).toHaveLength(1);
    expect(action.selection).toBeUndefined();

    const both = (await report(repositories, {}, { page: '/pricing', action: 'Contact sales' }))!;
    expect(both.rows).toHaveLength(1);
    expect(both.selection!.page).toEqual({ path: '/pricing', views: 10, actions: 4 });
  });

  it('matches filters exactly and treats hostile text as data', async () => {
    const { repositories, sqlite } = await seedShop();
    expect((await report(repositories, {}, { page: '/pric' }))!.rows).toEqual([]);
    expect((await report(repositories, {}, { action: 'contact sales' }))!.rows).toEqual([]);
    const hostile = (await report(
      repositories,
      {},
      { page: "'; DROP TABLE dashboard_minute_actions; --" }
    ))!;
    expect(hostile.rows).toEqual([]);
    expect(
      sqlite
        .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'dashboard_minute_actions'")
        .get()
    ).toEqual({ n: 1 });
    expect(hostile.selection).toEqual({
      page: { path: "'; DROP TABLE dashboard_minute_actions; --", views: 0, actions: 0 }
    });
  });

  it('is bounded: 100 rows and an exact remainder however many groups exist', async () => {
    const { repositories, sqlite } = seededRepositories();
    const insert = sqlite.prepare(
      "INSERT INTO dashboard_minute_actions VALUES ('p1','s1','2026-01-01T10:00:00.000Z',?,?,'button','',?)"
    );
    let expected = 0;
    for (let index = 0; index < 130; index += 1) {
      const count = 200 - index;
      insert.run(`/page-${String(index).padStart(3, '0')}`, `Action ${index}`, count);
      expected += count;
    }
    const result = (await report(repositories))!;
    expect(result.rows).toHaveLength(100);
    expect(result.totals.actions).toBe(expected);
    expect(result.other.rows).toBe(30);
    expect(result.rows.reduce((sum, row) => sum + row.count, 0) + result.other.count).toBe(
      expected
    );
    expect(result.rows[0]!.count).toBe(200);
    expect(result.rows[99]!.count).toBe(101);
  });

  it('orders ties by page, then action, deterministically', async () => {
    const { repositories, sqlite } = seededRepositories();
    const insert = sqlite.prepare(
      "INSERT INTO dashboard_minute_actions VALUES ('p1','s1','2026-01-01T10:00:00.000Z',?,?,'button','',5)"
    );
    insert.run('/b', 'Zed');
    insert.run('/b', 'Alpha');
    insert.run('/a', 'Zed');
    const result = (await report(repositories))!;
    expect(result.rows.map((row) => `${row.page} ${row.action}`)).toEqual([
      '/a Zed',
      '/b Alpha',
      '/b Zed'
    ]);
  });

  it('exposes only aggregates: no digests, visitor ids, session ids, or event ids', async () => {
    const { repositories } = await seedShop();
    const text = JSON.stringify(await report(repositories));
    for (const secret of ['anon', 'sess-1', 'a1', 'visitor_digest', 'event_digest']) {
      // "a1" is an event id; make sure it never leaks even as a substring of a key.
      if (secret === 'a1') expect(text).not.toContain('"a1"');
      else expect(text).not.toContain(secret);
    }
    expect(text).not.toMatch(/[0-9a-f]{64}/);
  });

  it('reports the scope, range, identity mode, and availability like the overview', async () => {
    const { repositories } = await seedShop();
    const result = (await report(repositories, { source: 's1' }))!;
    expect(result.scope).toEqual({
      projectId: 'p1',
      sourceId: 's1',
      label: 'Shop',
      identityMode: 'source-local'
    });
    expect(result.range).toEqual({
      startUtc: START,
      endUtc: END,
      interval: 'hour',
      timezone: 'UTC'
    });
    // The day starts before the first recorded minute, so the range is honestly incomplete.
    expect(result.availability).toMatchObject({ state: 'incomplete', taxonomyVersions: [1] });
    const covered = (await report(repositories, {
      source: 's1',
      start: '2026-01-01T12:40:00.000Z',
      end: '2026-01-01T13:00:00.000Z'
    }))!;
    expect(covered.availability).toMatchObject({ state: 'complete', taxonomyVersions: [1] });
    expect(covered.availability.lastCompletedAt).toEqual(expect.any(String));
    expect((await report(repositories))!.scope.label).toBe('All websites');
    expect(
      (await report(repositories, { start: '2025-12-30T00:00:00.000Z', end: END }))!.range.interval
    ).toBe('day');
    expect(
      (await report(repositories, {
        start: '2026-01-01T12:00:00.000Z',
        end: '2026-01-01T13:00:00.000Z'
      }))!.range.interval
    ).toBe('hour');
  });

  it('flags a range that starts before the aggregates were available', async () => {
    const { repositories } = await seedShop();
    const result = (await report(repositories, { start: '2025-12-01T00:00:00.000Z', end: END }))!;
    expect(result.availability.state).toBe('incomplete');
    expect(result.availability.availableFromUtc).toEqual(expect.any(String));
  });

  it('reports mixed identity when both kinds of visitor exist', async () => {
    const { repositories } = seededRepositories();
    await repositories.recordDashboardRollups([actionEvent('m1')], context);
    await repositories.recordDashboardRollups([actionEvent('m2', { visitor: 'v2' })], {
      ...context,
      projectVisitorId: 'crm-1'
    });
    expect((await report(repositories))!.scope.identityMode).toBe('mixed');
  });
});
