import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { checkAdditivity, checkNumbering, isAdditiveOnly } from '../src/migrations-check.js';
import { freshDatabase, migrationFiles } from './support/sqlite-d1.js';

const migrationsDir = join(process.cwd(), 'deploy/cloudflare/migrations');
const files = migrationFiles();
const contents = files.map((name) => ({
  name,
  number: Number(/^(\d{4})_/.exec(name)![1]),
  sql: readFileSync(join(migrationsDir, name), 'utf8')
}));

function tableNames(sqlite: DatabaseSync): string[] {
  return (
    sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' AND name != 'd1_migrations' ORDER BY name"
      )
      .all() as Array<{ name: string }>
  ).map((row) => row.name);
}

function columnList(sqlite: DatabaseSync, table: string): string[] {
  return (sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (row) => row.name
  );
}

describe('migration file names', () => {
  it('are numbered contiguously from 0001, with no gaps or repeats', () => {
    expect(checkNumbering(files)).toEqual([]);
  });

  it('are lowercase, snake-cased descriptions', () => {
    for (const name of files) expect(name).toMatch(/^\d{4}_[a-z][a-z0-9_]*\.sql$/);
  });

  it('reports a malformed name and a gap in the numbering', () => {
    expect(checkNumbering(['not_a_migration.sql'])).toEqual([
      'not_a_migration.sql: must be named NNNN_description.sql'
    ]);
    expect(checkNumbering(['0001_initial.sql', '0003_skipped.sql'])).toEqual([
      'expected migration 2, found 3'
    ]);
  });
});

describe('additivity', () => {
  it('only recognizes DROP, RENAME, DELETE, and UPDATE as non-additive, and the marker as an escape hatch', () => {
    expect(isAdditiveOnly('CREATE TABLE t (id TEXT);')).toBe(true);
    expect(isAdditiveOnly('CREATE INDEX i ON t(id);')).toBe(true);
    expect(isAdditiveOnly('ALTER TABLE t ADD COLUMN c TEXT;')).toBe(true);
    expect(isAdditiveOnly("INSERT OR IGNORE INTO t (id) VALUES ('x');")).toBe(true);
    expect(isAdditiveOnly('-- a table we used to DROP\nCREATE TABLE t (id TEXT);')).toBe(true);
    for (const sql of [
      'DROP TABLE t;',
      'ALTER TABLE t RENAME TO u;',
      'DELETE FROM t;',
      'UPDATE t SET x = 1;'
    ])
      expect(isAdditiveOnly(sql), sql).toBe(false);
  });

  it('accepts a non-additive statement only when annotated', () => {
    expect(isAdditiveOnly('DROP TABLE t;\n-- vizoalica:non-additive')).toBe(true);
  });

  it('requires every migration after 0001 to be additive, unless annotated', () => {
    expect(checkAdditivity(contents)).toEqual([]);
    const withDrop = [...contents, { name: '0003_bad.sql', number: 3, sql: 'DROP TABLE t;' }];
    expect(checkAdditivity(withDrop)).toEqual([
      '0003_bad.sql: contains a non-additive statement with no "-- vizoalica:non-additive" annotation'
    ]);
    const annotated = [
      ...contents,
      { name: '0003_ok.sql', number: 3, sql: 'DROP TABLE t;\n-- vizoalica:non-additive' }
    ];
    expect(checkAdditivity(annotated)).toEqual([]);
  });

  it('never flags 0001, whatever it contains', () => {
    expect(
      checkAdditivity([{ name: '0001_initial.sql', number: 1, sql: 'DROP TABLE anything;' }])
    ).toEqual([]);
  });
});

