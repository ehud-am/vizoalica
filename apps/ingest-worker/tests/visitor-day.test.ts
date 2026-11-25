import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import type { Env, R2Bucket } from '../src/env.js';
import { resetDailySaltCache } from '../src/analytics/daily-visitor.js';
import { sampleEvents } from '../src/storage/learn-sample.js';
import { buildDigest, evaluateFunnel } from '../../ingest-api/src/spec/learn-digest.js';
import { d1, freshDatabase } from './support/sqlite-d1.js';

/** Funnels across page loads: the daily visitor token, through the real Worker and schema. */
const ADMIN = 'admin-secret-0123456789abcdefghijklmn';
const ORIGIN = 'https://shop.test';
const today = new Date().toISOString().slice(0, 10);
const CHROME = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36';

function environment(extra: Record<string, string> = {}) {
  const sqlite = freshDatabase();
  sqlite.exec(`
    INSERT INTO quota_policies VALUES ('q1', 131072, 25, 25, 100, 100000, 25, 256, 7);
    INSERT INTO projects VALUES ('p1','Shop','demo',7,'q1','active');
    INSERT INTO sources (id, project_id, name, public_source_key, allowed_origins_json, status, quota_policy_id, created_at, updated_at) VALUES ('s1','p1','Storefront','shop-key','["${ORIGIN}"]','active','q1','t','t');
  `);
  const objects = new Map<string, string>();
  const bucket: R2Bucket = {
    async put(key, value) {
      objects.set(key, value);
    },
    async list({ prefix = '', limit = 1000 }) {
      const keys = [...objects.keys()].filter((key) => key.startsWith(prefix)).sort();
      return { objects: keys.slice(0, limit).map((key) => ({ key })), truncated: false };
    },
    async delete() {},
    async get(key) {
      const value = objects.get(key);
      return value === undefined ? null : { text: async () => value };
    }
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
  return { env, objects, bucket };
}

let n = 0;
const view = (path: string, session: string, consent = 'analytics-granted') => ({
  specversion: '1.0',
  id: `evt-day-${String(++n).padStart(4, '0')}`,
  type: 'com.vizoalica.page_view.v1',
  source: ORIGIN,
  time: new Date(Date.now() + n * 1000).toISOString(),
  datacontenttype: 'application/json',
  vizoalicaconsent: consent,
  data: {
    page: { url_origin: ORIGIN, url_path: path, url_query_redacted: false },
    visitor: { anonymous_id: `anon-${session}` },
    session: { id: session }
  }
});
const ingest = (env: Env, ip: string, events: unknown[]) =>
  worker.fetch(
    new Request('https://worker.test/v1/events:batch', {
      method: 'POST',
      headers: {
        origin: ORIGIN,
        'content-type': 'application/cloudevents-batch+json',
        'x-vizoalica-source': 'shop-key',
        'cf-connecting-ip': ip,
        'user-agent': CHROME
      },
      body: JSON.stringify(events)
    }),
    env
  );
const stored = (objects: Map<string, string>) =>
  [...objects.values()].flatMap(
    (value) => JSON.parse(value) as Array<{ visitorDay?: string; event: { data: any } }>
  );

beforeEach(() => resetDailySaltCache());

describe('daily visitor token for funnels across page loads', () => {
  it('is written only while a learning window is open, and holds no address', async () => {
    const closed = environment();
    await ingest(closed.env, '203.0.113.7', [view('/pricing', 's1')]);
    expect(stored(closed.objects)[0]!.visitorDay).toBeUndefined();

    const open = environment({ VIZOALICA_LEARN_START: today, VIZOALICA_LEARN_DAYS: '3' });
    await ingest(open.env, '203.0.113.7', [view('/pricing', 's1')]);
    await ingest(open.env, '203.0.113.7', [view('/checkout', 's2')]);
    await ingest(open.env, '198.51.100.9', [view('/pricing', 's3')]);
    const tokens = stored(open.objects).map((item) => item.visitorDay);
    expect(tokens[0]).toMatch(new RegExp(`^${today}:[0-9a-f]{16}$`));
    expect(tokens[0]).toBe(tokens[1]);
    expect(tokens[2]).not.toBe(tokens[0]);
    await ingest(open.env, '203.0.113.7', [view('/pricing', 's4', 'analytics-denied')]);
    expect(stored(open.objects).at(-1)!.visitorDay).toBeUndefined();
    const raw = [...open.objects.values()].join('');
    expect(raw).not.toContain('203.0.113.7');
    expect(raw).not.toContain('198.51.100.9');
    expect(raw).not.toContain('Chrome');
  });

  it('lets a funnel cross page loads in the sample, without exposing any token', async () => {
    const { env, bucket } = environment({
      VIZOALICA_LEARN_START: today,
      VIZOALICA_LEARN_DAYS: '3'
    });
    for (const ip of ['203.0.113.1', '203.0.113.2', '203.0.113.3']) {
      await ingest(env, ip, [view('/pricing', `a-${ip}`)]);
      await ingest(env, ip, [view('/checkout', `b-${ip}`)]);
    }
    await ingest(env, '203.0.113.4', [view('/pricing', 'solo')]);
    const slice = await sampleEvents(bucket as never, 'p1', 's1', undefined, new Date());
    const steps = [
      { kind: 'page', key: '/pricing' },
      { kind: 'page', key: '/checkout' }
    ] as const;
    expect(evaluateFunnel(slice!.sketch, [...steps])).toEqual([4, 3]);
    expect(slice!.sketch.linked).toBe(4);
    expect(buildDigest(slice!.sketch, { minSessions: 1 }).quality.linkedShare).toBe(1);
    const text = JSON.stringify(slice);
    expect(text).not.toMatch(/203\.0\.113|[0-9a-f]{16}/);
    const route = await worker.fetch(
      new Request('https://worker.test/v1/admin/projects/p1/sources/s1/learn/sample', {
        headers: { authorization: `Bearer ${ADMIN}` }
      }),
      env
    );
    expect(JSON.stringify(await route.json())).not.toMatch(/203\.0\.113|[0-9a-f]{16}/);
  });
});
