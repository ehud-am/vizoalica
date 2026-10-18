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
    INSERT INTO sources (id, project_id, name, public_source_key, allowed_origins_json, status, quota_policy_id, created_at, updated_at) VALUES ('s1','p1','Storefront','shop-key','["${ORIGIN}"]','active','q1','t','t');
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
const visitor = (id: string) => ({ visitor: { anonymous_id: id }, session: { id: 'sess-1' } });

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

const view = (id: string, visitorId: string, campaign?: unknown) =>
  event(id, 'com.vizoalica.page_view.v1', {
    page: { url_origin: ORIGIN, url_path: '/pricing', url_query_redacted: true },
    ...visitor(visitorId),
    ...(campaign === undefined ? {} : { campaign })
  });
const RANGE = 'start=2026-01-01T12:00:00.000Z&end=2026-01-01T12:36:00.000Z';

describe('campaigns through the real Worker', () => {
  it('ingests tagged page views, cleans hostile labels, and reports them', async () => {
    const { env, stored } = environment();
    const response = await ingest(env, [
      view('evt-camp-0001', 'a', {
        source: 'newsletter',
        medium: 'email',
        campaign: 'spring-sale'
      }),
      view('evt-camp-0002', 'b', {
        source: 'Newsletter',
        medium: 'email',
        campaign: 'spring-sale'
      }),
      view('evt-camp-0003', 'c', {
        source: 'jane@example.com',
        campaign: '<script>4111111111111111'
      }),
      view('evt-camp-0004', 'd')
    ]);
    expect(response.status).toBe(202);

    vi.setSystemTime(new Date('2026-01-01T12:36:00.000Z'));
    const result = await admin(env, `/v1/admin/projects/p1/analytics/campaigns?${RANGE}`);
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('no-store');
    const report = (await result.json()) as any;
    expect(report.totals).toEqual({ pageViews: 3, uniqueUsers: 3, allPageViews: 4 });
    expect(report.rows).toEqual([
      { source: 'newsletter', medium: 'email', campaign: 'spring-sale', count: 2, visitors: 2 },
      { source: '[email]', medium: '', campaign: 'script[number]', count: 1, visitors: 1 }
    ]);

    const narrowed = (await (
      await admin(env, `/v1/admin/projects/p1/analytics/campaigns?${RANGE}&source=newsletter`)
    ).json()) as any;
    expect(narrowed.totals.pageViews).toBe(2);

    const everything = JSON.stringify([report, narrowed, stored]);
    for (const original of ['jane@example.com', '4111111111111111', '<script>', 'Newsletter'])
      expect(everything).not.toContain(original);
  });

  it('refuses a malformed campaign and stores nothing for the batch', async () => {
    const { env, stored } = environment();
    for (const campaign of [{}, { term: 'shoes' }, { source: 'x'.repeat(65) }, { source: 5 }]) {
      const response = await ingest(env, [view('evt-camp-bad01', 'a', campaign)]);
      expect(response.status).toBe(400);
    }
    expect(stored).toEqual([]);
    vi.setSystemTime(new Date('2026-01-01T12:36:00.000Z'));
    const report = (await (
      await admin(env, `/v1/admin/projects/p1/analytics/campaigns?${RANGE}`)
    ).json()) as any;
    expect(report.totals).toEqual({ pageViews: 0, uniqueUsers: 0, allPageViews: 0 });
  });

  it('counts a replayed batch once', async () => {
    const { env } = environment();
    const batch = [view('evt-camp-0009', 'a', { source: 'twitter' })];
    expect((await ingest(env, batch)).status).toBe(202);
    expect((await ingest(env, batch)).status).toBe(202);
    vi.setSystemTime(new Date('2026-01-01T12:36:00.000Z'));
    const report = (await (
      await admin(env, `/v1/admin/projects/p1/analytics/campaigns?${RANGE}`)
    ).json()) as any;
    expect(report.totals.pageViews).toBe(1);
  });

  it('protects the route like every admin route', async () => {
    const { env } = environment();
    const range = 'start=2026-01-01T12:00:00.000Z&end=2026-01-01T12:34:00.000Z';
    expect(
      (await admin(env, `/v1/admin/projects/p1/analytics/campaigns?${range}`, false)).status
    ).toBe(401);
    expect((await admin(env, `/v1/admin/projects/nope/analytics/campaigns?${range}`)).status).toBe(
      404
    );
    expect(
      (await admin(env, '/v1/admin/projects/p1/analytics/campaigns?start=bad&end=bad')).status
    ).toBe(400);
  });
});
