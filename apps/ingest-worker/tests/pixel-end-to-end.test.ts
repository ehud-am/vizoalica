import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import type { Env, R2Bucket } from '../src/env.js';
import { count } from './support/fixtures.js';
import { d1, freshDatabase } from './support/sqlite-d1.js';

/** The no-JavaScript pixel through the real Worker entry point on the real schema. */
const ADMIN = 'admin-secret-0123456789abcdefghijklmn';
const OFFICE = '203.0.113.7';

function environment() {
  const sqlite = freshDatabase();
  sqlite.exec(`
    INSERT INTO quota_policies VALUES ('q1', 131072, 25, 25, 100, 100000, 25, 256, 7);
    INSERT INTO projects VALUES ('p1','Docs','production',7,'q1','active');
    INSERT INTO sources (id, project_id, name, public_source_key, allowed_origins_json, status, quota_policy_id, created_at, updated_at) VALUES ('s1','p1','Readme','readme-key','[]','active','q1','t','t');
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
    VIZOALICA_ANALYTICS_DIGEST_SECRET: 'analytics-digest-secret-0123456789abcd'
  } as unknown as Env;
  return { env, sqlite, stored };
}

const pixel = (
  env: Env,
  query = 'website=readme-key&path=/npm/vizoalica',
  init: { method?: string; address?: string } = {}
) =>
  worker.fetch(
    new Request(`https://worker.test/v1/pixel.gif?${query}`, {
      method: init.method ?? 'GET',
      headers: init.address ? { 'cf-connecting-ip': init.address } : {}
    }),
    env
  );
const admin = (env: Env, body: unknown) =>
  worker.fetch(
    new Request('https://worker.test/v1/admin/projects/p1/sources/s1', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }),
    env
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-01T12:34:30.000Z'));
});
afterEach(() => vi.useRealTimers());

describe('the no-JavaScript pixel', () => {
  it('answers every request with the same uncached image, counted or not', async () => {
    const { env, sqlite } = environment();
    for (const query of [
      'website=readme-key&path=/npm/vizoalica',
      'website=unknown&path=/x',
      'path=/x',
      ''
    ]) {
      const response = await pixel(env, query);
      expect(response.status, query).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/gif');
      expect(response.headers.get('cache-control')).toContain('no-store');
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(String.fromCharCode(...bytes.slice(0, 6))).toBe('GIF89a');
    }
    expect(count(sqlite, 'dashboard_rollups')).toBe(0);
  });

  it('is off by default and counts nothing until the website opts in', async () => {
    const { env, sqlite, stored } = environment();
    await pixel(env);
    expect(stored).toEqual([]);
    expect(count(sqlite, 'dashboard_rollups')).toBe(0);

    expect((await admin(env, { pixelEnabled: true })).status).toBe(200);
    await pixel(env, 'website=readme-key&path=/npm/vizoalica', { address: OFFICE });
    expect(stored).toHaveLength(1);
    expect(JSON.parse(stored[0]!)[0]).toMatchObject({
      trustLevel: 'pixel',
      event: { vizoalicaauth: 'pixel', data: { page: { url_path: '/npm/vizoalica' } } }
    });
    expect(count(sqlite, 'dashboard_rollups')).toBe(1);
    expect(
      sqlite.prepare('SELECT page_view_count AS n FROM dashboard_hourly_page_views').get()
    ).toEqual({ n: 1 });
    expect(count(sqlite, 'dashboard_hourly_visitors')).toBe(1);

    expect((await admin(env, { pixelEnabled: false })).status).toBe(200);
    await pixel(env);
    expect(stored).toHaveLength(1);
  });

  it('never counts a HEAD request, a bad path, or an excluded address', async () => {
    const { env, stored } = environment();
    await admin(env, { pixelEnabled: true, excludedAddresses: [OFFICE] });
    await pixel(env, 'website=readme-key&path=/npm/vizoalica', { method: 'HEAD' });
    for (const path of ['npm/x', '/x?token=1', '/x#frag', `/${'a'.repeat(600)}`, '/x\n'])
      await pixel(env, `website=readme-key&path=${encodeURIComponent(path)}`);
    await pixel(env, 'website=readme-key&path=/npm/vizoalica', { address: OFFICE });
    expect(stored).toEqual([]);
  });

  it('refuses a disabled website', async () => {
    const { env, sqlite, stored } = environment();
    await admin(env, { pixelEnabled: true });
    sqlite.exec("UPDATE sources SET status = 'disabled'");
    await pixel(env);
    expect(stored).toEqual([]);
  });

  it('accepts the setting on creation, rejects a non-boolean, and reports it', async () => {
    const { env } = environment();
    const bad = await admin(env, { pixelEnabled: 'yes' });
    expect(bad.status).toBe(400);
    const created = await worker.fetch(
      new Request('https://worker.test/v1/admin/projects/p1/sources', {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Npm',
          allowedOrigins: ['https://docs.test'],
          pixelEnabled: true
        })
      }),
      env
    );
    expect(created.status).toBe(201);
    expect(((await created.json()) as { pixelEnabled: boolean }).pixelEnabled).toBe(true);
    const list = await worker.fetch(
      new Request('https://worker.test/v1/admin/projects/p1/sources', {
        headers: { authorization: `Bearer ${ADMIN}` }
      }),
      env
    );
    const sources = (await list.json()) as Array<{ name: string; pixelEnabled: boolean }>;
    expect(sources.find((item) => item.name === 'Readme')?.pixelEnabled).toBe(false);
  });
});
