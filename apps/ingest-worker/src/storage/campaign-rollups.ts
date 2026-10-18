import type {
  AnalyticsOverview,
  CampaignRanking,
  CampaignRow,
  CampaignsFilters,
  CampaignsReport,
  StoredEvent
} from '../../../ingest-api/src/domain/types.js';
import { reportableCampaign } from '../../../ingest-api/src/ingestion/privacy-guard.js';
import type { D1Database } from '../env.js';

type Statement = ReturnType<D1Database['prepare']>;

export const CAMPAIGN_RANKING_LIMIT = 20;
export const CAMPAIGN_ROW_LIMIT = 50;

/** One accepted page view that carried campaign labels, ready to be aggregated. */
export interface CampaignItem {
  projectId: string;
  sourceId: string;
  minute: string;
  /** '' means the link did not set that label. */
  source: string;
  medium: string;
  campaign: string;
  eventDigest: string;
  visitorDigest?: string;
  identityKind?: 'source-local' | 'project-supplied';
}

/**
 * The campaign labels of an accepted page view, cleaned again (ingestion already did; this is
 * defense in depth for a caller that skipped it), or undefined when it carried none.
 */
export function campaignOf(stored: StoredEvent): ReturnType<typeof reportableCampaign> {
  return reportableCampaign((stored.event.data as { campaign?: unknown } | undefined)?.campaign);
}

const placeholders = (count: number) => Array.from({ length: count }, () => '?').join(', ');

/**
 * Count and distinct-visitor statements for a batch of campaign page views. Like the other
 * rollups, they read the digests just written to `dashboard_seen_events` under this request's
 * nonce, so a replayed or retried event adds nothing.
 */
