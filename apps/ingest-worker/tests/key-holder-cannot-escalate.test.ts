import { describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import type { Env, R2Bucket } from '../src/env.js';
import { d1, freshDatabase } from './support/sqlite-d1.js';

const ADMIN = 'admin-secret-0123456789abcdefghijklmn';

function environment() {
  const sqlite = freshDatabase();
  sqlite.exec(`
    INSERT INTO quota_policies VALUES ('q1', 131072, 25, 25, 100, 100000, 25, 256, 7);
    INSERT INTO projects VALUES ('p1','Shop','demo',7,'q1','active');
    INSERT INTO sources VALUES ('s1','p1','Storefront','shop-key','["https://shop.test"]','active','q1','t','t');
  `);
  const bucket: R2Bucket = {
    async put() {},
    async list() {
      return { objects: [], truncated: false };
    },
    async delete() {}
  };
  return {
    VIZOALICA_DB: d1(sqlite),
    VIZOALICA_EVENTS: bucket,
    VIZOALICA_TOKEN_SECRET: 'test-token-secret-0123456789abcdefgh',
    VIZOALICA_ADMIN_SECRET: ADMIN,
    VIZOALICA_ANALYTICS_DIGEST_SECRET: 'analytics-digest-secret-0123456789abcd'
  } as unknown as Env;
}

const call = (env: Env, path: string, token: string, method = 'GET', body?: unknown) =>
  worker.fetch(
    new Request(`https://worker.test${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { 'content-type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    }),
    env
  );

async function issue(env: Env, role: 'analyst' | 'owner'): Promise<string> {
  const response = await call(env, '/v1/admin/access-keys', ADMIN, 'POST', { label: role, role });
  return ((await response.json()) as { key: string }).key;
}

describe.each(['analyst', 'owner'] as const)('a %s key', (role) => {
  it('cannot reach the administrator secret, another key, or a hash, in any response body', async () => {
    const env = environment();
    const key = await issue(env, role);
    const responses = await Promise.all([
      call(env, '/v1/admin/whoami', key),
      call(env, '/v1/admin/backend', key),
      call(env, '/v1/admin/projects', key),
      call(env, '/v1/admin/projects/p1/sources', key),
      call(env, '/v1/admin/projects/p1/sources/s1/snippet', key),
      call(env, '/v1/admin/projects/p1/sources/s1/status', key)
    ]);
    for (const response of responses) {
      const text = await response.text();
      expect(text).not.toContain(ADMIN);
      expect(text).not.toContain(key);
      expect(text).not.toMatch(/secretHash|secret_hash|[0-9a-f]{64}/);
    }
  });

  it('is refused on every backend-level route and the automation interface', async () => {
    const env = environment();
    const key = await issue(env, role);
    expect((await call(env, '/v1/admin/purge-deleted', key, 'POST', { dryRun: true })).status).toBe(
      403
    );
    expect((await call(env, '/v1/admin/access-keys', key)).status).toBe(403);
    expect(
      (await call(env, '/v1/admin/access-keys', key, 'POST', { label: 'x', role: 'analyst' }))
        .status
    ).toBe(403);
    const mcp = await worker.fetch(
      new Request('https://worker.test/mcp', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
      }),
      env
    );
    expect(mcp.status).not.toBe(200);
  });

  it('cannot use its key as if it were the administrator secret elsewhere', async () => {
    const env = environment();
    const key = await issue(env, role);
    const asAdminSecret = new Request('https://worker.test/v1/admin/projects', {
      headers: { authorization: `Bearer ${key}` }
    });
    // Same call the admin path uses; still resolves to the key's own role, never admin.
    const response = await worker.fetch(asAdminSecret, env);
    expect(response.status).not.toBe(403); // reads are allowed…
    const whoami = await call(env, '/v1/admin/whoami', key);
    expect(((await whoami.json()) as { role: string }).role).toBe(role);
  });
});