describe('applying the real migrations', () => {
  it('0001 then 0002 on an empty database gives the same schema as fresh reaches today', () => {
    const sqlite = freshDatabase();
    expect(tableNames(sqlite)).toContain('access_keys');
    expect(columnList(sqlite, 'administrative_audit')).toContain('actor');
    expect(columnList(sqlite, 'dashboard_minute_actions')).toContain('event_count');
  });

  it('0002 on a 0.5.2 database (no hand-added tables) reaches the identical schema', () => {
    const fixture = new DatabaseSync(':memory:');
    fixture.exec(
      readFileSync(
        join(process.cwd(), 'apps/ingest-worker/tests/fixtures/schema-0.5.2.sql'),
        'utf8'
      )
    );
    fixture.exec(readFileSync(join(migrationsDir, '0002_access_keys.sql'), 'utf8'));
    const fresh = freshDatabase({ upTo: 2 });
    expect(tableNames(fixture)).toEqual(tableNames(fresh));
    for (const table of [
      'dashboard_minute_actions',
      'dashboard_minute_action_visitors',
      'access_keys'
    ])
      expect(columnList(fixture, table)).toEqual(columnList(fresh, table));
  });

  it('a database with the action tables already added by hand adopts 0002 without error or duplicates', () => {
    const handAdded = new DatabaseSync(':memory:');
    handAdded.exec(readFileSync(join(migrationsDir, '0001_initial.sql'), 'utf8'));
    // 0001 already has these tables (they were folded in at 0.6.0); a live 0.6.x database is the
    // same shape as this, which is exactly what "already has them" means for 0002's IF NOT EXISTS.
    expect(() =>
      handAdded.exec(readFileSync(join(migrationsDir, '0002_access_keys.sql'), 'utf8'))
    ).not.toThrow();
    expect(tableNames(handAdded)).toEqual(tableNames(freshDatabase({ upTo: 2 })));
  });

  it('0003 on a schema-2 database keeps every existing website token-only and adds the salts table', () => {
    const sqlite = freshDatabase({ upTo: 2 });
    sqlite.exec(
      "INSERT INTO sources (id, project_id, name, public_source_key, allowed_origins_json, status, quota_policy_id, created_at, updated_at) VALUES ('s1','p1','Site','k1','[]','active',NULL,'t','t')"
    );
    sqlite.exec(readFileSync(join(migrationsDir, '0003_static_sites_daily_visitors.sql'), 'utf8'));
    expect(sqlite.prepare('SELECT token_required FROM sources').get()).toEqual({
      token_required: 1
    });
    expect(tableNames(sqlite)).toEqual(tableNames(freshDatabase({ upTo: 3 })));
    expect(() => sqlite.exec('UPDATE sources SET token_required = 2')).toThrow();
  });

  it('0004 adds the custom event tables and records when reporting began, changing nothing else', () => {
    const sqlite = freshDatabase({ upTo: 3 });
    const before = tableNames(sqlite);
    sqlite.exec(readFileSync(join(migrationsDir, '0004_custom_event_reports.sql'), 'utf8'));
    expect(tableNames(sqlite).filter((name) => !before.includes(name))).toEqual([
      'dashboard_custom_event_availability',
      'dashboard_minute_custom_event_properties',
      'dashboard_minute_custom_event_visitors',
      'dashboard_minute_custom_events'
    ]);
    expect(
      sqlite
        .prepare('SELECT available_from_utc AS at FROM dashboard_custom_event_availability')
        .get()
    ).toEqual({ at: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:00\.000Z$/) });
    expect(() =>
      sqlite.exec("INSERT INTO dashboard_custom_event_availability VALUES (2, 'x')")
    ).toThrow();
  });

  it('0005 adds the campaign tables and records when reporting began, changing nothing else', () => {
    const sqlite = freshDatabase({ upTo: 4 });
    const before = tableNames(sqlite);
    sqlite.exec(readFileSync(join(migrationsDir, '0005_campaign_reports.sql'), 'utf8'));
    expect(tableNames(sqlite).filter((name) => !before.includes(name))).toEqual([
      'dashboard_campaign_availability',
      'dashboard_minute_campaign_visitors',
      'dashboard_minute_campaigns'
    ]);
    expect(
      sqlite.prepare('SELECT available_from_utc AS at FROM dashboard_campaign_availability').get()
    ).toEqual({ at: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:00\.000Z$/) });
    expect(() =>
      sqlite.exec("INSERT INTO dashboard_campaign_availability VALUES (2, 'x')")
    ).toThrow();
    expect(() =>
      sqlite.exec("INSERT INTO dashboard_minute_campaigns VALUES ('p','s','m','a','b','c',-1)")
    ).toThrow();
  });

  it('0006 adds the exclusion list with an empty default, keeping every website counting everything', () => {
    const sqlite = freshDatabase({ upTo: 5 });
    sqlite.exec(
      "INSERT INTO sources (id, project_id, name, public_source_key, allowed_origins_json, status, quota_policy_id, created_at, updated_at) VALUES ('s1','p1','Site','k1','[]','active',NULL,'t','t')"
    );
    const before = tableNames(sqlite);
    sqlite.exec(readFileSync(join(migrationsDir, '0006_internal_traffic_exclusion.sql'), 'utf8'));
    expect(sqlite.prepare('SELECT excluded_addresses_json AS list FROM sources').get()).toEqual({
      list: '[]'
    });
    expect(tableNames(sqlite).filter((name) => !before.includes(name))).toEqual([
      'dashboard_excluded_hits'
    ]);
    expect(() =>
      sqlite.exec("INSERT INTO dashboard_excluded_hits VALUES ('p','s','2026-01-01',-1)")
    ).toThrow();
  });

  it('0007 adds the rage click tables only, starts availability now, and refuses a negative count', () => {
    const sqlite = freshDatabase({ upTo: 6 });
    const before = tableNames(sqlite);
    sqlite.exec(readFileSync(join(migrationsDir, '0007_rage_click_reports.sql'), 'utf8'));
    expect(tableNames(sqlite).filter((name) => !before.includes(name))).toEqual([
      'dashboard_minute_rage_clicks',
      'dashboard_rage_click_availability'
    ]);
    expect(
      sqlite.prepare('SELECT available_from_utc AS at FROM dashboard_rage_click_availability').get()
    ).toEqual({ at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/) });
    expect(() =>
      sqlite.exec(
        "INSERT INTO dashboard_minute_rage_clicks VALUES ('p','s','m','/','a','button','',-1)"
      )
    ).toThrow();
    // No visitor column: a burst is a count, not a person.
    expect(columnList(sqlite, 'dashboard_minute_rage_clicks')).not.toContain('visitor_digest');
  });

  it('upgrades a real 0.5.2 database through every later migration to the same schema as a new install', () => {
    const upgraded = new DatabaseSync(':memory:');
    upgraded.exec(
      readFileSync(
        join(process.cwd(), 'apps/ingest-worker/tests/fixtures/schema-0.5.2.sql'),
        'utf8'
      )
    );
    for (const { number, sql } of contents) if (number >= 2) upgraded.exec(sql);
    const fresh = freshDatabase();
    expect(tableNames(upgraded)).toEqual(tableNames(fresh));
    for (const table of tableNames(fresh).filter((name) => !name.includes('_idx')))
      expect(columnList(upgraded, table), table).toEqual(columnList(fresh, table));
  });

  it('upgrades a populated 0.10.0 database with 0005 and 0006, keeping every row and setting safe defaults', () => {
    const sqlite = freshDatabase({ upTo: 4 });
    sqlite.exec(`
      INSERT INTO quota_policies VALUES ('q1',1,1,1,1,1,1,1,7);
      INSERT INTO projects VALUES ('p1','One','production',7,'q1','active');
      INSERT INTO sources (id, project_id, name, public_source_key, allowed_origins_json, status, quota_policy_id, created_at, updated_at) VALUES ('s1','p1','Shop','k1','["https://shop.test"]','active','q1','t','t');
      INSERT INTO dashboard_minute_custom_events VALUES ('p1','s1','2026-01-01T00:00:00.000Z','/','signup',3);
      INSERT INTO dashboard_minute_totals VALUES ('p1','s1','2026-01-01T00:00:00.000Z',9);
    `);
    for (const { number, sql } of contents) if (number >= 5) sqlite.exec(sql);
    expect(
      sqlite
        .prepare('SELECT excluded_addresses_json AS list, token_required AS t FROM sources')
        .get()
    ).toEqual({
      list: '[]',
      t: 1
    });
    expect(
      sqlite.prepare('SELECT event_count AS n FROM dashboard_minute_custom_events').get()
    ).toEqual({ n: 3 });
    expect(
      sqlite.prepare('SELECT page_view_count AS n FROM dashboard_minute_totals').get()
    ).toEqual({ n: 9 });
    expect(tableNames(sqlite)).toEqual(tableNames(freshDatabase()));
  });

  it('0002 refuses to be applied twice by the CREATE TABLE (without IF NOT EXISTS) for access_keys', () => {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(readFileSync(join(migrationsDir, '0001_initial.sql'), 'utf8'));
    sqlite.exec(readFileSync(join(migrationsDir, '0002_access_keys.sql'), 'utf8'));
    expect(() =>
      sqlite.exec(readFileSync(join(migrationsDir, '0002_access_keys.sql'), 'utf8'))
    ).toThrow();
  });
});
