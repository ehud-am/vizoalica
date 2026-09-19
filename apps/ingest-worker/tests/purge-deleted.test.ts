import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { handleAdminRequest } from '../src/http/admin-adapter.js';
import type { D1Database, D1Statement, R2Bucket } from '../src/env.js';
import { D1Repositories } from '../src/storage/d1-repositories.js';
import { purgeDeleted } from '../src/storage/purge-deleted.js';

const schema = readFileSync(
  join(process.cwd(), 'deploy/cloudflare/migrations/0001_initial.sql'),
  'utf8'
);

function d1(sqlite: DatabaseSync): D1Database {
  const statement = (query: string): D1Statement => {
    let values: never[] = [];
    return {
      bind(...next: unknown[]) {
        values = next as never[];
        return this;
      },
      async run() {
        return { meta: { changes: Number(sqlite.prepare(query).run(...values).changes) } };
      },
      async all<T>() {
        return { results: sqlite.prepare(query).all(...values) as T[] };
      },
      async first<T>() {
        return (sqlite.prepare(query).get(...values) ?? null) as T | null;
      }
    };
  };
  return { prepare: statement };
}

function bucket(keys: string[]): R2Bucket & { keys: string[] } {
  return {
    keys,
    async put() {},
    async list({ prefix = '', limit = 1000 }) {
      const matching = keys.filter((key) => key.startsWith(prefix)).slice(0, limit);
      return { objects: matching.map((key) => ({ key })), truncated: false };
    },
    async delete(remove) {
      for (const key of [remove].flat()) keys.splice(keys.indexOf(key), 1);
    }
  };
}

const TABLES = [
  'dashboard_rollups',
  'dashboard_daily_users',
  'dashboard_hourly_page_views',
  'dashboard_hourly_visitors',
  'dashboard_minute_totals',
  'dashboard_minute_dimensions',
  'dashboard_minute_visitors',
  'dashboard_aggregate_watermarks',
  'quota_windows',
  'ingestion_decisions',
  'administrative_audit'
];

/** Live project `live` with sites `keep` and `gone` (deleted); deleted project `dead` with `dead-site`. */
function seed() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(schema);
  sqlite.exec(`
    INSERT INTO quota_policies VALUES ('q-live',1,1,1,1,1,1,1,7), ('q-dead',1,1,1,1,1,1,1,7);
    INSERT INTO projects VALUES ('live','Live','production',7,'q-live','active'),
                                ('dead','Dead','production',7,'q-dead','deleted');
    INSERT INTO sources VALUES
      ('keep','live','Keep','k1','[]','active',NULL,'t','t'),
      ('gone','live','Gone','k2','[]','deleted',NULL,'t','t'),
      ('dead-site','dead','Dead site','k3','[]','deleted',NULL,'t','t');
    INSERT INTO dashboard_seen_events VALUES ('live','d1','t',NULL,1), ('dead','d2','t',NULL,1);
  `);
  for (const [project, source] of [
    ['live', 'keep'],
    ['live', 'gone'],
    ['dead', 'dead-site']
  ] as const) {
    sqlite.exec(`
      INSERT INTO dashboard_rollups VALUES ('${project}','${source}','2026-01-01','e','/',1);
      INSERT INTO dashboard_daily_users VALUES ('${project}','${source}','2026-01-01',1);
      INSERT INTO dashboard_hourly_page_views VALUES ('${project}','${source}','h',1);
      INSERT INTO dashboard_hourly_visitors VALUES ('${project}','${source}','h','v');
      INSERT INTO dashboard_minute_totals VALUES ('${project}','${source}','m',1);
      INSERT INTO dashboard_minute_dimensions VALUES ('${project}','${source}','m','country','US',1,1);
      INSERT INTO dashboard_minute_visitors VALUES ('${project}','${source}','m','v',1,'source-local');
      INSERT INTO dashboard_aggregate_watermarks VALUES ('${project}','${source}','t','t',1);
      INSERT INTO quota_windows VALUES ('${project}','${source}','day','d',1,1);
      INSERT INTO ingestion_decisions (project_id, source_id, decision, accepted_count, rejected_count, reason_codes_json, received_at) VALUES ('${project}','${source}','accepted',1,0,'[]','t');
      INSERT INTO administrative_audit (occurred_at, operation, outcome, project_id, source_id, reason_code) VALUES ('t','update_source','allowed','${project}','${source}','ok');
    `);
  }
  sqlite.exec(`
    INSERT INTO administrative_audit (occurred_at, operation, outcome, project_id, reason_code) VALUES ('t','delete_project','allowed','dead','deleted'), ('t','create_project','allowed','live','created');
  `);
  return sqlite;
}

