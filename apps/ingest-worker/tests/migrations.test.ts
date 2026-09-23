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
    const fresh = freshDatabase();
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
    expect(tableNames(handAdded)).toEqual(tableNames(freshDatabase()));
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
