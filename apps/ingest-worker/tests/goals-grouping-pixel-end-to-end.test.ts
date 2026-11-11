import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import type { Env, R2Bucket } from '../src/env.js';
import { d1, freshDatabase } from './support/sqlite-d1.js';

/** Goals, page grouping rules and the pixel path cap through the real Worker on the real schema. */
const ADMIN = 'admin-secret-0123456789abcdefghijklmn';
const ORIGIN = 'https://shop.test';

function environment(extra: Record<string, string> = {}) {
  const sqlite = freshDatabase();
  sqlite.exec(`
    INSERT INTO quota_policies VALUES ('q1', 131072, 25, 25, 100, 100000, 25, 256, 7);
    INSERT INTO projects VALUES ('p1','Shop','demo',7,'q1','active');
    INSERT INTO sources (id, project_id, name, public_source_key, allowed_origins_json, status, quota_policy_id, created_at, updated_at) VALUES ('s1','p1','Storefront','shop-key','["${ORIGIN}"]','active','q1','t','t');
    INSERT INTO sources (id, project_id, name, public_source_key, allowed_origins_json, status, quota_policy_id, created_at, updated_at, pixel_enabled) VALUES ('s2','p1','Readme','readme-key','[]','active','q1','t','t',1);
  `);
  const bucket: R2Bucket = {
    async put() {},
    async list() {
      return { objects: [], truncated: false };
    },
    async delete() {}
  };
  const env = {
    VIZOALICA_DB: d1(sqlite),
    VIZOALICA_EVENTS: bucket,
    VIZOALICA_TOKEN_SECRET: 'test-token-secret-0123456789abcdefgh',
    VIZOALICA_ADMIN_SECRET: ADMIN,
    VIZOALICA_ANALYTICS_DIGEST_SECRET: 'analytics-digest-secret-0123456789abcd',
    VIZOALICA_DEMO_MODE: 'true',
    ...extra
  } as unknown as Env;
  return { env, sqlite };
}

const event = (id: string, type: string, data: unknown) => ({
  specversion: '1.0',
  id,
  type,
  source: ORIGIN,
  time: new Date().toISOString(),
  datacontenttype: 'application/json',
  vizoalicaconsent: 'analytics-granted',
  data
});
const pageView = (id: string, path: string, who: string) =>
  event(id, 'com.vizoalica.page_view.v1', {
    page: { url_origin: ORIGIN, url_path: path, url_query_redacted: false },
    visitor: { anonymous_id: who },
    session: { id: `s-${who}` }
  });
const custom = (id: string, name: string, who: string) =>
  event(id, 'com.vizoalica.custom_event.v1', {
    name,
    page: { url_path: '/pricing' },
    visitor: { anonymous_id: who },
    session: { id: `s-${who}` }
  });
const ingest = (env: Env, batch: unknown[]) =>
  worker.fetch(
    new Request('https://worker.test/v1/events:batch', {
      method: 'POST',
      headers: {
        origin: ORIGIN,
        'content-type': 'application/cloudevents-batch+json',
        'x-vizoalica-source': 'shop-key'
      },
      body: JSON.stringify(batch)
    }),
    env
  );
const admin = (
  env: Env,
  path: string,
  init: { method?: string; body?: unknown; token?: string } = {}
) =>
  worker.fetch(
    new Request(`https://worker.test${path}`, {
      method: init.method ?? 'GET',
      headers: {
        authorization: `Bearer ${init.token ?? ADMIN}`,
        ...(init.body ? { 'content-type': 'application/json' } : {})
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {})
    }),
    env
  );
const pixel = (env: Env, path: string) =>
  worker.fetch(
    new Request(`https://worker.test/v1/pixel.gif?website=readme-key&path=${path}`),
    env
  );
const rowsOf = (sqlite: ReturnType<typeof environment>['sqlite'], sql: string) =>
  sqlite.prepare(sql).all() as Array<Record<string, unknown>>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-01T12:34:30.000Z'));
});
afterEach(() => vi.useRealTimers());

const goalsBase = '/v1/admin/projects/p1/sources/s1/goals';

