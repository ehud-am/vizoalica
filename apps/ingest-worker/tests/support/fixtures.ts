import type { DatabaseSync } from 'node:sqlite';
import type { RequestAnalyticsContext, StoredEvent } from '../../../ingest-api/src/domain/types.js';
import { D1Repositories } from '../../src/storage/d1-repositories.js';
import { d1, freshDatabase } from './sqlite-d1.js';

export const START = '2026-01-01T00:00:00.000Z';
export const END = '2026-01-02T00:00:00.000Z';
export const AT = '2026-01-01T12:34:10.000Z';

export const context: RequestAnalyticsContext = {
  country: 'US',
  browser: 'Chrome',
  os: 'Windows',
  device: 'desktop',
  traffic: 'human',
  userAgentFamily: 'Chrome 120',
  taxonomyVersion: 1
};

/** Projects `p1` (websites `s1`, `s2`, and deleted `s3`) and `p2` (website `x1`), on the real schema. */
export function seededRepositories(): { sqlite: DatabaseSync; repositories: D1Repositories } {
  const sqlite = freshDatabase();
  sqlite.exec(`
    INSERT INTO quota_policies VALUES ('q1',1,1,1,1,1,1,1,7);
    INSERT INTO projects VALUES ('p1','One','production',7,'q1','active'), ('p2','Two','production',7,'q1','active');
    INSERT INTO sources VALUES
      ('s1','p1','Shop','k1','[]','active','q1','t','t'),
      ('s2','p1','Docs','k2','[]','active','q1','t','t'),
      ('s3','p1','Old','k3','[]','deleted','q1','t','t'),
      ('x1','p2','Other','k4','[]','active','q1','t','t');
  `);
  return { sqlite, repositories: new D1Repositories(d1(sqlite), 'test-digest-secret') };
}

export interface ActionOptions {
  page?: string;
  name?: string;
  kind?: string;
  destination?: { url_origin: string; url_path: string };
  visitor?: string;
  at?: string;
  project?: string;
  source?: string;
}

export function actionEvent(id: string, options: ActionOptions = {}): StoredEvent {
  const {
    page = '/pricing',
    name = 'Go',
    kind = 'button',
    destination,
    visitor = 'anon-1',
    at = AT,
    project = 'p1',
    source = 's1'
  } = options;
  return {
    projectId: project,
    sourceId: source,
    trustLevel: 'signed-session',
    consentState: 'analytics-granted',
    receivedAt: new Date(at),
    event: {
      id,
      type: 'com.vizoalica.action.v1',
      data: {
        page: { url_origin: 'https://example.com', url_path: page },
        action: { name, kind, ...(destination ? { destination } : {}) },
        visitor: { anonymous_id: visitor },
        session: { id: 'sess-1' }
      }
    }
  } as unknown as StoredEvent;
}

export function pageViewEvent(
  id: string,
  options: { page?: string; visitor?: string; at?: string; project?: string; source?: string } = {}
): StoredEvent {
  const { page = '/pricing', visitor = 'anon-1', at = AT, project = 'p1', source = 's1' } = options;
  return {
    projectId: project,
    sourceId: source,
    trustLevel: 'signed-session',
    consentState: 'analytics-granted',
    receivedAt: new Date(at),
    event: {
      id,
      type: 'com.vizoalica.page_view.v1',
      data: { page: { url_path: page }, visitor: { anonymous_id: visitor } }
    }
  } as unknown as StoredEvent;
}

export const rows = (sqlite: DatabaseSync, sql: string) =>
  sqlite.prepare(sql).all() as Array<Record<string, unknown>>;
export const count = (sqlite: DatabaseSync, table: string) =>
  Number((sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);
