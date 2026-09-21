import type { ActionData } from '@vizoalica/event-contracts';
import type {
  ActionKindName,
  ActionReportRow,
  ActionsFilters,
  ActionsReport,
  ActionTotal,
  AnalyticsOverview,
  RequestAnalyticsContext,
  StoredEvent
} from '../../../ingest-api/src/domain/types.js';
import type { D1Database } from '../env.js';

type Statement = ReturnType<D1Database['prepare']>;
export type DigestFn = (...parts: string[]) => Promise<string>;

const KINDS = new Set<string>(['button', 'link', 'other']);
export const ACTION_EVENT_TYPE = 'com.vizoalica.action.v1';
export const ACTION_ROW_LIMIT = 100;
export const ACTION_TOTAL_LIMIT = 50;

/** One accepted action event, ready to be aggregated. */
export interface ActionItem {
  projectId: string;
  sourceId: string;
  receivedAt: Date;
  minute: string;
  page: string;
  name: string;
  kind: ActionKindName;
  destination: string;
  eventDigest: string;
  visitorDigest?: string;
  identityKind?: 'source-local' | 'project-supplied';
}

const keyOf = (item: ActionItem) =>
  [
    item.projectId,
    item.sourceId,
    item.minute,
    item.page,
    item.name,
    item.kind,
    item.destination
  ] as const;

/**
 * Turns an accepted action event into an aggregate item. Returns undefined for anything that is
 * not a well-formed action (ingestion already validated it, so this is defense in depth).
 */
export async function expandActionEvent(
  stored: StoredEvent,
  digest: DigestFn,
  context?: RequestAnalyticsContext
): Promise<ActionItem | undefined> {
  const event = stored.event as { id?: unknown; data?: Partial<ActionData> };
  const data = event.data;
  const name = data?.action?.name;
  const kind = data?.action?.kind;
  const page = data?.page?.url_path;
  if (
    typeof event.id !== 'string' ||
    !event.id ||
    typeof name !== 'string' ||
    !name ||
    typeof page !== 'string' ||
    typeof kind !== 'string' ||
    !KINDS.has(kind)
  )
    return undefined;
  const target = data?.action?.destination;
  const destination =
    target && typeof target.url_origin === 'string' && typeof target.url_path === 'string'
      ? `${target.url_origin}${target.url_path}`
      : '';

  // The same keyed identity page views use, so "visitors" means the same thing everywhere.
  const visitorId = data?.visitor?.anonymous_id;
  const identity = context?.projectVisitorId ?? visitorId;
  const identityKind = context?.projectVisitorId ? 'project-supplied' : 'source-local';
  const visitorDigest =
    typeof identity === 'string' && identity
      ? await digest(
          ...[
            identityKind === 'project-supplied' ? 'project-v1' : 'source-v1',
            stored.projectId,
            identityKind === 'source-local' ? stored.sourceId : undefined,
            identity
          ].filter((part): part is string => part !== undefined)
        )
      : undefined;

  return {
    projectId: stored.projectId,
    sourceId: stored.sourceId,
    receivedAt: stored.receivedAt,
    minute: `${stored.receivedAt.toISOString().slice(0, 16)}:00.000Z`,
    page,
    name,
    kind: kind as ActionKindName,
    destination,
    eventDigest: await digest('event-v1', stored.projectId, event.id),
    ...(visitorDigest ? { visitorDigest, identityKind } : {})
  };
}

const placeholders = (count: number) => Array.from({ length: count }, () => '?').join(', ');

/**
 * Count and distinct-visitor statements for a batch of action items. Like the page-view rollups,
 * they read the digests just written to `dashboard_seen_events` under this request's nonce, so a
 * replayed or retried event that was already seen adds nothing.
 */
