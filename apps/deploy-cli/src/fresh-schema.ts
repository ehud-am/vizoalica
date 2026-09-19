import type { ProcessResult } from './types.js';
import { DeploymentFailure } from './types.js';

const VIZOALICA_SCHEMA_TABLES = [
  'd1_migrations',
  'projects',
  'sources',
  'quota_policies',
  'ingestion_decisions',
  'dashboard_rollups',
  'quota_windows',
  'administrative_audit',
  'dashboard_daily_users',
  'dashboard_hourly_page_views',
  'dashboard_hourly_visitors',
  'dashboard_minute_totals',
  'dashboard_minute_dimensions',
  'dashboard_minute_visitors',
  'dashboard_seen_events',
  'dashboard_aggregate_watermarks'
] as const;

const quotedTables = VIZOALICA_SCHEMA_TABLES.map((name) => `'${name}'`).join(', ');

export const FRESH_SCHEMA_QUERY = `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${quotedTables}) ORDER BY name`;

interface D1ResultEnvelope {
  success: boolean;
  results: unknown[];
}

function inspectionFailure(): DeploymentFailure {
  return new DeploymentFailure(
    'schema_inspection_failed',
    'Could not confirm that the D1 database is empty.',
    5,
    'review'
  );
}

function envelopes(value: unknown): D1ResultEnvelope[] {
  const values = Array.isArray(value) ? value : [value];
  if (values.length === 0) throw inspectionFailure();
  return values.map((item) => {
    if (!item || typeof item !== 'object') throw inspectionFailure();
    const record = item as Record<string, unknown>;
    if (record.success !== true || !Array.isArray(record.results)) throw inspectionFailure();
    return { success: true, results: record.results };
  });
}

export function assertFreshD1Inspection(result: ProcessResult): void {
  if (result.exitCode !== 0 || result.interrupted) throw inspectionFailure();
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw inspectionFailure();
  }
  const names = envelopes(parsed).flatMap(({ results }) =>
    results.map((item) => {
      if (
        !item ||
        typeof item !== 'object' ||
        typeof (item as { name?: unknown }).name !== 'string'
      )
        throw inspectionFailure();
      return (item as { name: string }).name;
    })
  );
  if (names.length > 0)
    throw new DeploymentFailure(
      'existing_schema',
      'The selected D1 database already contains Vizoalica schema state. This release supports fresh deployments only; select a new empty database.',
      5,
      'review'
    );
}
