import type {
  ActionsFilters,
  AnalyticsOverview,
  RageClickRow,
  RageClicksReport
} from '../../../ingest-api/src/domain/types.js';
import type { D1Database } from '../env.js';
import type { ActionItem } from './action-rollups.js';

type Statement = ReturnType<D1Database['prepare']>;

export const RAGE_ROW_LIMIT = 50;

const placeholders = (count: number) => Array.from({ length: count }, () => '?').join(', ');

/**
 * Burst counts for a batch of rage click signals. Like the other rollups they read the digests just
 * written to `dashboard_seen_events` under this request's nonce, so a replayed or retried event
 * adds nothing. No visitor digest is kept: a burst is a count, not a person.
 */
export function rageStatements(db: D1Database, items: ActionItem[], nonce: string): Statement[] {
  const groups = new Map<string, { item: ActionItem; digests: string[] }>();
  for (const item of items) {
    const key = JSON.stringify([
      item.projectId,
      item.sourceId,
      item.minute,
      item.page,
      item.name,
      item.kind,
      item.destination
    ]);
    const group = groups.get(key) ?? { item, digests: [] };
    group.digests.push(item.eventDigest);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ item, digests }) =>
    db
      .prepare(
        `INSERT INTO dashboard_minute_rage_clicks (project_id, source_id, minute_utc, page_path, action_name, action_kind, destination, burst_count)
         SELECT ?, ?, ?, ?, ?, ?, ?, COUNT(*) FROM dashboard_seen_events
         WHERE project_id = ? AND request_nonce = ? AND event_digest IN (${placeholders(digests.length)})
         HAVING COUNT(*) > 0
         ON CONFLICT(project_id, source_id, minute_utc, page_path, action_name, action_kind, destination) DO UPDATE SET burst_count = burst_count + excluded.burst_count`
      )
      .bind(
        item.projectId,
        item.sourceId,
        item.minute,
        item.page,
        item.name,
        item.kind,
        item.destination,
        item.projectId,
        nonce,
        ...digests
      )
  );
}

export interface RageReportRequest {
  projectId: string;
  sourceId: string | undefined;
  startUtc: string;
  endUtc: string;
  filters: ActionsFilters;
  scope: AnalyticsOverview['scope'];
}

/**
 * The reads behind the rage clicks report and how to shape their results. Every statement is
 * scoped by project first and runs in one batch. Output is bounded: at most 50 controls with an
 * exact remainder, whatever the volume.
 */
