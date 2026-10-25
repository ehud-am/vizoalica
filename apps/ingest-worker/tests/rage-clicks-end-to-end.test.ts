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
  return { env, stored, sqlite };
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

describe('rage clicks through the real Worker', () => {
  const click = (id: string, rage?: boolean) =>
    event(id, 'com.vizoalica.action.v1', {
      page: { url_origin: ORIGIN, url_path: '/orders/8841' },
      action: { name: 'Pay jane@example.com', kind: 'button', ...(rage ? { rage: true } : {}) },
      ...visitor
    });

  it('accepts a rage signal, keeps it out of the click counts, and reports it', async () => {
    const { env, sqlite } = environment();
    const response = await ingest(env, [click('evt-click-0001'), click('evt-click-0002')]);
    expect(response.status).toBe(202);
    expect((await ingest(env, [click('evt-rage-00001', true)])).status).toBe(202);

    vi.setSystemTime(new Date('2026-01-01T12:36:00.000Z'));
    const range = 'start=2026-01-01T12:00:00.000Z&end=2026-01-01T12:36:00.000Z';
    const actions = (await (
      await admin(env, `/v1/admin/projects/p1/analytics/actions?${range}`)
    ).json()) as any;
    expect(actions.totals.actions).toBe(2);

    const result = await admin(env, `/v1/admin/projects/p1/analytics/rage-clicks?${range}`);
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('no-store');
    const report = (await result.json()) as any;
    expect(report.totals).toEqual({ bursts: 1, clicks: 2 });
    // The page key is grouped and the label redacted, as for any action.
    expect(report.rows).toEqual([
      { page: '/orders/:id', action: 'Pay [email]', kind: 'button', count: 1, clicks: 2 }
    ]);
    expect(
      JSON.stringify(sqlite.prepare('SELECT * FROM dashboard_minute_rage_clicks').all())
    ).not.toContain('anon-1');
  });

  it('rejects a rage flag that is not exactly true, and requires the admin credential to read', async () => {
    const { env } = environment();
    const bad = event('evt-rage-00002', 'com.vizoalica.action.v1', {
      page: { url_origin: ORIGIN, url_path: '/' },
      action: { name: 'Pay', kind: 'button', rage: 'yes' },
      ...visitor
    });
    expect((await ingest(env, [bad])).status).toBe(400);
    const range = 'start=2026-01-01T12:00:00.000Z&end=2026-01-01T12:36:00.000Z';
    expect(
      (await admin(env, `/v1/admin/projects/p1/analytics/rage-clicks?${range}`, false)).status
    ).toBe(401);
  });
});
