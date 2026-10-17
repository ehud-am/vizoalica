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
const OFFICE = '203.0.113.7';
const OUTSIDE = '198.51.100.9';

function environment(demo = true) {
  const sqlite = freshDatabase();
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

const ingest = (
  env: Env,
  options: { address?: string; ids?: string[]; authorization?: string; key?: string } = {}
) =>
  worker.fetch(
    new Request('https://worker.test/v1/events:batch', {
      method: 'POST',
      headers: {
        origin: ORIGIN,
        'content-type': 'application/cloudevents-batch+json',
        'x-vizoalica-source': options.key ?? 'shop-key',
        ...(options.address ? { 'cf-connecting-ip': options.address } : {}),
        ...(options.authorization ? { authorization: options.authorization } : {})
      },
      body: JSON.stringify((options.ids ?? ['evt-excl-0001']).map(pageView))
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
const setExcluded = (env: Env, addresses: unknown, source = 's1') =>
  admin(env, `/v1/admin/projects/p1/sources/${source}`, {
    method: 'PATCH',
    body: { excludedAddresses: addresses }
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-01T12:34:30.000Z'));
});
afterEach(() => vi.useRealTimers());

describe('excluding internal traffic through the real Worker', () => {
  it('drops events from an excluded address, counts them, and counts everyone else', async () => {
    const { env, sqlite, stored } = environment();
    expect((await setExcluded(env, [OFFICE, '192.0.2.0/24'])).status).toBe(200);

    const dropped = await ingest(env, { address: OFFICE, ids: ['evt-a-00001', 'evt-a-00002'] });
    expect(dropped.status).toBe(202);
    expect(await dropped.json()).toEqual({
      decision: 'excluded',
      accepted_count: 0,
      rejected_count: 0,
      reason_codes: ['excluded_address']
    });
    expect(stored).toEqual([]);
    for (const table of ['dashboard_rollups', 'dashboard_minute_totals', 'dashboard_seen_events'])
      expect(count(sqlite, table), table).toBe(0);
    expect(count(sqlite, 'quota_windows')).toBe(0);

    expect((await ingest(env, { address: '192.0.2.200', ids: ['evt-b-00001'] })).status).toBe(202);
    const kept = await ingest(env, { address: OUTSIDE, ids: ['evt-c-00001'] });
    expect(await kept.json()).toMatchObject({ decision: 'accepted', accepted_count: 1 });
    expect(stored).toHaveLength(1);
    expect(count(sqlite, 'dashboard_minute_totals')).toBe(1);

    const hits = (await (
      await admin(env, '/v1/admin/projects/p1/sources/s1/excluded-hits')
    ).json()) as any;
    expect(hits).toEqual({ total: 3, days: [{ day: '2026-01-01', count: 3 }], windowDays: 30 });
    // The address is nowhere in what was stored.
    expect(
      JSON.stringify([stored, sqlite.prepare('SELECT * FROM dashboard_excluded_hits').all()])
    ).not.toContain(OFFICE);
  });

  it('applies the new list at once, and stops excluding when it is cleared', async () => {
    const { env } = environment();
    expect(await (await ingest(env, { address: OFFICE })).json()).toMatchObject({
      decision: 'accepted'
    });
    await setExcluded(env, [OFFICE]);
    expect(
      await (await ingest(env, { address: OFFICE, ids: ['evt-d-00001'] })).json()
    ).toMatchObject({
      decision: 'excluded'
    });
    await setExcluded(env, []);
    expect(
      await (await ingest(env, { address: OFFICE, ids: ['evt-e-00001'] })).json()
    ).toMatchObject({
      decision: 'accepted'
    });
  });

  it('keeps websites apart: another website of the project still counts the address', async () => {
    const { env } = environment();
    await setExcluded(env, [OFFICE], 's1');
    expect(
      await (await ingest(env, { address: OFFICE, key: 'blog-key', ids: ['evt-f-00001'] })).json()
    ).toMatchObject({ decision: 'accepted' });
  });

  it('treats an IPv6 client and an IPv4-mapped client like the entries say', async () => {
    const { env } = environment();
    await setExcluded(env, ['2001:db8::/32', OFFICE]);
    expect(
      (await (await ingest(env, { address: '2001:db8:1::5', ids: ['evt-g-00001'] })).json()) as any
    ).toMatchObject({ decision: 'excluded' });
    expect(
      (await (
        await ingest(env, { address: `::ffff:${OFFICE}`, ids: ['evt-g-00002'] })
      ).json()) as any
    ).toMatchObject({ decision: 'excluded' });
    expect(
      (await (await ingest(env, { address: '2001:db9::1', ids: ['evt-g-00003'] })).json()) as any
    ).toMatchObject({ decision: 'accepted' });
  });

  it('refuses a bad token from an excluded address like from any other, and counts nothing', async () => {
    // Outside demo mode a website that needs tokens refuses unsigned and badly signed batches.
    const { env, sqlite } = environment(false);
    await setExcluded(env, [OFFICE]);
    const refused = await ingest(env, { address: OFFICE, authorization: 'Bearer not-a-token' });
    expect(refused.status).toBe(401);
    expect((await ingest(env, { address: OFFICE })).status).toBe(401);
    const unknown = await ingest(env, { address: OFFICE, key: 'no-such-key' });
    expect(unknown.status).toBe(403);
    expect(count(sqlite, 'dashboard_excluded_hits')).toBe(0);
  });

  it('does nothing without the address header', async () => {
    const { env } = environment();
    await setExcluded(env, ['0.0.0.0/0']);
    expect(await (await ingest(env, {})).json()).toMatchObject({ decision: 'accepted' });
  });
});

describe('the exclusion list in the admin API', () => {
  it('is stored in canonical form, returned to the admin, and counted for status', async () => {
    const { env } = environment();
    const response = await setExcluded(env, [
      '203.0.113.9/24',
      OFFICE,
      '2001:DB8::1',
      '203.0.113.7/32'
    ]);
    expect(response.status).toBe(200);
    const website = (await response.json()) as any;
    expect(website.excludedAddresses).toEqual(['203.0.113.0/24', OFFICE, '2001:db8::1']);
    expect(website.excludedAddressCount).toBe(3);
    const list = (await (await admin(env, '/v1/admin/projects/p1/sources')).json()) as any[];
    expect(list.find((item) => item.id === 's1').excludedAddresses).toHaveLength(3);
    expect(list.find((item) => item.id === 's2')).toMatchObject({
      excludedAddresses: [],
      excludedAddressCount: 0
    });
    const status = (await (
      await admin(env, '/v1/admin/projects/p1/sources/s1/status')
    ).json()) as any;
    expect(status).toMatchObject({ excludedAddressCount: 3, excludedHits30d: 0 });
  });

  it('can be set when a website is created, and is left alone by other edits', async () => {
    const { env } = environment();
    const created = await admin(env, '/v1/admin/projects/p1/sources', {
      method: 'POST',
      body: { name: 'New', allowedOrigins: [ORIGIN], excludedAddresses: [OFFICE] }
    });
    expect(created.status).toBe(201);
    const website = (await created.json()) as any;
    expect(website.excludedAddresses).toEqual([OFFICE]);
    const renamed = await admin(env, `/v1/admin/projects/p1/sources/${website.id}`, {
      method: 'PATCH',
      body: { name: 'Renamed' }
    });
    expect(((await renamed.json()) as any).excludedAddresses).toEqual([OFFICE]);
    const plain = await admin(env, '/v1/admin/projects/p1/sources', {
      method: 'POST',
      body: { name: 'Plain', allowedOrigins: [ORIGIN] }
    });
    expect(((await plain.json()) as any).excludedAddresses).toEqual([]);
  });

  it('refuses the whole request on a bad entry, naming its position and not echoing it', async () => {
    const { env } = environment();
    await setExcluded(env, [OFFICE]);
    const bad = await setExcluded(env, ['198.51.100.1', 'not-an-address-198.51.100.99']);
    expect(bad.status).toBe(400);
    const body = await bad.text();
    expect(JSON.parse(body)).toEqual({
      error: 'invalid_request',
      field: 'excludedAddresses',
      reason: 'invalid_entry',
      index: 1
    });
    expect(body).not.toContain('198.51.100');
    // Nothing was partly saved.
    const website = (await (await admin(env, '/v1/admin/projects/p1/sources')).json()) as any[];
    expect(website.find((item) => item.id === 's1').excludedAddresses).toEqual([OFFICE]);
    for (const value of [
      '203.0.113.7',
      {},
      Array.from({ length: 26 }, (_, index) => `10.0.0.${index}`)
    ])
      expect((await setExcluded(env, value)).status).toBe(400);
    const create = await admin(env, '/v1/admin/projects/p1/sources', {
      method: 'POST',
      body: { name: 'Bad', allowedOrigins: [ORIGIN], excludedAddresses: ['x'] }
    });
    expect(create.status).toBe(400);
  });

  it('shows addresses to the admin and to owners, but only a count to analysts', async () => {
    const { env } = environment();
    await setExcluded(env, [OFFICE]);
    const issue = async (role: 'analyst' | 'owner', scope: Record<string, string> = {}) =>
      (
        (await (
          await admin(env, '/v1/admin/access-keys', {
            method: 'POST',
            body: { label: role, role, ...scope }
          })
        ).json()) as { key: string }
      ).key;
    const analyst = await issue('analyst');
    const owner = await issue('owner', { projectId: 'p1', sourceId: 's1' });

    const asAnalyst = await admin(env, '/v1/admin/projects/p1/sources', { token: analyst });
    const analystText = await asAnalyst.text();
    expect(analystText).not.toContain(OFFICE);
    expect(JSON.parse(analystText).find((item: any) => item.id === 's1')).toMatchObject({
      excludedAddressCount: 1
    });
    expect(JSON.parse(analystText).find((item: any) => item.id === 's1')).not.toHaveProperty(
      'excludedAddresses'
    );
    const asOwner = (await (
      await admin(env, '/v1/admin/projects/p1/sources', { token: owner })
    ).json()) as any[];
    expect(asOwner[0].excludedAddresses).toEqual([OFFICE]);

    // An analyst cannot change it; an owner can, within scope only.
    expect(
      (
        await admin(env, '/v1/admin/projects/p1/sources/s1', {
          method: 'PATCH',
          token: analyst,
          body: { excludedAddresses: [] }
        })
      ).status
    ).toBe(403);
    expect(
      (
        await admin(env, '/v1/admin/projects/p1/sources/s2', {
          method: 'PATCH',
          token: owner,
          body: { excludedAddresses: ['10.0.0.1'] }
        })
      ).status
    ).toBeGreaterThanOrEqual(403);
    const changed = await admin(env, '/v1/admin/projects/p1/sources/s1', {
      method: 'PATCH',
      token: owner,
      body: { excludedAddresses: ['10.0.0.1'] }
    });
    expect(((await changed.json()) as any).excludedAddresses).toEqual(['10.0.0.1']);
  });

  it('never writes the addresses to the audit table', async () => {
    const { env, sqlite } = environment();
    await setExcluded(env, [OFFICE]);
    expect(
      JSON.stringify(sqlite.prepare('SELECT * FROM administrative_audit').all())
    ).not.toContain(OFFICE);
  });

  it('reports excluded hits within the key’s scope, newest day first, and 404 outside it', async () => {
    const { env, sqlite } = environment();
    sqlite.exec(`
      INSERT INTO dashboard_excluded_hits VALUES ('p1','s1','2026-01-01',4), ('p1','s1','2025-12-30',2), ('p1','s1','2025-11-01',9), ('p1','s2','2026-01-01',100);
    `);
    const report = (await (
      await admin(env, '/v1/admin/projects/p1/sources/s1/excluded-hits')
    ).json()) as any;
    expect(report).toEqual({
      total: 6,
      days: [
        { day: '2026-01-01', count: 4 },
        { day: '2025-12-30', count: 2 }
      ],
      windowDays: 30
    });
    const key = (
      (await (
        await admin(env, '/v1/admin/access-keys', {
          method: 'POST',
          body: { label: 'a', role: 'analyst', projectId: 'p1', sourceId: 's2' }
        })
      ).json()) as { key: string }
    ).key;
    expect(
      (await admin(env, '/v1/admin/projects/p1/sources/s1/excluded-hits', { token: key })).status
    ).toBe(404);
    expect(
      (await admin(env, '/v1/admin/projects/p1/sources/s2/excluded-hits', { token: key })).status
    ).toBe(200);
    expect((await admin(env, '/v1/admin/projects/p1/sources/nope/excluded-hits')).status).toBe(404);
    expect(
      (await admin(env, '/v1/admin/projects/p1/sources/s1/excluded-hits', { token: 'wrong' }))
        .status
    ).toBe(401);
  });
});

describe('excluded hit retention', () => {
  it('removes old counter rows with the other aggregates', async () => {
    const { env, sqlite } = environment();
    sqlite.exec(
      "INSERT INTO dashboard_excluded_hits VALUES ('p1','s1','2025-11-01',9), ('p1','s1','2026-01-01',1)"
    );
    await worker.scheduled({}, env);
    expect(sqlite.prepare('SELECT day_utc FROM dashboard_excluded_hits').all()).toEqual([
      { day_utc: '2026-01-01' }
    ]);
  });
});
