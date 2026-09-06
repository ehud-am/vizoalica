import { describe, expect, it } from 'vitest';
import { D1Repositories } from '../src/storage/d1-repositories.js';
import type { D1Database, D1Statement } from '../src/env.js';

type Call = { query: string; values: unknown[] };
function database(calls: Call[]): D1Database {
  return {
    prepare(query: string): D1Statement {
      let values: unknown[] = [];
      return {
        bind(...next: unknown[]) {
          values = next;
          calls.push({ query, values });
          return this;
        },
        async run() {
          return { meta: { changes: 1 } };
        },
        async all() {
          return { results: [] };
        },
        async first<T>() {
          if (query.includes('SELECT id FROM sources')) return { id: 'source-a' } as T;
          if (query.includes('SUM(page_view_count)')) return { pageViews: 3 } as T;
          if (query.includes('COUNT(DISTINCT visitor_digest)')) return { uniqueUsers: 2 } as T;
          return null;
        }
      };
    }
  };
}

describe('hourly unique-user analytics', () => {
  it('persists only a non-reversible digest and returns only an aggregate count', async () => {
    const calls: Call[] = [];
    const repositories = new D1Repositories(database(calls));
    const event = (visitor: string) => ({
      projectId: 'project-a',
      sourceId: 'source-a',
      trustLevel: 'signed-session' as const,
      consentState: 'analytics-granted' as const,
      receivedAt: new Date('2026-09-05T12:00:00Z'),
      event: { type: 'com.vizoalica.page_view.v1', data: { visitor: { anonymous_id: visitor } } }
    });
    await repositories.recordDashboardRollups([
      event('visitor-one'),
      event('visitor-one'),
      event('visitor-two')
    ] as never);
    const inserts = calls.filter(({ query }) => query.includes('dashboard_hourly_visitors'));
    expect(inserts).toHaveLength(3);
    expect(inserts.every(({ query }) => query.includes('INSERT OR IGNORE'))).toBe(true);
    expect(inserts.flatMap(({ values }) => values)).not.toContain('visitor-one');
    const summary = await repositories.getAnalyticsSummary(
      'project-a',
      'source-a',
      '24h',
      new Date('2026-09-05T13:00:00Z')
    );
    expect(summary).toMatchObject({ pageViews: 3, uniqueUsers: 2 });
    expect(JSON.stringify(summary)).not.toContain('visitor');
  });
});
