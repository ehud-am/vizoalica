import { describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { D1Repositories } from '../src/storage/d1-repositories.js';
import type { D1Database, D1Statement, Env } from '../src/env.js';

function fakeDb(options: { batchFails?: boolean; changesPerBatch?: number[] } = {}) {
  const prepared: Array<{ query: string; values: unknown[] }> = [];
  let batchCalls = 0;
  const makeStatement = (query: string): D1Statement => {
    let values: unknown[] = [];
    return {
      bind(...next: unknown[]) {
        values = next;
        prepared.push({ query, values });
        return this;
      },
      async run() {
        return { meta: { changes: 0 } };
      },
      async all<T>() {
        return { results: [] as T[] };
      },
      async first<T>() {
        return null as T | null;
      }
    };
  };
  const db: D1Database = {
    prepare: makeStatement,
    async batch(statements) {
      batchCalls += 1;
      if (options.batchFails) throw new Error('d1_unavailable');
      for (const statement of statements) await statement.run();
      const changes = options.changesPerBatch?.[batchCalls - 1] ?? 0;
      return statements.map(() => ({ meta: { changes } }));
    }
  };
  return { db, prepared, batchCount: () => batchCalls };
}

describe('dashboard retention cleanup', () => {
  it('deletes only rows before the 32-day boundary across every rollup table', async () => {
    const fake = fakeDb();
    const repositories = new D1Repositories(fake.db);
    const before = '2025-12-08T00:00:00.000Z';
    await repositories.deleteExpiredDashboardData(before);

    const tables = [
      'dashboard_minute_totals',
      'dashboard_minute_dimensions',
      'dashboard_minute_visitors',
      'dashboard_seen_events'
    ];
    for (const table of tables) {
      const call = fake.prepared.find((entry) => entry.query.includes(table));
      expect(call, `expected a delete statement against ${table}`).toBeTruthy();
      expect(call!.query).toMatch(/^DELETE FROM/);
      expect(call!.values).toEqual([before]);
    }
  });

  it('bounds each table deletion to a limited batch rather than an unbounded scan', async () => {
    const fake = fakeDb();
    const repositories = new D1Repositories(fake.db);
    await repositories.deleteExpiredDashboardData('2025-12-08T00:00:00.000Z');
    for (const entry of fake.prepared) expect(entry.query).toMatch(/LIMIT \d+/);
  });

  it('does not touch the per-source watermark table during cleanup', async () => {
    const fake = fakeDb();
    const repositories = new D1Repositories(fake.db);
    await repositories.deleteExpiredDashboardData('2025-12-08T00:00:00.000Z');
    expect(fake.prepared.some((entry) => entry.query.includes('watermark'))).toBe(false);
  });

  it('issues one transactional batch rather than per-table fire-and-forget deletes', async () => {
    const fake = fakeDb();
    const repositories = new D1Repositories(fake.db);
    await repositories.deleteExpiredDashboardData('2025-12-08T00:00:00.000Z');
    expect(fake.batchCount()).toBe(1);
  });

  it('propagates a batch failure rather than reporting silent success', async () => {
    const fake = fakeDb({ batchFails: true });
    const repositories = new D1Repositories(fake.db);
    await expect(
      repositories.deleteExpiredDashboardData('2025-12-08T00:00:00.000Z')
    ).rejects.toThrow('d1_unavailable');
  });

  it('also prunes decision and quota-window rows so no table grows without bound', async () => {
    const fake = fakeDb();
    await new D1Repositories(fake.db).deleteExpiredDashboardData('2025-12-08T00:00:00.000Z');
    for (const table of ['ingestion_decisions', 'quota_windows'])
      expect(fake.prepared.some((entry) => entry.query.includes(`DELETE FROM ${table}`))).toBe(
        true
      );
  });

  it('repeats full batches until every table is drained', async () => {
    const fake = fakeDb({ changesPerBatch: [1000, 1000, 40] });
    await new D1Repositories(fake.db).deleteExpiredDashboardData('2025-12-08T00:00:00.000Z');
    expect(fake.batchCount()).toBe(3);
  });

  it('caps the passes per run so a huge backlog cannot pin the Cron invocation', async () => {
    const fake = fakeDb({ changesPerBatch: Array(1000).fill(1000) });
    await new D1Repositories(fake.db).deleteExpiredDashboardData('2025-12-08T00:00:00.000Z');
    expect(fake.batchCount()).toBe(200);
  });

  it('the Worker scheduled handler deletes rows older than 32 days, aligned to a whole minute', async () => {
    const fake = fakeDb();
    const env: Env = {
      VIZOALICA_DB: fake.db,
      VIZOALICA_EVENTS: {
        async put() {},
        async list() {
          return { objects: [], truncated: false };
        },
        async delete() {}
      },
      VIZOALICA_TOKEN_SECRET: 'test-token-secret-0123456789abcdefgh',
      VIZOALICA_ADMIN_SECRET: 'admin-secret-0123456789abcdefghijklmn',
      VIZOALICA_ANALYTICS_DIGEST_SECRET: 'analytics-digest-secret-0123456789abcd'
    };
    const before = Date.now();
    await worker.scheduled!({} as never, env);
    const after = Date.now();

    expect(fake.batchCount()).toBe(1);
    const boundary = new Date(fake.prepared[0]!.values[0] as string);
    expect(boundary.getUTCSeconds()).toBe(0);
    expect(boundary.getUTCMilliseconds()).toBe(0);
    const ageMs = before - boundary.getTime();
    const expectedAgeMs = 32 * 24 * 60 * 60 * 1000;
    // Rounding down to the start of the minute can add up to 60s of age; allow that plus margin.
    expect(ageMs).toBeGreaterThan(expectedAgeMs - 1000);
    expect(ageMs).toBeLessThan(expectedAgeMs + 60_000 + (after - before) + 1000);
  });
});
