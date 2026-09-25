import { describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import type { Env, R2Bucket } from '../src/env.js';
import { d1, freshDatabase } from './support/sqlite-d1.js';

const ADMIN = 'admin-secret-0123456789abcdefghijklmn';

function bucket(fails = false): R2Bucket {
  return {
    async put() {},
    async list() {
      if (fails) throw new Error('r2 down');
      return { objects: [], truncated: false };
    },
    async delete() {}
  };
}

function environment(overrides: Partial<Env> = {}) {
  const env = {
    VIZOALICA_DB: d1(freshDatabase()),
    VIZOALICA_EVENTS: bucket(),
    VIZOALICA_TOKEN_SECRET: 'test-token-secret-0123456789abcdefgh',
    VIZOALICA_ADMIN_SECRET: ADMIN,
    VIZOALICA_ANALYTICS_DIGEST_SECRET: 'analytics-digest-secret-0123456789abcd',
    ...overrides
  } as unknown as Env;
  return env;
}

const call = (env: Env, path: string, token = ADMIN) =>
  worker.fetch(
    new Request(`https://worker.test${path}`, { headers: { authorization: `Bearer ${token}` } }),
    env
  );

describe('GET /v1/admin/backend', () => {
  it('reports the Worker version, the schema, and health', async () => {
    const env = environment({ VIZOALICA_WORKER_VERSION: '0.6.4' } as never);
    const response = await call(env, '/v1/admin/backend');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      workerVersion: '0.6.4',
      schema: {
        applied: 2,
        expected: 2,
        appliedNames: ['0001_initial.sql', '0002_access_keys.sql'],
        status: 'current'
      },
      health: { database: 'ok', storage: 'ok' }
    });
  });

  it('reports no version when the Worker was not told one', async () => {
    const response = await call(environment(), '/v1/admin/backend');
    expect(((await response.json()) as { workerVersion: string | null }).workerVersion).toBeNull();
  });

  it('reports storage trouble independently of the database', async () => {
    const env = environment();
    (env as unknown as { VIZOALICA_EVENTS: R2Bucket }).VIZOALICA_EVENTS = bucket(true);
    const response = await call(env, '/v1/admin/backend');
    expect(await response.json()).toMatchObject({
      health: { database: 'ok', storage: 'unavailable' }
    });
  });

  it('is readable by every role', async () => {
    const env = environment();
    const issued = await worker.fetch(
      new Request('https://worker.test/v1/admin/access-keys', {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' },
        body: JSON.stringify({ label: 'x', role: 'analyst' })
      }),
      env
    );
    const { key } = (await issued.json()) as { key: string };
    expect((await call(env, '/v1/admin/backend', key)).status).toBe(200);
  });

  it('never contains a secret', async () => {
    const response = await call(environment(), '/v1/admin/backend');
    expect(JSON.stringify(await response.json())).not.toContain(ADMIN);
  });
});

describe('schema status on a behind or ahead database', () => {
  it('is behind when only 0001 was applied', async () => {
    const env = environment({ VIZOALICA_DB: d1(freshDatabase({ upTo: 1 })) } as never);
    const response = await call(env, '/v1/admin/backend');
    expect(await response.json()).toMatchObject({ schema: { applied: 1, status: 'behind' } });
  });
});