export function campaignStatements(
  db: D1Database,
  items: CampaignItem[],
  nonce: string
): Statement[] {
  type Group = { head: unknown[]; digests: string[] };
  const counts = new Map<string, Group>();
  const visitors = new Map<string, Group>();
  const add = (map: Map<string, Group>, head: unknown[], digest: string) => {
    const key = JSON.stringify(head);
    const group = map.get(key) ?? { head, digests: [] };
    group.digests.push(digest);
    map.set(key, group);
  };
  for (const item of items) {
    const head = [
      item.projectId,
      item.sourceId,
      item.minute,
      item.source,
      item.medium,
      item.campaign
    ];
    add(counts, head, item.eventDigest);
    if (item.visitorDigest && item.identityKind)
      add(visitors, [...head, item.visitorDigest, item.identityKind], item.eventDigest);
  }
  const statements: Statement[] = [];
  for (const { head, digests } of counts.values())
    statements.push(
      db
        .prepare(
          `INSERT INTO dashboard_minute_campaigns (project_id, source_id, minute_utc, utm_source, utm_medium, utm_campaign, page_view_count)
           SELECT ?, ?, ?, ?, ?, ?, COUNT(*) FROM dashboard_seen_events
           WHERE project_id = ? AND request_nonce = ? AND event_digest IN (${placeholders(digests.length)})
           HAVING COUNT(*) > 0
           ON CONFLICT(project_id, source_id, minute_utc, utm_source, utm_medium, utm_campaign) DO UPDATE SET page_view_count = page_view_count + excluded.page_view_count`
        )
        .bind(...head, head[0], nonce, ...digests)
    );
  for (const { head, digests } of visitors.values())
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO dashboard_minute_campaign_visitors (project_id, source_id, minute_utc, utm_source, utm_medium, utm_campaign, visitor_digest, identity_kind)
           SELECT ?, ?, ?, ?, ?, ?, ?, ? FROM dashboard_seen_events
           WHERE project_id = ? AND request_nonce = ? AND event_digest IN (${placeholders(digests.length)}) LIMIT 1`
        )
        .bind(...head, head[0], nonce, ...digests)
    );
  return statements;
}

export interface CampaignsReportRequest {
  projectId: string;
  sourceId: string | undefined;
  startUtc: string;
  endUtc: string;
  filters: CampaignsFilters;
  scope: AnalyticsOverview['scope'];
}

type Dimension = 'source' | 'medium' | 'campaign';
const DIMENSIONS: Dimension[] = ['source', 'medium', 'campaign'];
const column = (dimension: Dimension) => `utm_${dimension}`;

/**
 * The reads behind the campaigns report, and how to turn their results into the response. Every
 * statement is scoped by project first, and the caller runs them in one batch so the numbers come
 * from one consistent snapshot. Output is bounded whatever the volume: 20 entries per ranking and
 * 50 combinations.
 */
export function campaignsReportQueries(db: D1Database, request: CampaignsReportRequest) {
  const { projectId, sourceId, startUtc, endUtc, filters } = request;
  const hourly = new Date(endUtc).getTime() - new Date(startUtc).getTime() <= 24 * 60 * 60 * 1000;
  const scopeSql = (alias: string) =>
    sourceId
      ? `AND ${alias}source_id = ?`
      : `AND ${alias}source_id IN (SELECT id FROM sources WHERE project_id = ? AND status != 'deleted')`;
  const rangeSql = (alias = '') =>
    `${alias}project_id = ? AND ${alias}minute_utc >= ? AND ${alias}minute_utc < ? ${scopeSql(alias)}`;
  const rangeValues = () => [projectId, startUtc, endUtc, sourceId ?? projectId];
  /** Exact filters for the given dimensions, as SQL and bound values. */
  const filterSql = (dimensions: Dimension[], alias = '') => {
    const active = dimensions.filter((dimension) => filters[dimension] !== undefined);
    return {
      sql: active.map((dimension) => ` AND ${alias}${column(dimension)} = ?`).join(''),
      values: active.map((dimension) => filters[dimension])
    };
  };
  const q = (sql: string, ...values: unknown[]) => db.prepare(sql).bind(...values);
  const bucket = hourly
    ? "substr(minute_utc, 1, 13) || ':00:00.000Z'"
    : "substr(minute_utc, 1, 10) || 'T00:00:00.000Z'";

  const all = filterSql(DIMENSIONS);
  const allV = filterSql(DIMENSIONS, 'v.');
  const statements: Statement[] = [
    // 0: campaign page views of the selection
    q(
      `SELECT COALESCE(SUM(page_view_count), 0) AS n FROM dashboard_minute_campaigns WHERE ${rangeSql()}${all.sql}`,
      ...rangeValues(),
      ...all.values
    ),
    // 1: distinct visitors of the selection
    q(
      `SELECT COUNT(DISTINCT visitor_digest) AS n FROM dashboard_minute_campaign_visitors WHERE ${rangeSql()}${all.sql}`,
      ...rangeValues(),
      ...all.values
    ),
    // 2: every page view in the same range and scope, to show what share carried a campaign
    q(
      `SELECT COALESCE(SUM(page_view_count), 0) AS n FROM dashboard_minute_totals WHERE ${rangeSql()}`,
      ...rangeValues()
    ),
    // 3: trend of the selection
    q(
      `SELECT ${bucket} AS start, SUM(page_view_count) AS count
       FROM dashboard_minute_campaigns WHERE ${rangeSql()}${all.sql}
       GROUP BY start ORDER BY start ASC`,
      ...rangeValues(),
      ...all.values
    )
  ];
  // 4 to 9: for each dimension, its ranking (narrowed by the other two filters only, so choosing a
  // source still lists every source) and how much that ranking covers.
  for (const dimension of DIMENSIONS) {
    const others = filterSql(DIMENSIONS.filter((other) => other !== dimension));
    const othersV = filterSql(
      DIMENSIONS.filter((other) => other !== dimension),
      'v.'
    );
    const col = column(dimension);
    statements.push(
      q(
        `WITH a AS (
           SELECT ${col} AS label, SUM(page_view_count) AS count
           FROM dashboard_minute_campaigns WHERE ${rangeSql()}${others.sql}
           GROUP BY ${col}
           ORDER BY count DESC, label ASC
           LIMIT ${CAMPAIGN_RANKING_LIMIT}),
         people AS (
           SELECT v.${col} AS label, COUNT(DISTINCT v.visitor_digest) AS visitors
           FROM dashboard_minute_campaign_visitors v
           WHERE ${rangeSql('v.')}${othersV.sql}
             AND v.${col} IN (SELECT label FROM a)
           GROUP BY v.${col})
         SELECT a.label AS label, a.count AS count, COALESCE(people.visitors, 0) AS visitors
         FROM a LEFT JOIN people ON people.label = a.label
         ORDER BY a.count DESC, a.label ASC`,
        ...rangeValues(),
        ...others.values,
        ...rangeValues(),
        ...othersV.values
      ),
      q(
        `SELECT COALESCE(SUM(page_view_count), 0) AS n FROM dashboard_minute_campaigns WHERE ${rangeSql()}${others.sql}`,
        ...rangeValues(),
        ...others.values
      )
    );
  }
  statements.push(
    // 10: the top combinations of the selection
    q(
      `WITH a AS (
         SELECT utm_source, utm_medium, utm_campaign, SUM(page_view_count) AS count
         FROM dashboard_minute_campaigns WHERE ${rangeSql()}${all.sql}
         GROUP BY utm_source, utm_medium, utm_campaign
         ORDER BY count DESC, utm_source ASC, utm_medium ASC, utm_campaign ASC
         LIMIT ${CAMPAIGN_ROW_LIMIT}),
       people AS (
         SELECT v.utm_source, v.utm_medium, v.utm_campaign, COUNT(DISTINCT v.visitor_digest) AS visitors
         FROM dashboard_minute_campaign_visitors v
         WHERE ${rangeSql('v.')}${allV.sql}
           AND (v.utm_source, v.utm_medium, v.utm_campaign) IN (SELECT utm_source, utm_medium, utm_campaign FROM a)
         GROUP BY v.utm_source, v.utm_medium, v.utm_campaign)
       SELECT a.utm_source AS source, a.utm_medium AS medium, a.utm_campaign AS campaign,
              a.count AS count, COALESCE(people.visitors, 0) AS visitors
       FROM a LEFT JOIN people
         ON people.utm_source = a.utm_source AND people.utm_medium = a.utm_medium AND people.utm_campaign = a.utm_campaign
       ORDER BY a.count DESC, a.utm_source ASC, a.utm_medium ASC, a.utm_campaign ASC`,
      ...rangeValues(),
      ...all.values,
      ...rangeValues(),
      ...allV.values
    ),
    // 11: how many combinations the selection has
    q(
      `SELECT COUNT(*) AS n FROM (
         SELECT 1 FROM dashboard_minute_campaigns WHERE ${rangeSql()}${all.sql}
         GROUP BY utm_source, utm_medium, utm_campaign)`,
      ...rangeValues(),
      ...all.values
    ),
    // 12: identity kinds, for the scope's identity mode
    q(
      `SELECT DISTINCT identity_kind AS kind FROM dashboard_minute_campaign_visitors WHERE ${rangeSql()}`,
      ...rangeValues()
    ),
    // 13: availability and freshness
    db
      .prepare(
        `SELECT (SELECT available_from_utc FROM dashboard_campaign_availability WHERE id = 1) AS availableFromUtc,
                MAX(last_completed_at) AS lastCompletedAt
         FROM dashboard_aggregate_watermarks WHERE project_id = ?${sourceId ? ' AND source_id = ?' : ''}`
      )
      .bind(...(sourceId ? [projectId, sourceId] : [projectId]))
  );

  const shape = (results: unknown[][]): CampaignsReport => {
    const number = (index: number, key = 'n') =>
      Number(((results[index] ?? [])[0] as Record<string, unknown> | undefined)?.[key] ?? 0);
    const ranking = (itemsIndex: number): CampaignRanking => {
      const items = ((results[itemsIndex] ?? []) as Array<Record<string, unknown>>).map((row) => ({
        label: String(row.label),
        count: Number(row.count),
        visitors: Number(row.visitors)
      }));
      const shown = items.reduce((sum, entry) => sum + entry.count, 0);
      return { items, otherCount: Math.max(0, number(itemsIndex + 1) - shown) };
    };
    const counts = new Map(
      ((results[3] ?? []) as Array<{ start: string; count: number }>).map((row) => [
        row.start,
        Number(row.count)
      ])
    );
    const step = hourly ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const trend: CampaignsReport['trend'] = [];
    const startMs = new Date(startUtc).getTime();
    const endMs = new Date(endUtc).getTime();
    for (let at = startMs - (startMs % step); at < endMs; at += step) {
      const startOfBucket = new Date(at).toISOString();
      trend.push({ startUtc: startOfBucket, pageViews: counts.get(startOfBucket) ?? 0 });
    }
    const rows: CampaignRow[] = ((results[10] ?? []) as Array<Record<string, unknown>>).map(
      (row) => ({
        source: String(row.source),
        medium: String(row.medium),
        campaign: String(row.campaign),
        count: Number(row.count),
        visitors: Number(row.visitors)
      })
    );
    const total = number(0);
    const identityKinds = new Set(
      ((results[12] ?? []) as Array<{ kind: string }>).map((row) => row.kind)
    );
    const identityMode =
      identityKinds.size > 1
        ? 'mixed'
        : identityKinds.has('project-supplied')
          ? 'project-supplied'
          : 'source-local';
    const watermark = ((results[13] ?? [])[0] ?? {}) as {
      availableFromUtc?: string | null;
      lastCompletedAt?: string | null;
    };
    const incomplete = !!watermark.availableFromUtc && startUtc < watermark.availableFromUtc;
    return {
      scope: { ...request.scope, identityMode },
      range: { startUtc, endUtc, interval: hourly ? 'hour' : 'day', timezone: 'UTC' },
      totals: { pageViews: total, uniqueUsers: number(1), allPageViews: number(2) },
      trend,
      sources: ranking(4),
      mediums: ranking(6),
      campaigns: ranking(8),
      rows,
      other: {
        rows: Math.max(0, number(11) - rows.length),
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
