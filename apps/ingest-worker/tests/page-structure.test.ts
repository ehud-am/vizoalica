import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import type { Env, R2Bucket } from '../src/env.js';
import { d1, freshDatabase } from './support/sqlite-d1.js';

/** Page structure and the learning window through the real Worker on the real schema. */
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
  const bucket: R2Bucket = {
    async put(key, value) {
      puts.push({ key, value });
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

const structure = (id: string, extra: Record<string, unknown> = {}) =>
  event(id, 'com.vizoalica.page_structure.v1', {
    page: { url_origin: ORIGIN, url_path: '/pricing' },
    structure: {
      title: 'Pricing',
      headings: [{ level: 1, text: 'Plans for jane@example.com' }],
      controls: [{ role: 'button', name: 'Start trial' }, { role: 'button' }],
      ...extra
    },
    visitor: { anonymous_id: 'v1' },
    session: { id: 's1' }
  });
const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

describe('page structure', () => {
  it('is dropped while no learning window is set, and the other events are kept', async () => {
    const { env, puts } = environment();
    const response = await ingest(env, [structure('evt-struct-0001'), pageView('evt-struct-0002', '/pricing', 'a')]);
    expect(response.status).toBe(202);
    const stored = puts.flatMap((put) => JSON.parse(put.value) as Array<{ event: { type: string } }>);
    expect(stored.map((item) => item.event.type)).toEqual(['com.vizoalica.page_view.v1']);
    const only = await ingest(env, [structure('evt-struct-0003')]);
    expect(only.status).toBe(202);
    expect(puts).toHaveLength(1);
  });

  it('is stored, redacted, in the raw store only, while the window is open', async () => {
    const { env, puts, sqlite } = environment({ VIZOALICA_LEARN_START: today, VIZOALICA_LEARN_DAYS: '3' });
    expect((await ingest(env, [structure('evt-struct-0004')])).status).toBe(202);
    const stored = puts.flatMap((put) => JSON.parse(put.value) as Array<{ event: { type: string; data: any } }>);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.event.data.structure.headings[0].text).toBe('Plans for [email]');
    expect(JSON.stringify(stored)).not.toContain('jane@example.com');
    const rollups = sqlite.prepare("SELECT COUNT(*) AS n FROM dashboard_rollups WHERE event_type LIKE '%page_structure%'").get() as { n: number };
    expect(rollups.n).toBe(0);
  });

  it('is dropped before the window starts and refused when over the size cap', async () => {
    const early = environment({ VIZOALICA_LEARN_START: tomorrow });
    await ingest(early.env, [structure('evt-struct-0005')]);
    expect(early.puts).toHaveLength(0);
    const open = environment({ VIZOALICA_LEARN_START: today });
    const huge = structure('evt-struct-0006', {
      forms: Array.from({ length: 4 }, () => ({ name: 'F'.repeat(60), fields: Array.from({ length: 8 }, () => ({ type: 'text', label: 'L'.repeat(60) })) })),
      headings: Array.from({ length: 9 }, () => ({ level: 2, text: 'H'.repeat(80) })),
      controls: Array.from({ length: 25 }, () => ({ role: 'button', name: 'N'.repeat(80), landmark: 'navigation' }))
    });
    expect((await ingest(open.env, [huge])).status).toBe(400);
  });

  it('serves the window inside the SDK script, and nothing when none is set', async () => {
    const withWindow = environment({ VIZOALICA_LEARN_START: today, VIZOALICA_LEARN_DAYS: '7' });
    const script = await (await worker.fetch(new Request('https://worker.test/vizoalica.js'), withWindow.env)).text();
    expect(script.startsWith('globalThis.__vizoalicaLearn={"start":"')).toBe(true);
    const plain = environment();
    expect(await (await worker.fetch(new Request('https://worker.test/vizoalica.js'), plain.env)).text()).not.toContain('__vizoalicaLearn={');
    const invalid = environment({ VIZOALICA_LEARN_START: 'soon' });
    expect(await (await worker.fetch(new Request('https://worker.test/vizoalica.js'), invalid.env)).text()).not.toContain('__vizoalicaLearn={');
  });
});