describe('goals through the real Worker', () => {
  it('creates, lists, reports and deletes goals', async () => {
    const { env } = environment();
    const page = await admin(env, goalsBase, {
      method: 'POST',
      body: { name: 'Saw pricing', kind: 'page', target: '/pricing' }
    });
    expect(page.status).toBe(201);
    const signup = await admin(env, goalsBase, {
      method: 'POST',
      body: { name: 'Signed up', kind: 'event', target: 'signup' }
    });
    expect(signup.status).toBe(201);

    expect(
      (
        await ingest(env, [
          pageView('evt-p-000001', '/pricing', 'a'),
          pageView('evt-p-000002', '/pricing', 'b'),
          pageView('evt-p-000003', '/', 'c'),
          pageView('evt-p-000004', '/', 'd'),
          custom('evt-c-000001', 'signup', 'a'),
          custom('evt-c-000002', 'signup', 'a'),
          custom('evt-c-000003', 'other', 'b')
        ])
      ).status
    ).toBe(202);

    vi.setSystemTime(new Date('2026-01-01T12:40:00.000Z'));
    const range = 'start=2026-01-01T00:00:00.000Z&end=2026-01-01T12:40:00.000Z';
    const result = await admin(env, `${goalsBase}/report?${range}`);
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('no-store');
    const report = (await result.json()) as any;
    expect(report.totals).toEqual({ pageViews: 4, visitors: 4 });
    const [seen, signed] = report.goals;
    expect(seen).toMatchObject({
      conversions: 2,
      visitors: null,
      rate: 0.5,
      rateBasis: 'page_views'
    });
    expect(seen.goal.name).toBe('Saw pricing');
    expect(signed).toMatchObject({
      conversions: 2,
      visitors: 1,
      rate: 0.25,
      rateBasis: 'visitors'
    });
    expect(signed.trend.reduce((sum: number, p: any) => sum + p.conversions, 0)).toBe(2);

    const listed = (await (await admin(env, goalsBase)).json()) as any[];
    expect(listed.map((goal) => goal.name)).toEqual(['Saw pricing', 'Signed up']);
    const gone = await admin(env, `${goalsBase}/${listed[0].id}`, { method: 'DELETE' });
    expect(gone.status).toBe(200);
    expect((await admin(env, `${goalsBase}/${listed[0].id}`, { method: 'DELETE' })).status).toBe(
      404
    );
    expect(((await (await admin(env, goalsBase)).json()) as any[]).length).toBe(1);
  });

  it('counts click goals and reports hourly trends for a short range', async () => {
    const { env } = environment();
    await admin(env, goalsBase, {
      method: 'POST',
      body: { name: 'Trial', kind: 'action', target: 'Start free trial' }
    });
    await ingest(env, [
      pageView('evt-h-000001', '/', 'a'),
      event('evt-h-000002', 'com.vizoalica.action.v1', {
        page: { url_origin: ORIGIN, url_path: '/' },
        action: { name: 'Start free trial', kind: 'button' },
        visitor: { anonymous_id: 'a' },
        session: { id: 's-a' }
      })
    ]);
    vi.setSystemTime(new Date('2026-01-01T12:40:00.000Z'));
    const report = (await (
      await admin(
        env,
        `${goalsBase}/report?start=2026-01-01T11:00:00.000Z&end=2026-01-01T12:40:00.000Z`
      )
    ).json()) as any;
    expect(report.range.interval).toBe('hour');
    expect(report.goals[0]).toMatchObject({ conversions: 1, visitors: 1, rate: 1 });
    expect(report.goals[0].trend.at(-1)).toEqual({
      startUtc: '2026-01-01T12:00:00.000Z',
      conversions: 1
    });
    const empty = (await (
      await admin(
        env,
        `${goalsBase}/report?start=2025-12-01T00:00:00.000Z&end=2025-12-02T00:00:00.000Z`
      )
    ).json()) as any;
    expect(empty.goals[0]).toMatchObject({ conversions: 0, visitors: 0, rate: null });
  });

  it('refuses a bad range and a deleted or unknown website', async () => {
    const { env } = environment();
    expect((await admin(env, `${goalsBase}/report?start=x&end=y`)).status).toBe(400);
    expect(
      (
        await admin(
          env,
          '/v1/admin/projects/p1/sources/nope/goals/report?start=2026-01-01T00:00:00.000Z&end=2026-01-01T12:00:00.000Z'
        )
      ).status
    ).toBe(404);
    expect(
      (
        await admin(env, '/v1/admin/projects/p1/sources/nope/goals', {
          method: 'POST',
          body: { name: 'a', kind: 'event', target: 'b' }
        })
      ).status
    ).toBe(404);
  });

  it('refuses invalid goals and more than twenty', async () => {
    const { env } = environment();
    for (const body of [
      { name: '', kind: 'page', target: '/x' },
      { name: 'x', kind: 'visit', target: '/x' },
      { name: 'x', kind: 'page', target: 'no-slash' },
      { name: 'x', kind: 'page', target: '/x?y=1' },
      { name: 'x', kind: 'page', target: '/thanks/' },
      { name: 'x', kind: 'page', target: '/a b' },
      { name: 'x', kind: 'page', target: '/a//b' },
      { name: 'x', kind: 'page', target: '/orders/123' },
      { name: 'x', kind: 'event', target: 'a'.repeat(81) },
      { name: 'x'.repeat(81), kind: 'event', target: 'a' }
    ])
      expect(
        (await admin(env, goalsBase, { method: 'POST', body })).status,
        JSON.stringify(body)
      ).toBe(400);
    for (let n = 0; n < 20; n += 1)
      expect(
        (
          await admin(env, goalsBase, {
            method: 'POST',
            body: { name: `g${n}`, kind: 'event', target: `e${n}` }
          })
        ).status
      ).toBe(201);
    const over = await admin(env, goalsBase, {
      method: 'POST',
      body: { name: 'one more', kind: 'event', target: 'more' }
    });
    expect(over.status).toBe(400);
    expect(await over.json()).toMatchObject({ field: 'goals', reason: 'too_many', limit: 20 });
  });

  it('keeps at most twenty goals when requests arrive together', async () => {
    const { env, sqlite } = environment();
    const responses = await Promise.all(
      Array.from({ length: 30 }, (_, n) =>
        admin(env, goalsBase, {
          method: 'POST',
          body: { name: `g${n}`, kind: 'event', target: `e${n}` }
        })
      )
    );
    expect(responses.filter((response) => response.status === 201)).toHaveLength(20);
    expect(responses.filter((response) => response.status === 400)).toHaveLength(10);
    expect(rowsOf(sqlite, "SELECT COUNT(*) AS n FROM goals WHERE status = 'active'")).toEqual([
      { n: 20 }
    ]);
  });

  it('lets an analyst read but not change goals, and hides other websites', async () => {
    const { env } = environment();
    const made = await admin(env, '/v1/admin/access-keys', {
      method: 'POST',
      body: { label: 'viewer', role: 'analyst', projectId: 'p1', sourceId: 's1' }
    });
    const token = ((await made.json()) as { key: string }).key;
    expect(token).toBeTruthy();
    const range = 'start=2026-01-01T00:00:00.000Z&end=2026-01-01T12:30:00.000Z';
    expect((await admin(env, `${goalsBase}/report?${range}`, { token })).status).toBe(200);
    expect(
      (
        await admin(env, goalsBase, {
          token,
          method: 'POST',
          body: { name: 'x', kind: 'event', target: 'a' }
        })
      ).status
    ).toBe(403);
    expect((await admin(env, '/v1/admin/projects/p1/sources/s2/goals', { token })).status).toBe(
      404
    );
  });
});

