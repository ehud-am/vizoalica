import type {
  AnalyticsOverview,
  Goal,
  GoalResult,
  GoalsReport
} from '../../../ingest-api/src/domain/types.js';
import type { D1Database } from '../env.js';

type Statement = ReturnType<D1Database['prepare']>;

export const MAX_GOALS_PER_WEBSITE = 20;

export interface GoalsReportRequest {
  projectId: string;
  sourceId: string;
  startUtc: string;
  endUtc: string;
  goals: Goal[];
  scope: AnalyticsOverview['scope'];
}

/**
 * The reads behind the goals report. A goal is a definition only: its conversions come from the
 * per-minute counts that reports already use (page views by path, actions, custom events), so a
 * goal also counts what happened before it was created, within retention. Visitors are the keyed
 * daily digests of those tables: a visitor who converts on two days counts on both, like every
 * other visitor figure. Page views are not kept per visitor, so a page goal has views only.
 */
export function goalsReportQueries(db: D1Database, request: GoalsReportRequest) {
  const { projectId, sourceId, startUtc, endUtc, goals } = request;
  const hourly = new Date(endUtc).getTime() - new Date(startUtc).getTime() <= 24 * 60 * 60 * 1000;
  const range = 'project_id = ? AND source_id = ? AND minute_utc >= ? AND minute_utc < ?';
  const rangeValues = [projectId, sourceId, startUtc, endUtc];
  const bucket = hourly
    ? "substr(minute_utc, 1, 13) || ':00:00.000Z'"
    : "substr(minute_utc, 1, 10) || 'T00:00:00.000Z'";
  const q = (sql: string, ...values: unknown[]) => db.prepare(sql).bind(...values);

  const statements: Statement[] = [
    q(
      `SELECT COALESCE(SUM(page_view_count), 0) AS n FROM dashboard_minute_totals WHERE ${range}`,
      ...rangeValues
    ),
    q(
      `SELECT COUNT(DISTINCT visitor_digest) AS n FROM dashboard_minute_visitors WHERE ${range}`,
      ...rangeValues
    ),
    db
      .prepare(
        'SELECT MAX(last_completed_at) AS lastCompletedAt FROM dashboard_aggregate_watermarks WHERE project_id = ? AND source_id = ?'
      )
      .bind(projectId, sourceId)
  ];
  // Each goal adds a count, a trend, and (for actions and events) a visitor count.
  const layout: Array<{ goal: Goal; at: number; withVisitors: boolean }> = [];
  for (const goal of goals) {
    const source =
      goal.kind === 'page'
        ? {
            table: 'dashboard_minute_dimensions',
            filter: "dimension_kind = 'page_path' AND dimension_value = ?",
            visitors: undefined
          }
        : goal.kind === 'action'
          ? {
              table: 'dashboard_minute_actions',
              filter: 'action_name = ?',
              visitors: 'dashboard_minute_action_visitors'
            }
          : {
              table: 'dashboard_minute_custom_events',
              filter: 'event_name = ?',
              visitors: 'dashboard_minute_custom_event_visitors'
            };
    layout.push({ goal, at: statements.length, withVisitors: !!source.visitors });
    statements.push(
      q(
        `SELECT ${bucket} AS start, SUM(event_count) AS count FROM ${source.table} WHERE ${range} AND ${source.filter} GROUP BY start ORDER BY start ASC`,
        ...rangeValues,
        goal.target
      )
    );
    if (source.visitors)
      statements.push(
        q(
          `SELECT COUNT(DISTINCT visitor_digest) AS n FROM ${source.visitors} WHERE ${range} AND ${source.filter}`,
          ...rangeValues,
          goal.target
        )
      );
  }

  const shape = (results: unknown[][]): GoalsReport => {
    const number = (index: number) => Number(((results[index] ?? [])[0] as { n?: number })?.n ?? 0);
    const pageViews = number(0);
    const visitors = number(1);
    const watermark = ((results[2] ?? [])[0] ?? {}) as { lastCompletedAt?: string | null };
    const step = hourly ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const startMs = new Date(startUtc).getTime();
    const endMs = new Date(endUtc).getTime();
    const out: GoalResult[] = layout.map(({ goal, at, withVisitors }) => {
      const counts = new Map(
        ((results[at] ?? []) as Array<{ start: string; count: number }>).map((row) => [
          row.start,
          Number(row.count)
        ])
      );
      const trend: GoalResult['trend'] = [];
      for (let time = startMs - (startMs % step); time < endMs; time += step) {
        const startOfBucket = new Date(time).toISOString();
        trend.push({ startUtc: startOfBucket, conversions: counts.get(startOfBucket) ?? 0 });
      }
      const conversions = trend.reduce((sum, point) => sum + point.conversions, 0);
      const converted = withVisitors ? number(at + 1) : null;
      const basis = converted === null ? pageViews : visitors;
      const top = converted === null ? conversions : converted;
      return {
        goal,
        conversions,
        visitors: converted,
        rate: basis > 0 ? Math.round((top / basis) * 10_000) / 10_000 : null,
        rateBasis: converted === null ? 'page_views' : 'visitors',
        trend
      };
    });
    return {
      scope: request.scope,
      range: { startUtc, endUtc, interval: hourly ? 'hour' : 'day', timezone: 'UTC' },
      totals: { pageViews, visitors },
      goals: out,
      availability: {
        state: 'complete',
        ...(watermark.lastCompletedAt ? { lastCompletedAt: watermark.lastCompletedAt } : {}),
        taxonomyVersions: [1]
      }
    };
  };
  return { statements, shape };
}
