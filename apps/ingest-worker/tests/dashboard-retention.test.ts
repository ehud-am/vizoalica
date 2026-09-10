import { describe, expect, it } from 'vitest';
import { D1Repositories } from '../src/storage/d1-repositories.js';
import type { D1Database, D1Statement } from '../src/env.js';

function fakeDb(options: { batchFails?: boolean } = {}) {
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
      return statements.map(() => ({ meta: { changes: 0 } }));
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
});
