import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import type { Env, R2Bucket } from '../src/env.js';
import { d1, freshDatabase } from './support/sqlite-d1.js';

/**
 * The whole path through the real Worker entry point on the real schema: an event batch is posted,
 * passes the privacy guard, is aggregated, and comes back through the admin API. Mocked repositories
 * cannot see wiring mistakes (a method missing from the object `index.ts` builds); this can.
 */
const ADMIN = 'admin-secret-0123456789abcdefghijklmn';
const ORIGIN = 'https://shop.test';

function environment() {
  const sqlite = freshDatabase();
  sqlite.exec(`
    INSERT INTO quota_policies VALUES ('q1', 131072, 25, 25, 100, 100000, 25, 256, 7);
    INSERT INTO projects VALUES ('p1','Shop','demo',7,'q1','active');
    INSERT INTO sources VALUES ('s1','p1','Storefront','shop-key','["${ORIGIN}"]','active','q1','t','t');
  `);
  const stored: string[] = [];
  const bucket: R2Bucket = {
    async put(_key, value) {
      stored.push(String(value));
    },
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
    VIZOALICA_DEMO_MODE: 'true'
  } as unknown as Env;
  return { env, stored };
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
const visitor = { visitor: { anonymous_id: 'anon-1' }, session: { id: 'sess-1' } };

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
const admin = (env: Env, path: string, authorized = true) =>
  worker.fetch(
    new Request(`https://worker.test${path}`, {
      headers: authorized ? { authorization: `Bearer ${ADMIN}` } : {}
    }),
    env
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-01T12:34:30.000Z'));
});
afterEach(() => vi.useRealTimers());

describe('actions through the real Worker', () => {
  it('ingests page views and actions, groups identifiers, redacts labels, and reports them', async () => {
    const { env, stored } = environment();
    const response = await ingest(env, [
      // An older SDK's page view: the identifier is still in the path.
      event('evt-page-0001', 'com.vizoalica.page_view.v1', {
        page: { url_origin: ORIGIN, url_path: '/orders/8841', url_query_redacted: false },
        ...visitor
      }),
      event('evt-page-0002', 'com.vizoalica.page_view.v1', {
        page: { url_origin: ORIGIN, url_path: '/#/pricing', url_query_redacted: false },
        ...visitor
      })
    ]);
    expect(response.status).toBe(202);
    const actions = await ingest(env, [
      event('evt-act-00001', 'com.vizoalica.action.v1', {
        page: { url_origin: ORIGIN, url_path: '/orders/8841/' },
        action: { name: 'Delete jane@example.com', kind: 'button' },
        ...visitor
      }),
      event('evt-act-00002', 'com.vizoalica.action.v1', {
        page: { url_origin: ORIGIN, url_path: '/#/pricing' },
        action: {
          name: 'Start free trial',
          kind: 'link',
          destination: { url_origin: 'https://app.shop.test', url_path: '/invoices/5551234' }
        },
        ...visitor
      })
    ]);
    expect(actions.status).toBe(202);

    vi.setSystemTime(new Date('2026-01-01T12:36:00.000Z'));
    const range = 'start=2026-01-01T12:00:00.000Z&end=2026-01-01T12:36:00.000Z';
    const result = await admin(env, `/v1/admin/projects/p1/analytics/actions?${range}`);
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('no-store');
    const report = (await result.json()) as any;
    expect(report.totals).toEqual({ actions: 2, uniqueUsers: 1 });
    expect(report.rows).toEqual([
      {
        page: '/#/pricing',
        action: 'Start free trial',
        kind: 'link',
        destination: 'https://app.shop.test/invoices/:id',
        count: 1,
        visitors: 1,
        pageViews: 1
      },
      {
        page: '/orders/:id',
        action: 'Delete [email]',
        kind: 'button',
        count: 1,
        visitors: 1,
        pageViews: 1
      }
    ]);

    // Narrowing by the grouped page key works through the same route.
    const narrowed = (await (
      await admin(
        env,
        `/v1/admin/projects/p1/analytics/actions?${range}&page=${encodeURIComponent('/orders/:id')}`
      )
    ).json()) as any;
    expect(narrowed.rows).toHaveLength(1);
    expect(narrowed.selection).toEqual({ page: { path: '/orders/:id', views: 1, actions: 1 } });

    // The overview reports the grouped page too, and no stored or reported text has the originals.
    const overview = (await (
      await admin(env, `/v1/admin/projects/p1/analytics?${range}`)
    ).json()) as any;
    expect(overview.rankings.pagePaths.items.map((item: any) => item.label).sort()).toEqual([
      '/#/pricing',
      '/orders/:id'
    ]);
    const everything = JSON.stringify([report, narrowed, overview, stored]);
    for (const original of ['8841', 'jane@example.com', '5551234'])
      expect(everything).not.toContain(original);
  });

  it('protects the route like every admin route', async () => {
    const { env } = environment();
    const range = 'start=2026-01-01T12:00:00.000Z&end=2026-01-01T12:34:00.000Z';
    expect(
      (await admin(env, `/v1/admin/projects/p1/analytics/actions?${range}`, false)).status
    ).toBe(401);
    expect((await admin(env, `/v1/admin/projects/nope/analytics/actions?${range}`)).status).toBe(
      404
    );
    expect(
      (await admin(env, '/v1/admin/projects/p1/analytics/actions?start=bad&end=bad')).status
    ).toBe(400);
  });

  it('rejects an action whose path still carries a query, and stores nothing for it', async () => {
    const { env } = environment();
    const response = await ingest(env, [
      event('evt-bad-0001', 'com.vizoalica.action.v1', {
        page: { url_origin: ORIGIN, url_path: '/checkout?token=secret' },
        action: { name: 'Pay', kind: 'button' },
        ...visitor
      })
    ]);
    expect(response.status).toBe(400);
    vi.setSystemTime(new Date('2026-01-01T12:36:00.000Z'));
    const report = (await (
      await admin(
        env,
        '/v1/admin/projects/p1/analytics/actions?start=2026-01-01T12:00:00.000Z&end=2026-01-01T12:36:00.000Z'
      )
    ).json()) as any;
    expect(report.totals.actions).toBe(0);
  });
});