const count = (sqlite: DatabaseSync, sql: string) =>
  Number((sqlite.prepare(sql).get() as { n: number }).n);

describe('purging soft-deleted websites and projects', () => {
  it('reports what would go without deleting anything on a dry run', async () => {
    const sqlite = seed();
    const objects = bucket(['events/live/gone/2026/a.json', 'events/dead/dead-site/2026/b.json']);
    const summary = await purgeDeleted({
      repositories: new D1Repositories(d1(sqlite)),
      bucket: objects,
      dryRun: true
    });
    expect(summary).toMatchObject({ dryRun: true, complete: true, objects: 2 });
    expect(summary.rows).toMatchObject({ sources: 2, projects: 1, quota_policies: 1 });
    expect(summary.rows.dashboard_rollups).toBe(2);
    expect(objects.keys).toHaveLength(2);
    expect(count(sqlite, 'SELECT COUNT(*) AS n FROM sources')).toBe(3);
  });

  it('removes every row and object of deleted websites and projects, and only those', async () => {
    const sqlite = seed();
    const objects = bucket([
      'events/live/keep/2026/keep.json',
      'events/live/gone/2026/a.json',
      'events/dead/dead-site/2026/b.json',
      'events/dead/orphan-site/2026/c.json'
    ]);
    const summary = await purgeDeleted({
      repositories: new D1Repositories(d1(sqlite)),
      bucket: objects,
      dryRun: false
    });
    expect(summary).toMatchObject({ dryRun: false, complete: true, objects: 3 });
    expect(objects.keys).toEqual(['events/live/keep/2026/keep.json']);

    for (const table of TABLES)
      expect(
        count(
          sqlite,
          `SELECT COUNT(*) AS n FROM ${table} WHERE source_id IN ('gone','dead-site') OR project_id = 'dead'`
        ),
        table
      ).toBe(0);
    expect(count(sqlite, "SELECT COUNT(*) AS n FROM sources WHERE id != 'keep'")).toBe(0);
    expect(count(sqlite, "SELECT COUNT(*) AS n FROM projects WHERE id = 'dead'")).toBe(0);
    expect(count(sqlite, "SELECT COUNT(*) AS n FROM quota_policies WHERE id = 'q-dead'")).toBe(0);
    expect(
      count(sqlite, "SELECT COUNT(*) AS n FROM dashboard_seen_events WHERE project_id = 'dead'")
    ).toBe(0);

    // The live project and its live website keep everything.
    for (const table of TABLES.filter((name) => name !== 'administrative_audit'))
      expect(
        count(sqlite, `SELECT COUNT(*) AS n FROM ${table} WHERE source_id = 'keep'`),
        table
      ).toBe(1);
    expect(count(sqlite, "SELECT COUNT(*) AS n FROM projects WHERE id = 'live'")).toBe(1);
    expect(count(sqlite, "SELECT COUNT(*) AS n FROM quota_policies WHERE id = 'q-live'")).toBe(1);
    expect(
      count(sqlite, "SELECT COUNT(*) AS n FROM dashboard_seen_events WHERE project_id = 'live'")
    ).toBe(1);
    expect(
      count(sqlite, "SELECT COUNT(*) AS n FROM administrative_audit WHERE project_id = 'live'")
    ).toBe(2);

    // Nothing left to purge.
    expect(
      await purgeDeleted({
        repositories: new D1Repositories(d1(sqlite)),
        bucket: objects,
        dryRun: true
      })
    ).toMatchObject({ complete: true, objects: 0 });
  });

  it('keeps identifying rows until every object is gone, then finishes on a rerun', async () => {
    const sqlite = seed();
    const objects = bucket(['events/live/gone/2026/a.json', 'events/dead/dead-site/2026/b.json']);
    const repositories = new D1Repositories(d1(sqlite));

    const partial = await purgeDeleted({
      repositories,
      bucket: objects,
      dryRun: false,
      operationBudget: 4
    });
    expect(partial.complete).toBe(false);
    expect(count(sqlite, 'SELECT COUNT(*) AS n FROM sources')).toBe(3);

    const rest = await purgeDeleted({ repositories, bucket: objects, dryRun: false });
    expect(rest.complete).toBe(true);
    expect(objects.keys).toEqual([]);
    expect(count(sqlite, 'SELECT COUNT(*) AS n FROM sources')).toBe(1);
  });

  it('resumes across runs when the statement budget ends mid-purge', async () => {
    const sqlite = seed();
    const repositories = new D1Repositories(d1(sqlite));
    const first = await repositories.purgeDeletedRows({ remaining: 3 });
    expect(first.complete).toBe(false);
    expect((await repositories.purgeDeletedRows({ remaining: 100 })).complete).toBe(true);
    expect(count(sqlite, "SELECT COUNT(*) AS n FROM sources WHERE id != 'keep'")).toBe(0);
  });
});

