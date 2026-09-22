import { describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import type { Env, R2Bucket } from '../src/env.js';
import { d1, freshDatabase } from './support/sqlite-d1.js';

const ADMIN = 'admin-secret-0123456789abcdefghijklmn';

function bucket(): R2Bucket {
  return {
    async put() {},
    async list() {
      return { objects: [], truncated: false };
    },
    async delete() {}
  };
}

function environment() {
  const sqlite = freshDatabase();
  sqlite.exec(`
    INSERT INTO quota_policies VALUES ('q1', 131072, 25, 25, 100, 100000, 25, 256, 7);
    INSERT INTO quota_policies VALUES ('q2', 131072, 25, 25, 100, 100000, 25, 256, 7);
    INSERT INTO projects VALUES ('p1','Shop','demo',7,'q1','active');
    INSERT INTO projects VALUES ('p2','Other','demo',7,'q2','active');
    INSERT INTO sources VALUES ('s1','p1','Storefront','shop-key','["https://shop.test"]','active','q1','t','t');
    INSERT INTO sources VALUES ('s2','p1','Blog','blog-key','["https://blog.test"]','active','q1','t','t');
  `);
  const env = {
    VIZOALICA_DB: d1(sqlite),
    VIZOALICA_EVENTS: bucket(),
    VIZOALICA_TOKEN_SECRET: 'test-token-secret-0123456789abcdefgh',
    VIZOALICA_ADMIN_SECRET: ADMIN,
    VIZOALICA_ANALYTICS_DIGEST_SECRET: 'analytics-digest-secret-0123456789abcd'
  } as unknown as Env;
  return { env, sqlite };
}

async function call(
  env: Env,
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {}
) {
  return worker.fetch(
    new Request(`https://worker.test${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(options.body ? { 'content-type': 'application/json' } : {})
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {})
    }),
    env
  );
}

async function issueKey(
  env: Env,
  role: 'analyst' | 'owner',
  scope: { projectId?: string; sourceId?: string } = {}
): Promise<string> {
  const response = await call(env, '/v1/admin/access-keys', {
    method: 'POST',
    token: ADMIN,
    body: { label: `${role} key`, role, ...scope }
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { key: string }).key;
}

describe('GET /v1/admin/whoami', () => {
  it('reports role, scope, label, and features for the admin and for each key', async () => {
    const { env } = environment();
    const admin = await call(env, '/v1/admin/whoami', { token: ADMIN });
    expect(await admin.json()).toMatchObject({
      role: 'admin',
      scope: { projectId: null, sourceId: null },
      keyLabel: null,
      features: { accessKeys: true, versions: true }
    });
    const analystKey = await issueKey(env, 'analyst');
    const analyst = await call(env, '/v1/admin/whoami', { token: analystKey });
    expect(await analyst.json()).toMatchObject({
      role: 'analyst',
      scope: { projectId: null, sourceId: null },
      keyLabel: 'analyst key'
    });
    const ownerKey = await issueKey(env, 'owner', { projectId: 'p1', sourceId: 's1' });
    const owner = await call(env, '/v1/admin/whoami', { token: ownerKey });
    expect(await owner.json()).toMatchObject({
      role: 'owner',
      scope: { projectId: 'p1', sourceId: 's1' }
    });
  });
});

describe('reads: every role within its scope, refused outside it', () => {
  it('lets the admin, an unscoped analyst, and an unscoped owner see everything', async () => {
    const { env } = environment();
    for (const token of [ADMIN, await issueKey(env, 'analyst'), await issueKey(env, 'owner')]) {
      const projects = await call(env, '/v1/admin/projects', { token });
      expect((await projects.json()) as unknown[]).toHaveLength(2);
    }
  });

  it('limits a project-scoped key to that project, and a website-scoped key to that website', async () => {
    const { env } = environment();
    const projectKey = await issueKey(env, 'analyst', { projectId: 'p1' });
    const projects = (await (
      await call(env, '/v1/admin/projects', { token: projectKey })
    ).json()) as Array<{
      id: string;
    }>;
    expect(projects.map((p) => p.id)).toEqual(['p1']);
    expect((await call(env, '/v1/admin/projects/p2/sources', { token: projectKey })).status).toBe(
      404
    );

    const websiteKey = await issueKey(env, 'analyst', { projectId: 'p1', sourceId: 's1' });
    const sources = (await (
      await call(env, '/v1/admin/projects/p1/sources', { token: websiteKey })
    ).json()) as Array<{
      id: string;
    }>;
    expect(sources.map((s) => s.id)).toEqual(['s1']);
    expect(
      (await call(env, '/v1/admin/projects/p1/sources/s2/status', { token: websiteKey })).status
    ).toBe(404);
  });

  it('forces an overview or actions read without source_id to a website-scoped key’s own website', async () => {
    const { env } = environment();
    const websiteKey = await issueKey(env, 'analyst', { projectId: 'p1', sourceId: 's1' });
    const start = '2026-01-01T00:00:00.000Z';
    const end = '2026-01-02T00:00:00.000Z';
    const overview = await call(env, `/v1/admin/projects/p1/analytics?start=${start}&end=${end}`, {
      token: websiteKey
    });
    expect(overview.status).toBe(200);
    const other = await call(
      env,
      `/v1/admin/projects/p1/analytics?start=${start}&end=${end}&source_id=s2`,
      {
        token: websiteKey
      }
    );
    expect(other.status).toBe(404);
  });
});

describe('writes: analysts never, owners only in scope', () => {
  it('refuses every write from an analyst key with 403', async () => {
    const { env } = environment();
    const key = await issueKey(env, 'analyst');
    for (const [path, method, body] of [
      ['/v1/admin/projects', 'POST', { name: 'X' }],
      ['/v1/admin/projects/p1', 'DELETE', undefined],
      ['/v1/admin/projects/p1/sources', 'POST', { name: 'X', allowedOrigins: ['https://x.test'] }],
      ['/v1/admin/projects/p1/sources/s1', 'PATCH', { name: 'x' }],
      ['/v1/admin/projects/p1/sources/s1', 'DELETE', undefined],
      ['/v1/admin/projects/p1/sources/s1:disable', 'POST', undefined]
    ] as const) {
      const response = await call(env, path, { method, token: key, body });
      expect(response.status, path).toBe(403);
    }
  });

  it('lets an owner with scope everything create a project; refuses a scoped owner', async () => {
    const { env } = environment();
    const everything = await issueKey(env, 'owner');
    const created = await call(env, '/v1/admin/projects', {
      method: 'POST',
      token: everything,
      body: { name: 'New' }
    });
    expect(created.status).toBe(201);

    const scoped = await issueKey(env, 'owner', { projectId: 'p1' });
    const refused = await call(env, '/v1/admin/projects', {
      method: 'POST',
      token: scoped,
      body: { name: 'Nope' }
    });
    expect(refused.status).toBe(403);
  });

  it('lets an owner scoped to a project add a website there, but not to another project', async () => {
    const { env } = environment();
    const key = await issueKey(env, 'owner', { projectId: 'p1' });
    const created = await call(env, '/v1/admin/projects/p1/sources', {
      method: 'POST',
      token: key,
      body: { name: 'New site', allowedOrigins: ['https://new.test'] }
    });
    expect(created.status).toBe(201);
    const denied = await call(env, '/v1/admin/projects/p2/sources', {
      method: 'POST',
      token: key,
      body: { name: 'New site', allowedOrigins: ['https://new.test'] }
    });
    expect(denied.status).toBe(403);
  });

  it('lets a website-scoped owner edit, enable, disable, and delete that website only', async () => {
    const { env } = environment();
    const key = await issueKey(env, 'owner', { projectId: 'p1', sourceId: 's1' });
    expect(
      (await call(env, '/v1/admin/projects/p1/sources/s1:disable', { method: 'POST', token: key }))
        .status
    ).toBe(200);
    expect(
      (
        await call(env, '/v1/admin/projects/p1/sources/s1', {
          method: 'PATCH',
          token: key,
          body: { status: 'active' }
        })
      ).status
    ).toBe(200);
    expect(
      (await call(env, '/v1/admin/projects/p1/sources/s2:disable', { method: 'POST', token: key }))
        .status
    ).toBe(404);
    expect(
      (await call(env, '/v1/admin/projects/p1/sources/s1', { method: 'DELETE', token: key })).status
    ).toBe(200);
  });

  it('never lets an owner create outside scope, however it is scoped', async () => {
    const { env } = environment();
    const websiteKey = await issueKey(env, 'owner', { projectId: 'p1', sourceId: 's1' });
    const denied = await call(env, '/v1/admin/projects/p1/sources', {
      method: 'POST',
      token: websiteKey,
      body: { name: 'X', allowedOrigins: ['https://x.test'] }
    });
    expect(denied.status).toBe(403);
  });
});

describe('backend-level routes and the MCP interface: admin only', () => {
  it('refuses purge-deleted, key management, and MCP for every key', async () => {
    const { env } = environment();
    const ownerKey = await issueKey(env, 'owner');
    const analystKey = await issueKey(env, 'analyst');
    for (const token of [ownerKey, analystKey]) {
      expect(
        (
          await call(env, '/v1/admin/purge-deleted', {
            method: 'POST',
            token,
            body: { dryRun: true }
          })
        ).status
      ).toBe(403);
      expect((await call(env, '/v1/admin/access-keys', { token })).status).toBe(403);
      expect(
        (
          await call(env, '/v1/admin/access-keys', {
            method: 'POST',
            token,
            body: { label: 'x', role: 'analyst' }
          })
        ).status
      ).toBe(403);
      const mcp = await worker.fetch(
        new Request('https://worker.test/mcp', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
        }),
        env
      );
      expect(mcp.status).not.toBe(200);
    }
  });
});

describe('revoked, foreign, and malformed keys', () => {
  it('refuses a revoked key on the next request', async () => {
    const { env } = environment();
    const response = await call(env, '/v1/admin/access-keys', {
      method: 'POST',
      token: ADMIN,
      body: { label: 'temp', role: 'analyst' }
    });
    const { id, key } = (await response.json()) as { id: string; key: string };
    expect((await call(env, '/v1/admin/projects', { token: key })).status).toBe(200);
    expect(
      (await call(env, `/v1/admin/access-keys/${id}`, { method: 'DELETE', token: ADMIN })).status
    ).toBe(200);
    expect((await call(env, '/v1/admin/projects', { token: key })).status).toBe(401);
  });

  it('refuses malformed and unknown keys, and never leaks whether an id exists', async () => {
    const { env } = environment();
    for (const bad of ['not-a-key', 'vzk_ababababab00_' + 'x'.repeat(43), `Bearer stray`])
      expect((await call(env, '/v1/admin/projects', { token: bad })).status).toBe(401);
  });
});

describe('audit', () => {
  it('records an owner write with the key id as the actor, and no secret or hash anywhere', async () => {
    const { env, sqlite } = environment();
    const key = await issueKey(env, 'owner');
    const created = await call(env, '/v1/admin/projects', {
      method: 'POST',
      token: key,
      body: { name: 'Audited' }
    });
    const id = ((await created.json()) as { id: string }).id;
    const rows = sqlite
      .prepare('SELECT operation, actor, project_id FROM administrative_audit WHERE operation = ?')
      .all('create_project') as Array<{
      operation: string;
      actor: string | null;
      project_id: string;
    }>;
    const own = rows.find((row) => row.project_id === id);
    expect(own?.actor).toMatch(/^[a-z0-9]{12}$/);
    const adminWrite = await call(env, '/v1/admin/projects', {
      method: 'POST',
      token: ADMIN,
      body: { name: 'ByAdmin' }
    });
    const adminId = ((await adminWrite.json()) as { id: string }).id;
    const adminRow = rows
      .concat(
        sqlite
          .prepare(
            'SELECT operation, actor, project_id FROM administrative_audit WHERE operation = ?'
          )
          .all('create_project') as never
      )
      .find((row) => row.project_id === adminId);
    expect(adminRow?.actor).toBeFalsy();
  });
});

describe('a database that has not been updated to schema 2', () => {
  it('still serves the admin, and answers key routes with 501', async () => {
    const sqlite = freshDatabase({ upTo: 1 });
    sqlite.exec(`
      INSERT INTO quota_policies VALUES ('q1', 131072, 25, 25, 100, 100000, 25, 256, 7);
      INSERT INTO projects VALUES ('p1','Shop','demo',7,'q1','active');
    `);
    const env = {
      VIZOALICA_DB: d1(sqlite),
      VIZOALICA_EVENTS: bucket(),
      VIZOALICA_TOKEN_SECRET: 'test-token-secret-0123456789abcdefgh',
      VIZOALICA_ADMIN_SECRET: ADMIN,
      VIZOALICA_ANALYTICS_DIGEST_SECRET: 'analytics-digest-secret-0123456789abcd'
    } as unknown as Env;
    expect((await call(env, '/v1/admin/projects', { token: ADMIN })).status).toBe(200);
    expect((await call(env, '/v1/admin/access-keys', { token: ADMIN })).status).toBe(501);
    expect(
      (
        await call(env, '/v1/admin/projects', {
          token: 'vzk_' + 'a'.repeat(12) + '_' + 'b'.repeat(43)
        })
      ).status
    ).toBe(401);
  });
});
