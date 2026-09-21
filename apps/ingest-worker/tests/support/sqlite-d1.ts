import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { D1Database, D1Statement } from '../../src/env.js';

const migrations = join(process.cwd(), 'deploy/cloudflare/migrations');

/** An in-memory SQLite database with the real schema (every migration file, in name order). */
export function freshDatabase(): DatabaseSync {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync(migrations)
    .filter((name) => name.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(join(migrations, file), 'utf8'));
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