describe('POST /v1/admin/purge-deleted', () => {
  const call = async (body: unknown, purge?: (dryRun: boolean) => Promise<never>) => {
    const audits: unknown[] = [];
    const response = await handleAdminRequest(
      new Request('https://worker.test/v1/admin/purge-deleted', {
        method: 'POST',
        headers: { authorization: 'Bearer admin-secret' },
        body: JSON.stringify(body)
      }),
      {
        adminSecret: 'admin-secret',
        repositories: {
          saveAdminAudit: async (entry: unknown) => void audits.push(entry)
        } as never,
        ...(purge ? { purgeDeleted: purge } : {})
      }
    );
    return { response: response!, audits };
  };
  const summary = { dryRun: false, complete: true, rows: {}, objects: 0 } as never;

  it('requires an explicit dryRun so it can never delete by default', async () => {
    const purge = async () => summary;
    for (const body of [{}, { dryRun: 'false' }, null])
      expect((await call(body, purge)).response.status).toBe(400);
  });

  it('records an audit entry that names no project or website', async () => {
    const { response, audits } = await call({ dryRun: false }, async () => summary);
    expect(response.status).toBe(200);
    expect(audits).toEqual([
      { operation: 'purge_deleted', outcome: 'allowed', reasonCode: 'purged' }
    ]);
  });

  it('is absent when the worker has no purge wired', async () => {
    expect((await call({ dryRun: true })).response.status).toBe(404);
  });
});

describe('daily scheduled purge', () => {
  const run = (sqlite: DatabaseSync, objects: R2Bucket) =>
    worker.scheduled(
      {},
      {
        VIZOALICA_DB: d1(sqlite),
        VIZOALICA_EVENTS: objects,
        VIZOALICA_TOKEN_SECRET: 'test-secret',
        VIZOALICA_ADMIN_SECRET: 'admin-secret',
        VIZOALICA_ANALYTICS_DIGEST_SECRET: 'analytics-digest-secret'
      }
    );
  const purgeAudits = (sqlite: DatabaseSync) =>
    count(
      sqlite,
      "SELECT COUNT(*) AS n FROM administrative_audit WHERE operation = 'purge_deleted'"
    );

  it('removes deleted websites and projects and records one id-free audit entry', async () => {
    const sqlite = seed();
    const objects = bucket(['events/live/gone/2026/a.json', 'events/live/keep/2026/k.json']);
    await run(sqlite, objects);
    expect(objects.keys).toEqual(['events/live/keep/2026/k.json']);
    expect(count(sqlite, "SELECT COUNT(*) AS n FROM sources WHERE id != 'keep'")).toBe(0);
    expect(count(sqlite, "SELECT COUNT(*) AS n FROM projects WHERE id = 'dead'")).toBe(0);
    expect(purgeAudits(sqlite)).toBe(1);
    expect(
      count(
        sqlite,
        "SELECT COUNT(*) AS n FROM administrative_audit WHERE operation = 'purge_deleted' AND project_id IS NULL AND source_id IS NULL"
      )
    ).toBe(1);
  });

  it('stays silent when there is nothing to purge', async () => {
    const sqlite = seed();
    const objects = bucket([]);
    await run(sqlite, objects);
    await run(sqlite, objects);
    expect(purgeAudits(sqlite)).toBe(1);
  });
});