describe('page grouping rules through the real Worker', () => {
  it('renames page keys as events arrive, and refuses invalid rules', async () => {
    const { env, sqlite } = environment();
    const set = await admin(env, '/v1/admin/projects/p1/sources/s1', {
      method: 'PATCH',
      body: { groupingRules: [{ pattern: '/blog/*', key: '/blog/:post' }] }
    });
    expect(set.status).toBe(200);
    expect(((await set.json()) as any).groupingRules).toEqual([
      { pattern: '/blog/*', key: '/blog/:post' }
    ]);
    await ingest(env, [
      pageView('evt-g-000001', '/blog/hello-world', 'a'),
      pageView('evt-g-000002', '/blog/second-post', 'b'),
      pageView('evt-g-000003', '/about', 'c')
    ]);
    expect(
      rowsOf(
        sqlite,
        "SELECT dimension_value AS page, SUM(event_count) AS n FROM dashboard_minute_dimensions WHERE dimension_kind = 'page_path' GROUP BY dimension_value ORDER BY page"
      )
    ).toEqual([
      { page: '/about', n: 1 },
      { page: '/blog/:post', n: 2 }
    ]);

    for (const bad of [
      [{ pattern: 'blog', key: '/x' }],
      [{ pattern: '/blog/', key: '/x' }],
      [{ pattern: '/a//b', key: '/x' }],
      'nope',
      Array(26).fill({ pattern: '/a', key: '/b' })
    ]) {
      const response = await admin(env, '/v1/admin/projects/p1/sources/s1', {
        method: 'PATCH',
        body: { groupingRules: bad }
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ field: 'groupingRules' });
    }
    const cleared = await admin(env, '/v1/admin/projects/p1/sources/s1', {
      method: 'PATCH',
      body: { groupingRules: [] }
    });
    expect(((await cleared.json()) as any).groupingRules).toEqual([]);
  });
});

