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
  const env = {
    VIZOALICA_DB: d1(sqlite),
    VIZOALICA_EVENTS: bucket,
    VIZOALICA_TOKEN_SECRET: 'test-token-secret-0123456789abcdefgh',
    VIZOALICA_ADMIN_SECRET: ADMIN,
    VIZOALICA_ANALYTICS_DIGEST_SECRET: 'analytics-digest-secret-0123456789abcd'
  } as unknown as Env;
  return { env };
}

const call = (env: Env, path: string, options: { method?: string; body?: unknown } = {}) =>
  worker.fetch(
    new Request(`https://worker.test${path}`, {
      method: options.method ?? 'GET',
      headers: {
        authorization: `Bearer ${ADMIN}`,
        ...(options.body ? { 'content-type': 'application/json' } : {})
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {})
    }),
    env
  );

describe('issuing a key', () => {
  it('accepts a well-formed request and returns the key once', async () => {
    const { env } = environment();
    const response = await call(env, '/v1/admin/access-keys', {
      method: 'POST',
      body: { label: 'Jane, analyst', role: 'analyst' }
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      label: 'Jane, analyst',
      role: 'analyst',
      scope: { projectId: null, sourceId: null }
    });
    expect(body.key).toMatch(/^vzk_/);
    expect(body.secretHash).toBeUndefined();
    const list = (await (await call(env, '/v1/admin/access-keys')).json()) as Array<
      Record<string, unknown>
    >;
    expect(list).toHaveLength(1);
    expect(list[0]!.key).toBeUndefined();
    expect(JSON.stringify(list)).not.toMatch(/secretHash|secret_hash/);
  });

  it('rejects an invalid label, role, or scope', async () => {
    const { env } = environment();
    for (const body of [
      { label: '', role: 'analyst' },
      { label: 'x'.repeat(65), role: 'analyst' },
      { label: 'bad\x01char', role: 'analyst' },
      { label: 'ok', role: 'admin' },
      { label: 'ok', role: 'nope' },
      { label: 'ok', role: 'owner', sourceId: 's1' } // sourceId without projectId
    ])
      expect(
        (await call(env, '/v1/admin/access-keys', { method: 'POST', body })).status,
        JSON.stringify(body)
      ).toBe(400);
  });

  it('requires the project and website to exist and be active', async () => {
    const { env } = environment();
    expect(
      (
        await call(env, '/v1/admin/access-keys', {
          method: 'POST',
          body: { label: 'x', role: 'owner', projectId: 'missing' }
        })
      ).status
    ).toBe(404);
    expect(
      (
        await call(env, '/v1/admin/access-keys', {
          method: 'POST',
          body: { label: 'x', role: 'owner', projectId: 'p1', sourceId: 'missing' }
        })
      ).status
    ).toBe(404);
  });

  it('refuses a 201st active key', async () => {
    const { env } = environment();
    for (let index = 0; index < 200; index += 1)
      await call(env, '/v1/admin/access-keys', {
        method: 'POST',
        body: { label: `k${index}`, role: 'analyst' }
      });
    const refused = await call(env, '/v1/admin/access-keys', {
      method: 'POST',
      body: { label: 'one too many', role: 'analyst' }
    });
    expect(refused.status).toBe(409);
  }, 20000);
});

describe('revoking a key', () => {
  it('is idempotent and takes effect on the next request', async () => {
    const { env } = environment();
    const created = await call(env, '/v1/admin/access-keys', {
      method: 'POST',
      body: { label: 'x', role: 'analyst' }
    });
    const { id, key } = (await created.json()) as { id: string; key: string };
    const first = await call(env, `/v1/admin/access-keys/${id}`, { method: 'DELETE' });
    expect(first.status).toBe(200);
    const second = await call(env, `/v1/admin/access-keys/${id}`, { method: 'DELETE' });
    expect(second.status).toBe(200);
    const usedAfter = await worker.fetch(
      new Request('https://worker.test/v1/admin/projects', {
        headers: { authorization: `Bearer ${key}` }
      }),
      env
    );
    expect(usedAfter.status).toBe(401);
  });

  it('answers 404 for an unknown id', async () => {
    const { env } = environment();
    expect(
      (await call(env, '/v1/admin/access-keys/does-not-exist', { method: 'DELETE' })).status
    ).toBe(404);
  });
});

describe('deleting a project removes its keys', () => {
  it('purges keys scoped to a deleted project once purge runs', async () => {
    const { env } = environment();
    const created = await call(env, '/v1/admin/access-keys', {
      method: 'POST',
      body: { label: 'x', role: 'owner', projectId: 'p1' }
    });
    const id = ((await created.json()) as { id: string }).id;
    await call(env, '/v1/admin/projects/p1', { method: 'DELETE' });
    const purged = await call(env, '/v1/admin/purge-deleted', {
      method: 'POST',
      body: { dryRun: false }
    });
    expect(purged.status).toBe(200);
    const list = (await (await call(env, '/v1/admin/access-keys')).json()) as Array<{ id: string }>;
    expect(list.find((key) => key.id === id)).toBeUndefined();
  });
});
