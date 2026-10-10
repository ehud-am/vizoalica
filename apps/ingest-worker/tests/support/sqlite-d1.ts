import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { D1Database, D1Statement } from '../../src/env.js';

const migrations = join(process.cwd(), 'deploy/cloudflare/migrations');

export function migrationFiles(): string[] {
  return readdirSync(migrations)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
}

/**
 * An in-memory SQLite database with the real schema, applying every migration file in name order
 * (or only those up to `upTo`, to build a database stopped at an earlier release) and recording
 * each one in `d1_migrations`, the same table Wrangler keeps, so schema-version reads it for real.
 */
export function freshDatabase(options: { upTo?: number } = {}): DatabaseSync {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    'CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT)'
  );
  const insert = sqlite.prepare('INSERT INTO d1_migrations (name, applied_at) VALUES (?, ?)');
  for (const file of migrationFiles()) {
    const number = Number(/^(\d{4})_/.exec(file)?.[1]);
    if (options.upTo !== undefined && number > options.upTo) break;
    sqlite.exec(readFileSync(join(migrations, file), 'utf8'));
    insert.run(file, new Date().toISOString());
  }
  return sqlite;
}

type SqliteStatement = D1Statement & { query: string };

const isRead = (query: string) => /^\s*(SELECT|WITH)\b/i.test(query);

/**
 * Adapts SQLite to the slice of the D1 API the Worker uses. `batch` runs in one transaction, as D1
 * does, and returns rows for reads, so tests exercise real SQL: aggregation, idempotence, isolation.
 */
export function d1(sqlite: DatabaseSync): D1Database {
  const statement = (query: string): SqliteStatement => {
    let values: never[] = [];
    return {
      query,
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
  return {
    prepare: statement,
    async batch(statements) {
      const results = [];
      sqlite.exec('BEGIN');
      try {
        for (const item of statements as SqliteStatement[])
          results.push(
            isRead(item.query)
              ? { meta: { changes: 0 }, results: (await item.all()).results }
              : await item.run()
          );
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
      return results;
    }
  };
}
