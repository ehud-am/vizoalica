import { describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import type { Env, R2Bucket } from '../src/env.js';
import { d1, freshDatabase } from './support/sqlite-d1.js';

/** The learning sample through the real Worker on the real schema. */
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
  const puts: Array<{ key: string; value: string }> = [];
  const objects = new Map<string, string>();
  const bucket: R2Bucket = {
    async put(key, value) {
      puts.push({ key, value });
      objects.set(key, value);
    },
    async list({ prefix = '', limit = 1000, cursor }) {
      const keys = [...objects.keys()].filter((key) => key.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const page = keys.slice(start, start + limit);
      const more = start + limit < keys.length;
      return {
        objects: page.map((key) => ({ key })),
        truncated: more,
        ...(more ? { cursor: String(start + limit) } : {})
      };
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
  return { env, sqlite, puts };
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

const admin = (env: Env, path: string, token = ADMIN) =>
  worker.fetch(
    new Request(`https://worker.test${path}`, { headers: { authorization: `Bearer ${token}` } }),
    env
  );
const SAMPLE = '/v1/admin/projects/p1/sources/s1/learn/sample';

describe('learn sample route', () => {
  it('summarises the newest raw batches in slices, with counts only', async () => {
    const { env } = environment();
    for (let batch = 0; batch < 5; batch += 1)
      expect(
        (
          await ingest(env, [
            pageView(`evt-sample-a${batch}`, '/pricing', `v${batch}`),
            custom(`evt-sample-b${batch}`, 'signup', `v${batch}`)
          ])
        ).status
      ).toBe(202);
    const first = (await (await admin(env, SAMPLE)).json()) as {
      sketch: any;
      objects: number;
      done: boolean;
      cursor?: string;
    };
    expect(first.done).toBe(true);
    expect(first.objects).toBe(5);
    expect(first.sketch.pages).toEqual({ '/pricing': 5 });
    expect(first.sketch.customEvents.signup.count).toBe(5);
    expect(JSON.stringify(first)).not.toMatch(/"v[0-4]"|anonymous|s-v/);
  });

  it('continues from a cursor and refuses a bad one', async () => {
    const { env } = environment();
    for (let batch = 0; batch < 3; batch += 1)
      await ingest(env, [pageView(`evt-cursor-${batch}`, `/p${batch}`, `v${batch}`)]);
    const { sampleEvents } = await import('../src/storage/learn-sample.js');
    const bucket = env.VIZOALICA_EVENTS as any;
    const slice = await sampleEvents(bucket, 'p1', 's1', undefined, new Date(), 2);
    expect(slice?.objects).toBe(2);
    expect(slice?.done).toBe(false);
    const rest = await sampleEvents(bucket, 'p1', 's1', slice!.cursor, new Date(), 2);
    expect(rest?.objects).toBe(1);
    expect(Object.keys(rest!.sketch.pages).length).toBe(1);
    expect((await admin(env, `${SAMPLE}?cursor=zzz`)).status).toBe(400);
    expect(await sampleEvents(bucket, 'p1', 's1', 'zzz', new Date())).toBeUndefined();
  });

  it('is not found for another website and needs a credential', async () => {
    const { env } = environment();
    expect((await admin(env, '/v1/admin/projects/p1/sources/zzz/learn/sample')).status).toBe(404);
    expect((await admin(env, SAMPLE, 'wrong')).status).toBe(401);
  });
});