describe('the pixel path cap through the real Worker', () => {
  it('counts known paths forever and ignores new ones past the cap, and says so in the status', async () => {
    const { env, sqlite } = environment({ VIZOALICA_PIXEL_MAX_PATHS: '2' });
    for (const path of ['/a', '/b', '/c', '/a', '/d'])
      expect((await pixel(env, path)).status).toBe(200);
    expect(
      rowsOf(
        sqlite,
        "SELECT dimension_value AS page, SUM(event_count) AS n FROM dashboard_minute_dimensions WHERE dimension_kind = 'page_path' GROUP BY dimension_value ORDER BY page"
      )
    ).toEqual([
      { page: '/a', n: 2 },
      { page: '/b', n: 1 }
    ]);
    const status = (await (
      await admin(env, '/v1/admin/projects/p1/sources/s2/status')
    ).json()) as any;
    expect(status.pixelPaths).toEqual({ count: 2, max: 2, capReached: true });
    const none = (await (
      await admin(env, '/v1/admin/projects/p1/sources/s1/status')
    ).json()) as any;
    expect(none.pixelPaths).toBeUndefined();
  });

  it('frees a slot when its path has not been seen for the retention period', async () => {
    const { env, sqlite } = environment({ VIZOALICA_PIXEL_MAX_PATHS: '2' });
    await pixel(env, '/a');
    await pixel(env, '/b');
    await pixel(env, '/c');
    expect(rowsOf(sqlite, 'SELECT path FROM pixel_paths ORDER BY path')).toEqual([
      { path: '/a' },
      { path: '/b' }
    ]);
    vi.setSystemTime(new Date('2026-02-10T12:00:00.000Z'));
    await pixel(env, '/b');
    const before = new Date('2026-02-10T12:00:00.000Z');
    before.setUTCDate(before.getUTCDate() - 32);
    sqlite.prepare('DELETE FROM pixel_paths WHERE last_seen_at < ?').run(before.toISOString());
    expect(rowsOf(sqlite, 'SELECT path FROM pixel_paths')).toEqual([{ path: '/b' }]);
    await pixel(env, '/c');
    expect(rowsOf(sqlite, 'SELECT path FROM pixel_paths ORDER BY path')).toEqual([
      { path: '/b' },
      { path: '/c' }
    ]);
  });

  it('refreshes last_seen_at at most once a day', async () => {
    const { env, sqlite } = environment();
    await pixel(env, '/a');
    vi.setSystemTime(new Date('2026-01-01T18:00:00.000Z'));
    await pixel(env, '/a');
    const same = rowsOf(sqlite, 'SELECT last_seen_at AS seen FROM pixel_paths')[0]!.seen;
    expect(same).toBe('2026-01-01T12:34:30.000Z');
    vi.setSystemTime(new Date('2026-01-03T12:00:00.000Z'));
    await pixel(env, '/a');
    expect(rowsOf(sqlite, 'SELECT last_seen_at AS seen FROM pixel_paths')[0]!.seen).toBe(
      '2026-01-03T12:00:00.000Z'
    );
  });

  it('ignores an invalid VIZOALICA_PIXEL_MAX_PATHS and uses the default', async () => {
    for (const value of ['abc', '0', '-3', '1.5']) {
      const { env, sqlite } = environment({ VIZOALICA_PIXEL_MAX_PATHS: value });
      for (const path of ['/a', '/b', '/c']) expect((await pixel(env, path)).status).toBe(200);
      expect(rowsOf(sqlite, 'SELECT COUNT(*) AS n FROM pixel_paths'), value).toEqual([{ n: 3 }]);
    }
  });

  it('keeps the first-come cap on a database without last_seen_at', async () => {
    const { env, sqlite } = environment({ VIZOALICA_PIXEL_MAX_PATHS: '1' });
    sqlite.exec('ALTER TABLE pixel_paths DROP COLUMN last_seen_at');
    await pixel(env, '/a');
    await pixel(env, '/b');
    expect(rowsOf(sqlite, 'SELECT path FROM pixel_paths')).toEqual([{ path: '/a' }]);
  });

  it('applies a default cap of 100 paths and groups before counting', async () => {
    const { env, sqlite } = environment();
    await admin(env, '/v1/admin/projects/p1/sources/s2', {
      method: 'PATCH',
      body: { groupingRules: [{ pattern: '/npm/*', key: '/npm/:package' }] }
    });
    for (let n = 0; n < 5; n += 1) await pixel(env, `/npm/pkg${n}`);
    expect(rowsOf(sqlite, 'SELECT path FROM pixel_paths')).toEqual([{ path: '/npm/:package' }]);
  });

  it('keeps counting on a database that predates the cap table', async () => {
    const { env, sqlite } = environment();
    sqlite.exec('DROP TABLE pixel_paths');
    await pixel(env, '/a');
    expect(
      rowsOf(
        sqlite,
        "SELECT SUM(event_count) AS n FROM dashboard_minute_dimensions WHERE dimension_kind = 'page_path'"
      )
    ).toEqual([{ n: 1 }]);
  });
});