export function rageReportQueries(db: D1Database, request: RageReportRequest) {
  const { projectId, sourceId, startUtc, endUtc, filters } = request;
  const hourly = new Date(endUtc).getTime() - new Date(startUtc).getTime() <= 24 * 60 * 60 * 1000;
  const scopeSql = (alias: string) =>
    sourceId
      ? `AND ${alias}source_id = ?`
      : `AND ${alias}source_id IN (SELECT id FROM sources WHERE project_id = ? AND status != 'deleted')`;
  const rangeSql = (alias = '') =>
    `${alias}project_id = ? AND ${alias}minute_utc >= ? AND ${alias}minute_utc < ? ${scopeSql(alias)}`;
  const rangeValues = () => [projectId, startUtc, endUtc, sourceId ?? projectId];
  const filterSql =
    (filters.page !== undefined ? ' AND page_path = ?' : '') +
    (filters.action !== undefined ? ' AND action_name = ?' : '');
  const filterValues = [filters.page, filters.action].filter((value) => value !== undefined);
  const q = (sql: string, ...values: unknown[]) => db.prepare(sql).bind(...values);
  const bucket = hourly
    ? "substr(minute_utc, 1, 13) || ':00:00.000Z'"
    : "substr(minute_utc, 1, 10) || 'T00:00:00.000Z'";

  const statements: Statement[] = [
    // 0: bursts of the selection
    q(
      `SELECT COALESCE(SUM(burst_count), 0) AS n FROM dashboard_minute_rage_clicks WHERE ${rangeSql()}${filterSql}`,
      ...rangeValues(),
      ...filterValues
    ),
    // 1: every click in the same range and selection, to show a rate
    q(
      `SELECT COALESCE(SUM(event_count), 0) AS n FROM dashboard_minute_actions WHERE ${rangeSql()}${filterSql}`,
      ...rangeValues(),
      ...filterValues
    ),
    // 2: trend
    q(
      `SELECT ${bucket} AS start, SUM(burst_count) AS count
       FROM dashboard_minute_rage_clicks WHERE ${rangeSql()}${filterSql}
       GROUP BY start ORDER BY start ASC`,
      ...rangeValues(),
      ...filterValues
    ),
    // 3: controls, with their own click totals
    q(
      `WITH r AS (
         SELECT page_path, action_name, action_kind, destination, SUM(burst_count) AS bursts
         FROM dashboard_minute_rage_clicks WHERE ${rangeSql()}${filterSql}
         GROUP BY page_path, action_name, action_kind, destination
         ORDER BY bursts DESC, page_path ASC, action_name ASC, action_kind ASC, destination ASC
         LIMIT ${RAGE_ROW_LIMIT})
       SELECT r.page_path AS page, r.action_name AS action, r.action_kind AS kind, r.destination AS destination,
              r.bursts AS count,
              COALESCE((SELECT SUM(a.event_count) FROM dashboard_minute_actions a
                        WHERE ${rangeSql('a.')} AND a.page_path = r.page_path AND a.action_name = r.action_name
                          AND a.action_kind = r.action_kind AND a.destination = r.destination), 0) AS clicks
       FROM r
       ORDER BY r.bursts DESC, r.page_path ASC, r.action_name ASC, r.action_kind ASC, r.destination ASC`,
      ...rangeValues(),
      ...filterValues,
      ...rangeValues()
    ),
    // 4: how many controls there are in all
    q(
      `SELECT COUNT(*) AS n FROM (
         SELECT 1 FROM dashboard_minute_rage_clicks WHERE ${rangeSql()}${filterSql}
         GROUP BY page_path, action_name, action_kind, destination)`,
      ...rangeValues(),
      ...filterValues
    ),
    // 5: availability and freshness
    db
      .prepare(
        `SELECT (SELECT available_from_utc FROM dashboard_rage_click_availability WHERE id = 1) AS availableFromUtc,
                MAX(last_completed_at) AS lastCompletedAt
         FROM dashboard_aggregate_watermarks WHERE project_id = ?${sourceId ? ' AND source_id = ?' : ''}`
      )
      .bind(...(sourceId ? [projectId, sourceId] : [projectId]))
  ];

  const shape = (results: unknown[][]): RageClicksReport => {
    const number = (index: number) =>
      Number(((results[index] ?? [])[0] as Record<string, unknown> | undefined)?.n ?? 0);
    const counts = new Map(
      ((results[2] ?? []) as Array<{ start: string; count: number }>).map((row) => [
        row.start,
        Number(row.count)
      ])
    );
    const step = hourly ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const trend: RageClicksReport['trend'] = [];
    const startMs = new Date(startUtc).getTime();
    const endMs = new Date(endUtc).getTime();
    for (let at = startMs - (startMs % step); at < endMs; at += step) {
      const startOfBucket = new Date(at).toISOString();
      trend.push({ startUtc: startOfBucket, bursts: counts.get(startOfBucket) ?? 0 });
    }
    const rows: RageClickRow[] = ((results[3] ?? []) as Array<Record<string, unknown>>).map(
      (row) => ({
        page: String(row.page),
        action: String(row.action),
        kind: row.kind as RageClickRow['kind'],
        ...(row.destination ? { destination: String(row.destination) } : {}),
        count: Number(row.count),
        clicks: Number(row.clicks)
      })
    );
    const total = number(0);
    const watermark = ((results[5] ?? [])[0] ?? {}) as {
      availableFromUtc?: string | null;
      lastCompletedAt?: string | null;
    };
    const incomplete = !!watermark.availableFromUtc && startUtc < watermark.availableFromUtc;
    return {
      scope: { ...request.scope, identityMode: 'source-local' },
      range: { startUtc, endUtc, interval: hourly ? 'hour' : 'day', timezone: 'UTC' },
      totals: { bursts: total, clicks: number(1) },
      trend,
      rows,
      other: {
        rows: Math.max(0, number(4) - rows.length),
        count: Math.max(0, total - rows.reduce((sum, row) => sum + row.count, 0))
      },
      availability: {
        state: incomplete ? 'incomplete' : 'complete',
        ...(watermark.lastCompletedAt ? { lastCompletedAt: watermark.lastCompletedAt } : {}),
        ...(incomplete && watermark.availableFromUtc
          ? { availableFromUtc: watermark.availableFromUtc }
          : {}),
        taxonomyVersions: [1]
      }
    };
  };
  return { statements, shape };
}
