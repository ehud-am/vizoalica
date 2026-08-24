import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { DuckDBConnection } from '@duckdb/node-api';

export interface AnalyzeEventsOptions {
  storageRoot: string;
  projectId?: string;
  date?: string;
  limit?: number;
}

export interface AnalyticsSummary {
  generated_at: string;
  parquet_glob: string;
  filters: {
    project_id?: string;
    date?: string;
  };
  overview: {
    total_events: number;
    page_views: number;
    custom_events: number;
    visitors: number;
    sessions: number;
    first_event_time: string | null;
    last_event_time: string | null;
  };
  events_by_type: Array<{ event_type: string; events: number }>;
  page_views_by_path: Array<{
    page_path: string;
    views: number;
    visitors: number;
    sessions: number;
  }>;
}

export async function analyzeEvents(options: AnalyzeEventsOptions): Promise<AnalyticsSummary> {
  const connection = await DuckDBConnection.create();
  const parquetGlob = parquetGlobFor(options);
  try {
    await createEventsView(connection, parquetGlob);
    const overview = await one<AnalyticsSummary['overview']>(
      connection,
      `
        select
          count(*)::DOUBLE as total_events,
          count_if(event_type = 'com.vizoalica.page_view.v1')::DOUBLE as page_views,
          count_if(event_type <> 'com.vizoalica.page_view.v1')::DOUBLE as custom_events,
          count(distinct anonymous_id)::DOUBLE as visitors,
          count(distinct session_id)::DOUBLE as sessions,
          min(event_time) as first_event_time,
          max(event_time) as last_event_time
        from events
      `
    );
    const limit = options.limit ?? 25;
    const eventsByType = await many<{ event_type: string; events: number }>(
      connection,
      `
        select event_type, count(*)::DOUBLE as events
        from events
        group by event_type
        order by events desc, event_type
        limit ${positiveInteger(limit)}
      `
    );
    const pageViewsByPath = await many<{
      page_path: string;
      views: number;
      visitors: number;
      sessions: number;
    }>(
      connection,
      `
        select
          coalesce(nullif(page_path, ''), '(unknown)') as page_path,
          count(*)::DOUBLE as views,
          count(distinct anonymous_id)::DOUBLE as visitors,
          count(distinct session_id)::DOUBLE as sessions
        from events
        where event_type = 'com.vizoalica.page_view.v1'
        group by 1
        order by views desc, page_path
        limit ${positiveInteger(limit)}
      `
    );

    return {
      generated_at: new Date().toISOString(),
      parquet_glob: parquetGlob,
      filters: filterSummary(options),
      overview: normalizeOverview(overview),
      events_by_type: eventsByType.map((row) => ({
        event_type: row.event_type,
        events: Number(row.events)
      })),
      page_views_by_path: pageViewsByPath.map((row) => ({
        page_path: row.page_path,
        views: Number(row.views),
        visitors: Number(row.visitors),
        sessions: Number(row.sessions)
      }))
    };
  } finally {
    connection.closeSync();
  }
}

export async function writeAnalyticsSummary(
  summary: AnalyticsSummary,
  outputPath: string
): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
}

export function parquetGlobFor(options: AnalyzeEventsOptions): string {
  const parts = [
    resolve(options.storageRoot),
    `project_id=${options.projectId ?? '*'}`,
    `dt=${options.date ?? '*'}`,
    'hour=*',
    '*.parquet'
  ];
  return parts.join(sep).replaceAll('\\', '/');
}

async function createEventsView(connection: DuckDBConnection, parquetGlob: string): Promise<void> {
  const escapedGlob = sqlString(parquetGlob);
  await connection.run(`
    create or replace view events as
    select
      schema_version,
      project_id,
      source_id,
      event_id,
      event_type,
      event_time,
      received_at,
      trust_level,
      consent_state,
      subject,
      source,
      traceparent,
      tracestate,
      data_json,
      json_extract_string(data_json, '$.page.url_path') as page_path,
      json_extract_string(data_json, '$.visitor.anonymous_id') as anonymous_id,
      json_extract_string(data_json, '$.session.id') as session_id
    from read_parquet(${escapedGlob}, union_by_name = true, hive_partitioning = false)
  `);
}

async function one<T extends Record<string, unknown>>(
  connection: DuckDBConnection,
  sql: string
): Promise<T> {
  const rows = await many<T>(connection, sql);
  const [row] = rows;
  if (!row) throw new Error('query returned no rows');
  return row;
}

async function many<T extends Record<string, unknown>>(
  connection: DuckDBConnection,
  sql: string
): Promise<T[]> {
  const reader = await connection.runAndReadAll(sql);
  return reader.getRowObjectsJson() as T[];
}

function normalizeOverview(row: AnalyticsSummary['overview']): AnalyticsSummary['overview'] {
  return {
    total_events: Number(row.total_events),
    page_views: Number(row.page_views),
    custom_events: Number(row.custom_events),
    visitors: Number(row.visitors),
    sessions: Number(row.sessions),
    first_event_time: row.first_event_time,
    last_event_time: row.last_event_time
  };
}

function filterSummary(options: AnalyzeEventsOptions): AnalyticsSummary['filters'] {
  const filters: AnalyticsSummary['filters'] = {};
  if (options.projectId) filters.project_id = options.projectId;
  if (options.date) filters.date = options.date;
  return filters;
}

function positiveInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) return 25;
  return value;
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