describe('setup inventory and page labels through the real Worker', () => {
  const labelsBase = '/v1/admin/projects/p1/sources/s1/labels';
  const inventory = '/v1/admin/projects/p1/sources/s1/inventory';
  const range = 'start=2026-01-01T00:00:00.000Z&end=2026-01-01T12:40:00.000Z';

  it('lists what was collected and the current configuration', async () => {
    const { env } = environment();
    await admin(env, '/v1/admin/projects/p1/sources/s1/goals', {
      method: 'POST',
      body: { name: 'Signed up', kind: 'event', target: 'signup' }
    });
    await ingest(env, [
      pageView('evt-i-000001', '/pricing', 'a'),
      pageView('evt-i-000002', '/pricing', 'b'),
      pageView('evt-i-000003', '/docs', 'c'),
      custom('evt-i-000004', 'signup', 'a')
    ]);
    vi.setSystemTime(new Date('2026-01-01T12:40:00.000Z'));
    const response = await admin(env, `${inventory}?${range}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as any;
    expect(body.pages).toEqual([
      { key: '/pricing', views: 2 },
      { key: '/docs', views: 1 }
    ]);
    expect(body.events).toEqual([{ name: 'signup', count: 1 }]);
    expect(body.totals).toEqual({ pages: 2, actions: 0, events: 1 });
    expect(body.goals).toHaveLength(1);
    expect(body.labels).toEqual([]);
    expect((await admin(env, `${inventory}?start=bad&end=bad`)).status).toBe(400);
    expect((await admin(env, '/v1/admin/projects/p1/sources/nope/inventory?' + range)).status).toBe(
      404
    );
  });

  it('replaces labels as a set and validates them', async () => {
    const { env } = environment();
    const put = (labels: unknown, token?: string) =>
      admin(env, labelsBase, { method: 'PUT', body: { labels }, ...(token ? { token } : {}) });
    expect(
      (
        await put([
          { key: '/pricing', name: 'Pricing', group: 'Marketing' },
          { key: '/docs', name: 'Docs home' }
        ])
      ).status
    ).toBe(200);
    expect(await (await admin(env, labelsBase)).json()).toEqual([
      { key: '/docs', name: 'Docs home', group: '' },
      { key: '/pricing', name: 'Pricing', group: 'Marketing' }
    ]);
    // A second call replaces the first.
    await put([{ key: '/pricing', name: 'Plans', group: 'Marketing' }]);
    expect(await (await admin(env, labelsBase)).json()).toEqual([
      { key: '/pricing', name: 'Plans', group: 'Marketing' }
    ]);
    for (const bad of [
      'x',
      [{ key: 'pricing', name: 'A' }],
      [{ key: '/a?x=1', name: 'A' }],
      [{ key: '/a', name: '' }],
      [{ key: '/a', name: 'x'.repeat(81) }],
      [{ key: '/a', name: 'A', group: 'g'.repeat(61) }],
      [
        { key: '/a', name: 'A' },
        { key: '/a', name: 'B' }
      ],
      Array.from({ length: 501 }, (_, i) => ({ key: `/p${i}`, name: 'n' }))
    ])
      expect((await put(bad)).status).toBe(400);
    expect(
      (
        await admin(env, '/v1/admin/projects/p1/sources/nope/labels', {
          method: 'PUT',
          body: { labels: [] }
        })
      ).status
    ).toBe(404);
    // Names are shown with the inventory.
    vi.setSystemTime(new Date('2026-01-01T12:40:00.000Z'));
    const body = (await (await admin(env, `${inventory}?${range}`)).json()) as any;
    expect(body.labels).toEqual([{ key: '/pricing', name: 'Plans', group: 'Marketing' }]);
  });
});
