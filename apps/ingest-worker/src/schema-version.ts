import type { D1Database } from './env.js';

/**
 * The highest numbered database change this Worker was built with. Bumped alongside a new file in
 * `deploy/cloudflare/migrations/`; a test compares it to the directory so the two cannot drift.
 */
export const EXPECTED_SCHEMA_VERSION = 2;

export type SchemaStatus = 'current' | 'behind' | 'ahead' | 'unknown';
export type SchemaInfo = {
  applied: number | null;
  expected: number;
  appliedNames: string[];
  status: SchemaStatus;
};
export type HealthStatus = { database: 'ok' | 'unavailable'; storage: 'ok' | 'unavailable' };

const NUMBER_PREFIX = /^(\d{4})_/;

/**
 * The database's applied schema version: the highest number among the names Wrangler recorded in
 * `d1_migrations`. A database with no such table (older than this feature) reports `unknown`.
 */
export async function readSchemaVersion(
  db: D1Database,
  expected = EXPECTED_SCHEMA_VERSION
): Promise<SchemaInfo> {
  let appliedNames: string[] = [];
  try {
    const result = await db
      .prepare('SELECT name FROM d1_migrations ORDER BY name')
      .all<{ name: string }>();
    appliedNames = result.results.map((row) => row.name);
  } catch {
    return { applied: null, expected, appliedNames: [], status: 'unknown' };
  }
  const numbers = appliedNames
    .map((name) => Number(NUMBER_PREFIX.exec(name)?.[1]))
    .filter((value) => Number.isInteger(value));
  if (!numbers.length) return { applied: null, expected, appliedNames, status: 'unknown' };
  const applied = Math.max(...numbers);
  const status: SchemaStatus =
    applied === expected ? 'current' : applied < expected ? 'behind' : 'ahead';
  return { applied, expected, appliedNames, status };
}

/** A cheap read of each store; each side fails independently so one outage does not hide the other. */
export async function readHealth(db: D1Database, bucket: { list: unknown }): Promise<HealthStatus> {
  const database = await db
    .prepare('SELECT 1 AS ok')
    .first()
    .then(() => 'ok' as const)
    .catch(() => 'unavailable' as const);
  const storage = await (bucket as { list: (options: { limit: number }) => Promise<unknown> })
    .list({ limit: 1 })
    .then(() => 'ok' as const)
    .catch(() => 'unavailable' as const);
  return { database, storage };
}
