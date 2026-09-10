import { describe, expect, it } from 'vitest';
import { D1Repositories } from '../src/storage/d1-repositories.js';
import type { D1Database, D1Statement } from '../src/env.js';
import type { RequestAnalyticsContext, StoredEvent } from '../../ingest-api/src/domain/types.js';

function fakeDb(options: { batchFails?: boolean } = {}) {
  const prepared: Array<{ query: string; values: unknown[] }> = [];
  const batches: Array<Array<{ query: string; values: unknown[] }>> = [];
  const makeStatement = (query: string): D1Statement => {
    let values: unknown[] = [];
    return {
      bind(...next: unknown[]) {
        values = next;
        prepared.push({ query, values });
        return this;
      },
      async run() {
        return { meta: { changes: 1 } };
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
      if (options.batchFails) throw new Error('d1_unavailable');
      batches.push(prepared.slice(-statements.length));
      for (const statement of statements) await statement.run();
      return statements.map(() => ({ meta: { changes: 1 } }));
    }
  };
  return { db, prepared, batches };
}

const context: RequestAnalyticsContext = {
  country: 'US',
  browser: 'Chrome',
  os: 'Windows',
  device: 'desktop',
  traffic: 'human',
  userAgentFamily: 'Chrome 120',
  taxonomyVersion: 1
};

function pageViewEvent(overrides: Record<string, unknown> = {}): StoredEvent {
  return {
    projectId: 'p1',
    sourceId: 's1',
    trustLevel: 'signed-session',
    consentState: 'analytics-granted',
    receivedAt: new Date('2026-01-01T12:34:00Z'),
    event: {
      id: 'evt-1',
      type: 'com.vizoalica.page_view.v1',
      data: { page: { url_path: '/docs' }, visitor: { anonymous_id: 'anon-1' } }
    },
    ...overrides
  } as unknown as StoredEvent;
}

describe('dashboard rollup writes', () => {
  it('writes minute totals, dimensions, and a visitor row only for accepted page-view events', async () => {
    const fake = fakeDb();
    const repositories = new D1Repositories(fake.db, 'digest-secret');
    await repositories.recordDashboardRollups([pageViewEvent()], context);
    expect(fake.prepared.some((call) => call.query.includes('dashboard_minute_totals'))).toBe(true);
    expect(fake.prepared.some((call) => call.query.includes('dashboard_minute_dimensions'))).toBe(
      true
    );
    expect(fake.prepared.some((call) => call.query.includes('dashboard_minute_visitors'))).toBe(
      true
    );
  });

  it('writes all eight independent dimensions for one page-view event', async () => {
    const fake = fakeDb();
    const repositories = new D1Repositories(fake.db, 'digest-secret');
    await repositories.recordDashboardRollups([pageViewEvent()], context);
    const dimensionCalls = fake.prepared.filter((call) =>
      call.query.includes('dashboard_minute_dimensions')
    );
    const kinds = new Set(dimensionCalls.map((call) => call.values[3]));
    expect(kinds).toEqual(
      new Set([
        'page_path',
        'country',
        'user_agent',
        'browser',
        'os',
        'device',
        'traffic',
        'referrer'
      ])
    );
  });

  it('does not record a non-page-view event in the minute totals or dimensions tables', async () => {
    const fake = fakeDb();
    const repositories = new D1Repositories(fake.db, 'digest-secret');
    await repositories.recordDashboardRollups(
      [pageViewEvent({ event: { id: 'evt-2', type: 'custom', data: {} } })],
      context
    );
    expect(fake.prepared.some((call) => call.query.includes('dashboard_minute_totals'))).toBe(
      false
    );
  });

  it('digests visitor identity into the source domain when no project-supplied identity is present', async () => {
    const fake = fakeDb();
    const repositories = new D1Repositories(fake.db, 'digest-secret');
    await repositories.recordDashboardRollups([pageViewEvent()], context);
    const visitorCall = fake.prepared.find((call) =>
      call.query.includes('dashboard_minute_visitors')
    );
    expect(visitorCall?.values).toContain('source-local');
  });

  it('digests visitor identity into the project domain when the token supplies a project visitor id', async () => {
    const fake = fakeDb();
    const repositories = new D1Repositories(fake.db, 'digest-secret');
    await repositories.recordDashboardRollups([pageViewEvent()], {
      ...context,
      projectVisitorId: 'project-visitor-1'
    });
    const visitorCall = fake.prepared.find((call) =>
      call.query.includes('dashboard_minute_visitors')
    );
    expect(visitorCall?.values).toContain('project-supplied');
  });

  it('produces different visitor digests for the same anonymous id under source-local vs project-supplied domains', async () => {
    const fakeSourceLocal = fakeDb();
    await new D1Repositories(fakeSourceLocal.db, 'digest-secret').recordDashboardRollups(
      [pageViewEvent()],
      context
    );
    const fakeProject = fakeDb();
    await new D1Repositories(fakeProject.db, 'digest-secret').recordDashboardRollups(
      [pageViewEvent()],
      { ...context, projectVisitorId: 'anon-1' }
    );
    const sourceLocalDigest = fakeSourceLocal.prepared.find((call) =>
      call.query.includes('dashboard_minute_visitors')
    )?.values[3];
    const projectDigest = fakeProject.prepared.find((call) =>
      call.query.includes('dashboard_minute_visitors')
    )?.values[3];
    expect(sourceLocalDigest).toBeTruthy();
    expect(projectDigest).toBeTruthy();
    expect(sourceLocalDigest).not.toBe(projectDigest);
  });

  it('creates or advances the per-source watermark to the latest minute written', async () => {
    const fake = fakeDb();
    const repositories = new D1Repositories(fake.db, 'digest-secret');
    await repositories.recordDashboardRollups(
      [
        pageViewEvent({ receivedAt: new Date('2026-01-01T12:34:00Z') }),
        pageViewEvent({
          event: {
            id: 'evt-2',
            type: 'com.vizoalica.page_view.v1',
            data: { page: { url_path: '/x' }, visitor: {} }
          },
          receivedAt: new Date('2026-01-01T13:10:00Z')
        })
      ],
      context
    );
    const watermarkCall = fake.prepared.find((call) =>
      call.query.includes('dashboard_aggregate_watermarks')
    );
    expect(watermarkCall?.values).toContain('2026-01-01T13:10:00.000Z');
  });

  it('routes every rollup write through one transactional batch', async () => {
    const fake = fakeDb();
    const repositories = new D1Repositories(fake.db, 'digest-secret');
    await repositories.recordDashboardRollups([pageViewEvent()], context);
    expect(fake.batches).toHaveLength(1);
  });

  it('propagates a batch failure so rollup writes are not silently lost', async () => {
    const fake = fakeDb({ batchFails: true });
    const repositories = new D1Repositories(fake.db, 'digest-secret');
    await expect(repositories.recordDashboardRollups([pageViewEvent()], context)).rejects.toThrow(
      'd1_unavailable'
    );
  });

  it('writes nothing when there are no page-view events to roll up', async () => {
    const fake = fakeDb();
    const repositories = new D1Repositories(fake.db, 'digest-secret');
    await repositories.recordDashboardRollups(
      [pageViewEvent({ event: { id: 'evt-3', type: 'custom', data: {} } })],
      context
    );
    expect(fake.batches).toHaveLength(0);
  });
});
