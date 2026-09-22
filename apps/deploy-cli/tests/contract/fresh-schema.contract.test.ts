import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { assertFreshD1Inspection, FRESH_SCHEMA_QUERY } from '../../src/fresh-schema.js';
import { ok } from '../support.js';

const migrationsDirectory = join(process.cwd(), 'deploy/cloudflare/migrations');

describe('fresh deployment schema contract', () => {
  it('starts from one complete baseline, then only additive numbered changes', async () => {
    const migrations = (await readdir(migrationsDirectory))
      .filter((name) => name.endsWith('.sql'))
      .sort();
    expect(migrations[0]).toBe('0001_initial.sql');
    const baseline = await readFile(join(migrationsDirectory, migrations[0]!), 'utf8');
    expect(baseline).not.toMatch(/ALTER\s+TABLE|DROP\s+TABLE|INSERT\s+OR\s+IGNORE\s+INTO[\s\S]+SELECT/i);

    const database = new DatabaseSync(':memory:');
    for (const name of migrations) database.exec(await readFile(join(migrationsDirectory, name), 'utf8'));
    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => String((row as { name: string }).name));
    expect(tables).toEqual(
      expect.arrayContaining([
        'administrative_audit',
        'dashboard_aggregate_watermarks',
        'dashboard_daily_users',
        'dashboard_hourly_page_views',
        'dashboard_hourly_visitors',
        'dashboard_minute_dimensions',
        'dashboard_minute_totals',
        'dashboard_minute_visitors',
        'dashboard_minute_actions',
        'dashboard_minute_action_visitors',
        'dashboard_rollups',
        'dashboard_seen_events',
        'ingestion_decisions',
        'projects',
        'quota_policies',
        'quota_windows',
        'sources',
        'access_keys'
      ])
    );
    const sourceColumns = database
      .prepare('PRAGMA table_info(sources)')
      .all()
      .map((row) => String((row as { name: string }).name));
    expect(sourceColumns).toEqual(
      expect.arrayContaining(['name', 'quota_policy_id', 'created_at', 'updated_at'])
    );
  });

  it('uses a bounded read-only inspection and accepts only a confirmed empty result', () => {
    expect(FRESH_SCHEMA_QUERY).toMatch(/^SELECT /);
    expect(FRESH_SCHEMA_QUERY).not.toMatch(/INSERT|UPDATE|DELETE|DROP|ALTER/i);
    expect(() =>
      assertFreshD1Inspection(ok(JSON.stringify([{ results: [], success: true }])))
    ).not.toThrow();
    expect(() =>
      assertFreshD1Inspection(
        ok(JSON.stringify([{ results: [{ name: 'projects' }], success: true }]))
      )
    ).toThrowError(expect.objectContaining({ code: 'existing_schema' }));
  });

  it('fails closed on unsuccessful, malformed, or unrecognized inspection output', () => {
    expect(() =>
      assertFreshD1Inspection({ exitCode: 1, stdout: '', stderr: 'failed', interrupted: false })
    ).toThrow();
    expect(() => assertFreshD1Inspection(ok('not json'))).toThrowError(
      expect.objectContaining({ code: 'schema_inspection_failed' })
    );
    expect(() =>
      assertFreshD1Inspection(ok(JSON.stringify([{ results: [], success: false }])))
    ).toThrowError(expect.objectContaining({ code: 'schema_inspection_failed' }));
  });
});