export function actionStatements(db: D1Database, items: ActionItem[], nonce: string): Statement[] {
  const counts = new Map<string, { item: ActionItem; digests: string[] }>();
  const visitors = new Map<string, { item: ActionItem; digests: string[] }>();
  for (const item of items) {
    const countKey = JSON.stringify(keyOf(item));
    const group = counts.get(countKey) ?? { item, digests: [] };
    group.digests.push(item.eventDigest);
    counts.set(countKey, group);
    if (item.visitorDigest && item.identityKind) {
      const visitorKey = JSON.stringify([...keyOf(item), item.visitorDigest, item.identityKind]);
      const visitor = visitors.get(visitorKey) ?? { item, digests: [] };
      visitor.digests.push(item.eventDigest);
      visitors.set(visitorKey, visitor);
    }
  }
  const statements: Statement[] = [];
  for (const { item, digests } of counts.values())
    statements.push(
      db
        .prepare(
          `INSERT INTO dashboard_minute_actions (project_id, source_id, minute_utc, page_path, action_name, action_kind, destination, event_count)
           SELECT ?, ?, ?, ?, ?, ?, ?, COUNT(*) FROM dashboard_seen_events
           WHERE project_id = ? AND request_nonce = ? AND event_digest IN (${placeholders(digests.length)})
           HAVING COUNT(*) > 0
           ON CONFLICT(project_id, source_id, minute_utc, page_path, action_name, action_kind, destination) DO UPDATE SET event_count = event_count + excluded.event_count`
        )
        .bind(...keyOf(item), item.projectId, nonce, ...digests)
    );
  for (const { item, digests } of visitors.values())
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO dashboard_minute_action_visitors (project_id, source_id, minute_utc, page_path, action_name, action_kind, destination, visitor_digest, identity_kind)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? FROM dashboard_seen_events
           WHERE project_id = ? AND request_nonce = ? AND event_digest IN (${placeholders(digests.length)}) LIMIT 1`
        )
        .bind(
          ...keyOf(item),
          item.visitorDigest,
          item.identityKind,
          item.projectId,
          nonce,
          ...digests
        )
    );
  return statements;
}

export interface ActionsReportRequest {
  projectId: string;
  sourceId: string | undefined;
  startUtc: string;
  endUtc: string;
  filters: ActionsFilters;
  scope: AnalyticsOverview['scope'];
}

type Count = { n?: number };

/**
 * The reads behind the actions report, and how to turn their results into the response. Every
 * statement is scoped by project first, and the caller runs them in one batch so the numbers come
 * from one consistent snapshot. Output is bounded: at most 100 grouped rows and 50 per-action
 * totals, with an exact remainder, whatever the volume.
 */
export function actionsReportQueries(db: D1Database, request: ActionsReportRequest) {
  const { projectId, sourceId, startUtc, endUtc, filters } = request;
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
  const actionOnlySql = filters.action !== undefined ? ' AND action_name = ?' : '';
  const actionOnlyValues = filters.action !== undefined ? [filters.action] : [];
  const q = (sql: string, ...values: unknown[]) => db.prepare(sql).bind(...values);

  const statements: Statement[] = [
    q(
      `SELECT COALESCE(SUM(event_count), 0) AS n FROM dashboard_minute_actions WHERE ${rangeSql()}${filterSql}`,
      ...rangeValues(),
      ...filterValues
    ),
    q(
      `SELECT COUNT(DISTINCT visitor_digest) AS n FROM dashboard_minute_action_visitors WHERE ${rangeSql()}${filterSql}`,
      ...rangeValues(),
      ...filterValues
    ),
    q(
      `SELECT COUNT(*) AS n FROM (SELECT 1 FROM dashboard_minute_actions WHERE ${rangeSql()}${filterSql}
         GROUP BY page_path, action_name, action_kind, destination)`,
      ...rangeValues(),
      ...filterValues
    ),
    q(
      `WITH top AS (
         SELECT page_path, action_name, action_kind, destination, SUM(event_count) AS count
         FROM dashboard_minute_actions WHERE ${rangeSql()}${filterSql}
         GROUP BY page_path, action_name, action_kind, destination
         ORDER BY count DESC, page_path ASC, action_name ASC, action_kind ASC, destination ASC
         LIMIT ${ACTION_ROW_LIMIT})
       SELECT t.page_path AS page, t.action_name AS action, t.action_kind AS kind,
              t.destination AS destination, t.count AS count,
              (SELECT COUNT(DISTINCT v.visitor_digest) FROM dashboard_minute_action_visitors v
                WHERE ${rangeSql('v.')} AND v.page_path = t.page_path AND v.action_name = t.action_name
                  AND v.action_kind = t.action_kind AND v.destination = t.destination) AS visitors,
              (SELECT COALESCE(SUM(d.event_count), 0) FROM dashboard_minute_dimensions d
                WHERE ${rangeSql('d.')} AND d.dimension_kind = 'page_path' AND d.dimension_value = t.page_path) AS pageViews
       FROM top t
       ORDER BY t.count DESC, t.page_path ASC, t.action_name ASC, t.action_kind ASC, t.destination ASC`,
      ...rangeValues(),
      ...filterValues,
      ...rangeValues(),
      ...rangeValues()
    ),
    q(
      `WITH a AS (
         SELECT action_name, action_kind, SUM(event_count) AS count, COUNT(DISTINCT page_path) AS pages
         FROM dashboard_minute_actions WHERE ${rangeSql()}${actionOnlySql}
         GROUP BY action_name, action_kind
         ORDER BY count DESC, action_name ASC, action_kind ASC
         LIMIT ${ACTION_TOTAL_LIMIT})
       SELECT a.action_name AS action, a.action_kind AS kind, a.count AS count, a.pages AS pages,
              (SELECT COUNT(DISTINCT v.visitor_digest) FROM dashboard_minute_action_visitors v
                WHERE ${rangeSql('v.')} AND v.action_name = a.action_name AND v.action_kind = a.action_kind) AS visitors
       FROM a ORDER BY a.count DESC, a.action_name ASC, a.action_kind ASC`,
      ...rangeValues(),
      ...actionOnlyValues,
      ...rangeValues()
    ),
    q(
      `SELECT DISTINCT identity_kind AS kind FROM dashboard_minute_action_visitors WHERE ${rangeSql()}`,
      ...rangeValues()
    ),
    db
      .prepare(
        `SELECT MAX(expanded_from_utc) AS availableFromUtc, MAX(last_completed_at) AS lastCompletedAt
         FROM dashboard_aggregate_watermarks WHERE project_id = ?${sourceId ? ' AND source_id = ?' : ''}`
      )
      .bind(...(sourceId ? [projectId, sourceId] : [projectId]))
  ];
  if (filters.page !== undefined)
    statements.push(
      q(
        `SELECT COALESCE(SUM(event_count), 0) AS n FROM dashboard_minute_dimensions
         WHERE ${rangeSql()} AND dimension_kind = 'page_path' AND dimension_value = ?`,
        ...rangeValues(),
        filters.page
      ),
      q(
        `SELECT COALESCE(SUM(event_count), 0) AS n FROM dashboard_minute_actions WHERE ${rangeSql()} AND page_path = ?`,
        ...rangeValues(),
        filters.page
      )
    );

  const shape = (results: unknown[][]): ActionsReport => {
    const first = (index: number) => ((results[index] ?? [])[0] ?? {}) as Count;
    const totalActions = Number(first(0).n ?? 0);
    const groups = Number(first(2).n ?? 0);
    const rows: ActionReportRow[] = ((results[3] ?? []) as Array<Record<string, unknown>>).map(
      (row) => ({
        page: String(row.page),
        action: String(row.action),
        kind: row.kind as ActionKindName,
        ...(row.destination ? { destination: String(row.destination) } : {}),
        count: Number(row.count),
        visitors: Number(row.visitors),
        pageViews: Number(row.pageViews)
      })
    );
    const actions: ActionTotal[] = ((results[4] ?? []) as Array<Record<string, unknown>>).map(
      (row) => ({
        action: String(row.action),
        kind: row.kind as ActionKindName,
        count: Number(row.count),
        visitors: Number(row.visitors),
        pages: Number(row.pages)
      })
    );
    const identityKinds = new Set(
      ((results[5] ?? []) as Array<{ kind: string }>).map((row) => row.kind)
    );
    const identityMode =
      identityKinds.size > 1
        ? 'mixed'
        : identityKinds.has('project-supplied')
          ? 'project-supplied'
          : 'source-local';
    const watermark = ((results[6] ?? [])[0] ?? {}) as {
      availableFromUtc?: string;
      lastCompletedAt?: string;
    };
    const incomplete = !!watermark.availableFromUtc && startUtc < watermark.availableFromUtc;
    const duration = new Date(endUtc).getTime() - new Date(startUtc).getTime();
    const shown = rows.reduce((sum, row) => sum + row.count, 0);
    return {
      scope: { ...request.scope, identityMode },
      range: {
        startUtc,
        endUtc,
        interval: duration <= 24 * 60 * 60 * 1000 ? 'hour' : 'day',
        timezone: 'UTC'
      },
      totals: { actions: totalActions, uniqueUsers: Number(first(1).n ?? 0) },
      rows,
      other: { rows: Math.max(0, groups - rows.length), count: Math.max(0, totalActions - shown) },
      actions,
      ...(filters.page !== undefined
        ? {
            selection: {
              page: {
                path: filters.page,
                views: Number(first(7).n ?? 0),
                actions: Number(first(8).n ?? 0)
              }
            }
          }
        : {}),
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
