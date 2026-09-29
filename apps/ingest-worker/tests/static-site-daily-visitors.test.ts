import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import type { Env, R2Bucket } from '../src/env.js';
import { resetDailySaltCache } from '../src/analytics/daily-visitor.js';
import { d1, freshDatabase } from './support/sqlite-d1.js';

/**
 * A static website (no token endpoint) through the real Worker and schema, and the cookieless
 * visitor count: the Worker's daily identifier, from a salt the scheduled job deletes.
 */
const ADMIN = 'admin-secret-0123456789abcdefghijklmn';
const ORIGIN = 'https://blog.test';
const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0';

function environment(tokenRequired: 0 | 1 = 0) {
  const sqlite = freshDatabase();
  sqlite.exec(`
    INSERT INTO quota_policies VALUES ('q1', 131072, 25, 25, 100, 100000, 25, 256, 7);
    INSERT INTO projects VALUES ('p1','Blog','production',7,'q1','active');
    INSERT INTO sources (id, project_id, name, public_source_key, allowed_origins_json, status, quota_policy_id, created_at, updated_at, token_required)
      VALUES ('s1','p1','Blog','blog-key','["${ORIGIN}"]','active','q1','2026-01-01T00:00:00.000Z','t',${tokenRequired});
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
    VIZOALICA_ANALYTICS_DIGEST_SECRET: 'analytics-digest-secret-0123456789abcd'
  } as unknown as Env;
  return { env, sqlite };
}

let sequence = 0;
function pageView() {
  sequence += 1;
  return {
    specversion: '1.0',
    id: `evt_static_${sequence.toString().padStart(6, '0')}`,
    type: 'com.vizoalica.page_view.v1',
    source: ORIGIN,
    time: new Date().toISOString(),
    datacontenttype: 'application/json',
    vizoalicaconsent: 'unknown',
    data: {
      page: { url_origin: ORIGIN, url_path: '/', url_query_redacted: false, title: null },
      // A fresh id per page load, as the SDK now sends: it must not decide the visitor count.
      visitor: { anonymous_id: `anon_${sequence}` },
      session: { id: `sess_${sequence}` }
    }
  };
}

const ingest = (env: Env, headers: Record<string, string> = {}) =>
  worker.fetch(
    new Request('https://worker.test/v1/events:batch', {
      method: 'POST',
      headers: {
        origin: ORIGIN,
        'content-type': 'application/cloudevents-batch+json',
        'x-vizoalica-source': 'blog-key',
        'cf-connecting-ip': '203.0.113.7',
        'user-agent': CHROME,
        ...headers
      },
      body: JSON.stringify([pageView()])
    }),
    env
  );

async function totals(env: Env, start: string, end: string) {
  vi.setSystemTime(new Date(end));
  const response = await worker.fetch(
    new Request(`https://worker.test/v1/admin/projects/p1/analytics?start=${start}&end=${end}`, {
      headers: { authorization: `Bearer ${ADMIN}` }
    }),
    env
  );
  return ((await response.json()) as { totals: { pageViews: number; uniqueUsers: number } }).totals;
}

beforeEach(() => {
  resetDailySaltCache();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-02T10:00:00.000Z'));
});
afterEach(() => vi.useRealTimers());

describe('a static website', () => {
  it('collects unsigned page views from its allowed origin', async () => {
    const { env } = environment();
    expect((await ingest(env)).status).toBe(202);
  });

  it('refuses another origin, and an unsigned batch when the website requires tokens', async () => {
    expect((await ingest(environment().env, { origin: 'https://evil.test' })).status).toBe(403);
    expect((await ingest(environment(1).env)).status).toBe(401);
  });

  it('can be switched to require tokens, and back, through the admin API', async () => {
    const { env } = environment();
    const patch = (tokenRequired: unknown) =>
      worker.fetch(
        new Request('https://worker.test/v1/admin/projects/p1/sources/s1', {
          method: 'PATCH',
          headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' },
          body: JSON.stringify({ tokenRequired })
        }),
        env
      );
    expect((await patch('yes')).status).toBe(400);
    expect(((await (await patch(true)).json()) as { tokenRequired: boolean }).tokenRequired).toBe(
      true
    );
    expect((await ingest(env)).status).toBe(401);
    await patch(false);
    expect((await ingest(env)).status).toBe(202);
  });
});

describe('cookieless unique visitors', () => {
  it('counts one visitor for many page loads from the same address and browser in a day', async () => {
    const { env } = environment();
    for (let index = 0; index < 3; index += 1) await ingest(env);
    await ingest(env, { 'cf-connecting-ip': '198.51.100.9' });
    await ingest(env, { 'user-agent': FIREFOX });
    expect(await totals(env, '2026-01-02T00:00:00.000Z', '2026-01-02T11:00:00.000Z')).toEqual({
      pageViews: 5,
      uniqueUsers: 3
    });
  });

  it('uses a new salt each day, and the scheduled job deletes the finished days', async () => {
    const { env, sqlite } = environment();
    await ingest(env);
    const first = sqlite.prepare('SELECT day_utc, salt FROM daily_visitor_salts').all();
    vi.setSystemTime(new Date('2026-01-03T10:00:00.000Z'));
    await ingest(env);
    const days = sqlite.prepare('SELECT day_utc, salt FROM daily_visitor_salts ORDER BY day_utc');
    const both = days.all() as Array<{ day_utc: string; salt: string }>;
    expect(both.map((row) => row.day_utc)).toEqual(['2026-01-02', '2026-01-03']);
    expect(both[0]).toEqual(first[0]);
    expect(both[1]!.salt).not.toBe(both[0]!.salt);
    // The same person on two days counts once per day.
    expect(await totals(env, '2026-01-02T00:00:00.000Z', '2026-01-03T11:00:00.000Z')).toEqual({
      pageViews: 2,
      uniqueUsers: 2
    });
    await worker.scheduled({}, env);
    expect(days.all()).toEqual([both[1]]);
  });

  it('never stores the address or the user agent', async () => {
    const { env, sqlite } = environment();
    await ingest(env);
    const everything = JSON.stringify(
      (
        sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
          name: string;
        }>
      ).map(({ name }) => sqlite.prepare(`SELECT * FROM "${name}"`).all())
    );
    expect(everything).not.toContain('203.0.113.7');
    expect(everything).not.toContain('Macintosh');
  });
});

describe('the SDK served by the Worker', () => {
  it('serves the browser SDK at /vizoalica.js, cacheable and loadable from any website', async () => {
    const response = await worker.fetch(
      new Request('https://worker.test/vizoalica.js'),
      environment().env
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('javascript');
    expect(response.headers.get('cache-control')).toContain('max-age');
    expect(await response.text()).toContain('Vizoalica browser SDK');
  });
});
