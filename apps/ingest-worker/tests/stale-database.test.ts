import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import type { Env, R2Bucket } from '../src/env.js';
import { count } from './support/fixtures.js';
import { d1, freshDatabase } from './support/sqlite-d1.js';

/**
 * Internal-traffic exclusion through the real Worker entry point on the real schema, so a method
 * missing from the object `index.ts` builds, or a column the SQL forgets, shows up here.
 */
const ADMIN = 'admin-secret-0123456789abcdefghijklmn';
const ORIGIN = 'https://shop.test';

function environment(upTo: number) {
  const demo = true;
  const sqlite = freshDatabase({ upTo });
  sqlite.exec(`
    INSERT INTO quota_policies VALUES ('q1', 131072, 25, 25, 100, 100000, 25, 256, 7);
    INSERT INTO projects VALUES ('p1','Shop','demo',7,'q1','active');
    INSERT INTO sources (id, project_id, name, public_source_key, allowed_origins_json, status, quota_policy_id, created_at, updated_at) VALUES ('s1','p1','Storefront','shop-key','["${ORIGIN}"]','active','q1','t','t');
    INSERT INTO sources (id, project_id, name, public_source_key, allowed_origins_json, status, quota_policy_id, created_at, updated_at) VALUES ('s2','p1','Blog','blog-key','["${ORIGIN}"]','active','q1','t','t');
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
    ...(demo ? { VIZOALICA_DEMO_MODE: 'true' } : {})
  } as unknown as Env;
  return { env, sqlite, stored };
}

const pageView = (id: string) => ({
  specversion: '1.0',
  id,
  type: 'com.vizoalica.page_view.v1',
  source: ORIGIN,
  time: new Date().toISOString(),
  datacontenttype: 'application/json',
  vizoalicaconsent: 'analytics-granted',
  data: {
    page: { url_origin: ORIGIN, url_path: '/pricing', url_query_redacted: false },
    visitor: { anonymous_id: 'anon-1' },
    session: { id: 'sess-1' }
  }
});

const view = (id: string, campaign?: unknown) => {
  const event = pageView(id);
  return campaign === undefined ? event : { ...event, data: { ...event.data, campaign } };
};
const ingest = (env: Env, events: unknown[]) =>
  worker.fetch(
    new Request('https://worker.test/v1/events:batch', {
      method: 'POST',
      headers: {
        origin: ORIGIN,
        'content-type': 'application/cloudevents-batch+json',
        'x-vizoalica-source': 'shop-key'
      },
      body: JSON.stringify(events)
    }),
    env
  );
const admin = (env: Env, path: string, init: { method?: string; body?: unknown } = {}) =>
  worker.fetch(
    new Request(`https://worker.test${path}`, {
      method: init.method ?? 'GET',
      headers: {
        authorization: `Bearer ${ADMIN}`,
        ...(init.body ? { 'content-type': 'application/json' } : {})
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {})
    }),
    env
  );
const RANGE = 'start=2026-01-01T12:00:00.000Z&end=2026-01-01T12:34:00.000Z';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-01T12:34:30.000Z'));
});
afterEach(() => vi.useRealTimers());

describe('a Worker newer than its database (the update stopped before the migrations)', () => {
  it('keeps counting page views when only the campaign tables are missing', async () => {
    const { env, sqlite } = environment(4);
    const response = await ingest(env, [
      view('evt-stale-0001', { source: 'newsletter' }),
      view('evt-stale-0002')
    ]);
    expect(response.status).toBe(202);
    expect(count(sqlite, 'dashboard_minute_totals')).toBe(1);
    expect(
      sqlite.prepare('SELECT page_view_count AS n FROM dashboard_minute_totals').get()
    ).toEqual({ n: 2 });
    // The nonce is released, so the same events are not stuck half-processed.
    expect(
      sqlite
        .prepare('SELECT COUNT(*) AS n FROM dashboard_seen_events WHERE request_nonce IS NOT NULL')
        .get()
    ).toEqual({ n: 0 });
  });

  it('answers the campaigns report with a clear 503', async () => {
    const { env } = environment(4);
    const response = await admin(env, `/v1/admin/projects/p1/analytics/campaigns?${RANGE}`);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'database_update_needed' });
  });

  it('refuses to save an exclusion list with a clear 503, and still saves other edits', async () => {
    const { env } = environment(5);
    const refused = await admin(env, '/v1/admin/projects/p1/sources/s1', {
      method: 'PATCH',
      body: { excludedAddresses: ['203.0.113.7'] }
    });
    expect(refused.status).toBe(503);
    expect(await refused.json()).toMatchObject({ error: 'database_update_needed' });
    const renamed = await admin(env, '/v1/admin/projects/p1/sources/s1', {
      method: 'PATCH',
      body: { name: 'Renamed' }
    });
    expect(renamed.status).toBe(200);
    const created = await admin(env, '/v1/admin/projects/p1/sources', {
      method: 'POST',
      body: { name: 'New', allowedOrigins: [ORIGIN], excludedAddresses: ['203.0.113.7'] }
    });
    expect(created.status).toBe(503);
  });

  it('answers the excluded-hits report with a clear 503 but keeps status and the website list working', async () => {
    const { env } = environment(5);
    const hits = await admin(env, '/v1/admin/projects/p1/sources/s1/excluded-hits');
    expect(hits.status).toBe(503);
    expect((await admin(env, '/v1/admin/projects/p1/sources/s1/status')).status).toBe(200);
    expect((await admin(env, '/v1/admin/projects/p1/sources')).status).toBe(200);
  });

  it('still ingests untagged page views and ordinary events', async () => {
    const { env, sqlite } = environment(4);
    expect((await ingest(env, [view('evt-stale-0003')])).status).toBe(202);
    expect(count(sqlite, 'dashboard_minute_totals')).toBe(1);
  });

  it('keeps recording clicks when only the rage click table is missing', async () => {
    const { env, sqlite } = environment(6);
    const action = (id: string, rage?: boolean) => ({
      specversion: '1.0',
      id,
      type: 'com.vizoalica.action.v1',
      source: ORIGIN,
      time: new Date().toISOString(),
      datacontenttype: 'application/json',
      vizoalicaconsent: 'analytics-granted',
      data: {
        page: { url_origin: ORIGIN, url_path: '/pricing' },
        action: { name: 'Pay', kind: 'button', ...(rage ? { rage: true } : {}) },
        visitor: { anonymous_id: 'anon-1' },
        session: { id: 'sess-1' }
      }
    });
    expect(
      (await ingest(env, [action('evt-stale-0010'), action('evt-stale-0011', true)])).status
    ).toBe(202);
    expect(
      sqlite.prepare('SELECT SUM(event_count) AS n FROM dashboard_minute_actions').get()
    ).toEqual({ n: 1 });
    expect(
      sqlite
        .prepare('SELECT COUNT(*) AS n FROM dashboard_seen_events WHERE request_nonce IS NOT NULL')
        .get()
    ).toEqual({ n: 0 });
  });

  it('answers the rage clicks report with a clear 503', async () => {
    const { env } = environment(6);
    const response = await admin(env, `/v1/admin/projects/p1/analytics/rage-clicks?${RANGE}`);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'database_update_needed' });
  });
});
