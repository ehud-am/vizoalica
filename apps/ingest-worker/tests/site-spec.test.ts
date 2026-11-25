import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import type { Env, R2Bucket } from '../src/env.js';
import { d1, freshDatabase } from './support/sqlite-d1.js';

/** Site specs through the real Worker on the real schema. */
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
    VIZOALICA_ANALYTICS_DIGEST_SECRET: 'analytics-digest-secret-0123456789abcd',
    VIZOALICA_DEMO_MODE: 'true',
    ...extra
  } as unknown as Env;
  return { env, sqlite };
}

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

const spec = (extra: Record<string, unknown> = {}) => ({
  meta: { version: 1, website: 'Storefront' },
  groups: [{ id: 'marketing', name: 'Marketing' }],
  pages: [{ id: 'pricing', match: ['/pricing'], name: 'Pricing', group: 'marketing' }],
  events: [{ id: 'signup', event: 'signup', name: 'Signup' }],
  ...extra
});
const PATH = '/v1/admin/projects/p1/sources/s1/spec';

describe('site spec routes', () => {
  it('starts empty, stores the latest, renders the markdown twin, and keeps one version', async () => {
    const { env } = environment();
    const empty = await admin(env, PATH);
    expect(await empty.json()).toEqual({ version: 0 });
    const first = await admin(env, PATH, { method: 'PUT', body: { spec: spec(), baseVersion: 0, gitSha: 'abc123' } });
    expect(first.status).toBe(200);
    const stored = (await first.json()) as { version: number; contentHash: string };
    expect(stored.version).toBe(1);
    expect(stored.contentHash).toMatch(/^[0-9a-f]{64}$/);
    const second = await admin(env, PATH, {
      method: 'PUT',
      body: { spec: spec({ pages: [{ id: 'pricing', match: ['/pricing'], name: 'Plans' }] }), baseVersion: 1 }
    });
    expect(((await second.json()) as { version: number }).version).toBe(2);
    const read = (await (await admin(env, PATH)).json()) as {
      version: number;
      gitSha: string;
      renderedMd: string;
      spec: { pages: Array<{ name: string }> };
    };
    expect(read.version).toBe(2);
    expect(read.spec.pages[0]?.name).toBe('Plans');
    expect(read.renderedMd).toContain('Plans');
    expect(read.gitSha).toBe('');
  });

  it('refuses a stale base version, an invalid spec and personal data', async () => {
    const { env } = environment();
    await admin(env, PATH, { method: 'PUT', body: { spec: spec(), baseVersion: 0 } });
    const stale = await admin(env, PATH, { method: 'PUT', body: { spec: spec(), baseVersion: 0 } });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: 'version_conflict', currentVersion: 1 });
    const bad = await admin(env, PATH, {
      method: 'PUT',
      body: { spec: spec({ pages: [{ id: 'x', match: ['/x'], name: 'X', purpose: 'ask jane@example.com' }] }), baseVersion: 1 }
    });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(await bad.json())).not.toContain('jane@example.com');
    expect((await admin(env, PATH, { method: 'PUT', body: { spec: spec() } })).status).toBe(400);
  });

  it('is not found for another website and refuses without a credential', async () => {
    const { env } = environment();
    expect((await admin(env, '/v1/admin/projects/p1/sources/zzz/spec', { method: 'PUT', body: { spec: spec(), baseVersion: 0 } })).status).toBe(404);
    expect((await admin(env, PATH, { token: 'wrong' })).status).toBe(401);
  });
});
