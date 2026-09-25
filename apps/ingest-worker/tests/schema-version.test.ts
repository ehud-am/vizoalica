import { describe, expect, it } from 'vitest';
import { EXPECTED_SCHEMA_VERSION, readHealth, readSchemaVersion } from '../src/schema-version.js';
import { workerVersion } from '../src/version.js';
import { migrationFiles, d1, freshDatabase } from './support/sqlite-d1.js';

describe('EXPECTED_SCHEMA_VERSION', () => {
  it('is the highest migration number in the directory', () => {
    const numbers = migrationFiles().map((name) => Number(/^(\d{4})_/.exec(name)![1]));
    expect(EXPECTED_SCHEMA_VERSION).toBe(Math.max(...numbers));
  });
});

describe('readSchemaVersion', () => {
  it('is the highest number recorded in d1_migrations', async () => {
    const info = await readSchemaVersion(d1(freshDatabase()));
    expect(info).toEqual({
      applied: 2,
      expected: 2,
      appliedNames: ['0001_initial.sql', '0002_access_keys.sql'],
      status: 'current'
    });
  });

  it('is behind when fewer migrations were applied', async () => {
    const info = await readSchemaVersion(d1(freshDatabase({ upTo: 1 })));
    expect(info).toMatchObject({ applied: 1, status: 'behind' });
  });

  it('is ahead when the database has migrations this build does not know about', async () => {
    const info = await readSchemaVersion(d1(freshDatabase()), 1);
    expect(info).toMatchObject({ applied: 2, expected: 1, status: 'ahead' });
  });

  it('is unknown when there is no d1_migrations table', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec('CREATE TABLE projects (id TEXT)');
    const info = await readSchemaVersion(d1(sqlite));
    expect(info).toEqual({ applied: null, expected: 2, appliedNames: [], status: 'unknown' });
  });

  it('is unknown when the table exists but has nothing recognizable in it', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec('CREATE TABLE d1_migrations (id INTEGER, name TEXT)');
    sqlite.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run('not-a-migration');
    const info = await readSchemaVersion(d1(sqlite));
    expect(info.status).toBe('unknown');
    expect(info.applied).toBeNull();
  });
});

describe('readHealth', () => {
  it('reports ok for a working database and bucket', async () => {
    const health = await readHealth(d1(freshDatabase()), { list: async () => ({ objects: [] }) });
    expect(health).toEqual({ database: 'ok', storage: 'ok' });
  });

  it('reports each side unavailable independently', async () => {
    const workingBucket = { list: async () => ({ objects: [] }) };
    const failingBucket = {
      list: async () => {
        throw new Error('r2 down');
      }
    };
    const workingDb = d1(freshDatabase());
    const failingDb = {
      prepare: () => ({
        bind() {
          return this;
        },
        first: async () => {
          throw new Error('d1 down');
        },
        all: async () => ({ results: [] }),
        run: async () => ({ meta: {} })
      })
    };
    expect(await readHealth(failingDb as never, workingBucket)).toEqual({
      database: 'unavailable',
      storage: 'ok'
    });
    expect(await readHealth(workingDb, failingBucket)).toEqual({
      database: 'ok',
      storage: 'unavailable'
    });
  });
});

describe('workerVersion', () => {
  it('reports the deployed release, or null when unset', () => {
    expect(workerVersion({ VIZOALICA_WORKER_VERSION: '0.6.4' } as never)).toBe('0.6.4');
    expect(workerVersion({} as never)).toBeNull();
    expect(workerVersion({ VIZOALICA_WORKER_VERSION: '  ' } as never)).toBeNull();
  });
});
