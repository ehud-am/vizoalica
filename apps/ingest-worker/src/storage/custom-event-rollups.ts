import type { CustomEventData } from '@vizoalica/event-contracts';
import type {
  AnalyticsOverview,
  CustomEventPage,
  CustomEventProperty,
  CustomEventsFilters,
  CustomEventsReport,
  CustomEventTotal,
  RequestAnalyticsContext,
  StoredEvent
} from '../../../ingest-api/src/domain/types.js';
import { reportablePropertyValue } from '../../../ingest-api/src/ingestion/privacy-guard.js';
import type { D1Database } from '../env.js';
import { visitorIdentity, type DigestFn } from './action-rollups.js';

type Statement = ReturnType<D1Database['prepare']>;

export const CUSTOM_EVENT_TYPE = 'com.vizoalica.custom_event.v1';
export const CUSTOM_EVENT_TOTAL_LIMIT = 50;
export const CUSTOM_EVENT_PAGE_LIMIT = 20;
export const CUSTOM_EVENT_PROPERTY_KEY_LIMIT = 10;
export const CUSTOM_EVENT_PROPERTY_VALUE_LIMIT = 10;
/** Properties stored per event, and the longest stored value. */
const STORED_PROPERTIES = 10;
const STORED_VALUE_LENGTH = 64;

/** One accepted custom event, ready to be aggregated. */
export interface CustomEventItem {
  projectId: string;
  sourceId: string;
  receivedAt: Date;
  minute: string;
  page: string;
  name: string;
  eventDigest: string;
  visitorDigest?: string;
  identityKind?: 'source-local' | 'project-supplied';
  properties: Array<[key: string, value: string]>;
}

/**
 * Text and true/false values only, redacted like action names and cut short. Numbers are left
 * out: they are rarely worth grouping, and each distinct one would add a row.
 */
function storedProperties(properties: CustomEventData['properties']): Array<[string, string]> {
  const stored: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(properties ?? {})) {
    if (stored.length >= STORED_PROPERTIES) break;
    const text =
      typeof value === 'string'
        ? reportablePropertyValue(value, STORED_VALUE_LENGTH)
        : typeof value === 'boolean'
          ? String(value)
          : '';
    if (key && text) stored.push([key, text]);
  }
  return stored;
}

/**
 * Turns an accepted custom event into an aggregate item. Returns undefined for anything that is
 * not well formed (ingestion already validated it, so this is defense in depth).
 */
export async function expandCustomEvent(
  stored: StoredEvent,
  digest: DigestFn,
  context?: RequestAnalyticsContext
): Promise<CustomEventItem | undefined> {
  const event = stored.event as {
    id?: unknown;
    data?: Partial<CustomEventData> & { page?: { url_path?: unknown } };
  };
  const data = event.data;
  const name = data?.name;
  if (typeof event.id !== 'string' || !event.id || typeof name !== 'string' || !name)
    return undefined;
  const page = typeof data?.page?.url_path === 'string' ? data.page.url_path : '';
  const { visitorDigest, identityKind } = await visitorIdentity(
    stored,
    digest,
    data?.visitor?.anonymous_id,
    context
  );
  return {
    projectId: stored.projectId,
    sourceId: stored.sourceId,
    receivedAt: stored.receivedAt,
    minute: `${stored.receivedAt.toISOString().slice(0, 16)}:00.000Z`,
    page,
    name,
    eventDigest: await digest('event-v1', stored.projectId, event.id),
    properties: storedProperties(data?.properties),
    ...(visitorDigest ? { visitorDigest, identityKind } : {})
  };
}

const placeholders = (count: number) => Array.from({ length: count }, () => '?').join(', ');

/**
 * Count, distinct-visitor and property-value statements for a batch of custom events. Like the
 * action and page-view rollups, they read the digests just written to `dashboard_seen_events`
 * under this request's nonce, so a replayed or retried event adds nothing.
 */
export function customEventStatements(
  db: D1Database,
  items: CustomEventItem[],
  nonce: string
): Statement[] {
  type Group = { head: unknown[]; digests: string[] };
  const counts = new Map<string, Group>();
  const visitors = new Map<string, Group>();
  const properties = new Map<string, Group>();
  const add = (map: Map<string, Group>, head: unknown[], digest: string) => {
    const key = JSON.stringify(head);
    const group = map.get(key) ?? { head, digests: [] };
    group.digests.push(digest);
    map.set(key, group);
  };
  for (const item of items) {
    const base = [item.projectId, item.sourceId, item.minute];
    add(counts, [...base, item.page, item.name], item.eventDigest);
    if (item.visitorDigest && item.identityKind)
      add(
        visitors,
        [...base, item.page, item.name, item.visitorDigest, item.identityKind],
        item.eventDigest
      );
    for (const [key, value] of item.properties)
      add(properties, [...base, item.name, key, value], item.eventDigest);
  }
  const statements: Statement[] = [];
  for (const { head, digests } of counts.values())
    statements.push(
      db
        .prepare(
          `INSERT INTO dashboard_minute_custom_events (project_id, source_id, minute_utc, page_path, event_name, event_count)
           SELECT ?, ?, ?, ?, ?, COUNT(*) FROM dashboard_seen_events
           WHERE project_id = ? AND request_nonce = ? AND event_digest IN (${placeholders(digests.length)})
           HAVING COUNT(*) > 0
           ON CONFLICT(project_id, source_id, minute_utc, page_path, event_name) DO UPDATE SET event_count = event_count + excluded.event_count`
        )
        .bind(...head, head[0], nonce, ...digests)
    );
  for (const { head, digests } of visitors.values())
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO dashboard_minute_custom_event_visitors (project_id, source_id, minute_utc, page_path, event_name, visitor_digest, identity_kind)
           SELECT ?, ?, ?, ?, ?, ?, ? FROM dashboard_seen_events
           WHERE project_id = ? AND request_nonce = ? AND event_digest IN (${placeholders(digests.length)}) LIMIT 1`
        )
        .bind(...head, head[0], nonce, ...digests)
    );
  for (const { head, digests } of properties.values())
    statements.push(
      db
        .prepare(
          `INSERT INTO dashboard_minute_custom_event_properties (project_id, source_id, minute_utc, event_name, property_key, property_value, event_count)
           SELECT ?, ?, ?, ?, ?, ?, COUNT(*) FROM dashboard_seen_events
           WHERE project_id = ? AND request_nonce = ? AND event_digest IN (${placeholders(digests.length)})
           HAVING COUNT(*) > 0
           ON CONFLICT(project_id, source_id, minute_utc, event_name, property_key, property_value) DO UPDATE SET event_count = event_count + excluded.event_count`
        )
        .bind(...head, head[0], nonce, ...digests)
    );
  return statements;
}

export interface CustomEventsReportRequest {
  projectId: string;
  sourceId: string | undefined;
  startUtc: string;
  endUtc: string;
  filters: CustomEventsFilters;
  scope: AnalyticsOverview['scope'];
}

type Count = { n?: number };

/**
 * The reads behind the custom events report, and how to turn their results into the response.
 * Every statement is scoped by project first, and the caller runs them in one batch so the numbers
 * come from one consistent snapshot. Output is bounded whatever the volume: 50 events, 20 pages,
 * and 10 values for each of 10 property keys.
 */
export function customEventsReportQueries(db: D1Database, request: CustomEventsReportRequest) {
  const { projectId, sourceId, startUtc, endUtc, filters } = request;
  const hourly = new Date(endUtc).getTime() - new Date(startUtc).getTime() <= 24 * 60 * 60 * 1000;
  const scopeSql = (alias: string) =>
    sourceId
      ? `AND ${alias}source_id = ?`
      : `AND ${alias}source_id IN (SELECT id FROM sources WHERE project_id = ? AND status != 'deleted')`;
  const rangeSql = (alias = '') =>
    `${alias}project_id = ? AND ${alias}minute_utc >= ? AND ${alias}minute_utc < ? ${scopeSql(alias)}`;
  const rangeValues = () => [projectId, startUtc, endUtc, sourceId ?? projectId];
  const eventSql = (alias = '') =>
    filters.event !== undefined ? ` AND ${alias}event_name = ?` : '';
  const pageSql = (alias = '') => (filters.page !== undefined ? ` AND ${alias}page_path = ?` : '');
  const eventValues = filters.event !== undefined ? [filters.event] : [];
  const pageValues = filters.page !== undefined ? [filters.page] : [];
  const q = (sql: string, ...values: unknown[]) => db.prepare(sql).bind(...values);
  const bucket = hourly
    ? "substr(minute_utc, 1, 13) || ':00:00.000Z'"
    : "substr(minute_utc, 1, 10) || 'T00:00:00.000Z'";

  const statements: Statement[] = [
    // 0: both filters, for the totals and the trend
    q(
      `SELECT COALESCE(SUM(event_count), 0) AS n FROM dashboard_minute_custom_events WHERE ${rangeSql()}${eventSql()}${pageSql()}`,
      ...rangeValues(),
      ...eventValues,
      ...pageValues
    ),
    q(
      `SELECT COUNT(DISTINCT visitor_digest) AS n FROM dashboard_minute_custom_event_visitors WHERE ${rangeSql()}${eventSql()}${pageSql()}`,
      ...rangeValues(),
      ...eventValues,
      ...pageValues
    ),
    // 2: the events list, narrowed by page only so a page shows all of its events
    q(
      `WITH a AS (
         SELECT event_name, SUM(event_count) AS count,
                COUNT(DISTINCT CASE WHEN page_path != '' THEN page_path END) AS pages
         FROM dashboard_minute_custom_events WHERE ${rangeSql()}${pageSql()}
         GROUP BY event_name
         ORDER BY count DESC, event_name ASC
         LIMIT ${CUSTOM_EVENT_TOTAL_LIMIT}),
       people AS (
         SELECT v.event_name, COUNT(DISTINCT v.visitor_digest) AS visitors
         FROM dashboard_minute_custom_event_visitors v
         WHERE ${rangeSql('v.')}${pageSql('v.')}
           AND v.event_name IN (SELECT event_name FROM a)
         GROUP BY v.event_name)
       SELECT a.event_name AS event, a.count AS count, a.pages AS pages,
              COALESCE(people.visitors, 0) AS visitors
       FROM a LEFT JOIN people ON people.event_name = a.event_name
       ORDER BY a.count DESC, a.event_name ASC`,
      ...rangeValues(),
      ...pageValues,
      ...rangeValues(),
      ...pageValues
    ),
    // 3: how much the events list covers
    q(
      `SELECT COALESCE(SUM(event_count), 0) AS n, COUNT(DISTINCT event_name) AS names
       FROM dashboard_minute_custom_events WHERE ${rangeSql()}${pageSql()}`,
      ...rangeValues(),
      ...pageValues
    ),
    // 4: trend of the selection
    q(
      `SELECT ${bucket} AS start, SUM(event_count) AS count
       FROM dashboard_minute_custom_events WHERE ${rangeSql()}${eventSql()}${pageSql()}
       GROUP BY start ORDER BY start ASC`,
      ...rangeValues(),
      ...eventValues,
      ...pageValues
    ),
    // 5: top pages of the selected event
    q(
      `WITH top AS (
         SELECT page_path, SUM(event_count) AS count
         FROM dashboard_minute_custom_events WHERE ${rangeSql()}${eventSql()} AND page_path != ''
         GROUP BY page_path
         ORDER BY count DESC, page_path ASC
         LIMIT ${CUSTOM_EVENT_PAGE_LIMIT}),
       people AS (
         SELECT v.page_path, COUNT(DISTINCT v.visitor_digest) AS visitors
         FROM dashboard_minute_custom_event_visitors v
         WHERE ${rangeSql('v.')}${eventSql('v.')}
           AND v.page_path IN (SELECT page_path FROM top)
         GROUP BY v.page_path)
       SELECT t.page_path AS page, t.count AS count, COALESCE(people.visitors, 0) AS visitors
       FROM top t LEFT JOIN people ON people.page_path = t.page_path
       ORDER BY t.count DESC, t.page_path ASC`,
      ...rangeValues(),
      ...eventValues,
      ...rangeValues(),
      ...eventValues
    ),
    // 6: events of the selection sent without a page
    q(
      `SELECT COALESCE(SUM(event_count), 0) AS n FROM dashboard_minute_custom_events
       WHERE ${rangeSql()}${eventSql()} AND page_path = ''`,
      ...rangeValues(),
      ...eventValues
    ),
    q(
      `SELECT DISTINCT identity_kind AS kind FROM dashboard_minute_custom_event_visitors WHERE ${rangeSql()}`,
      ...rangeValues()
    ),
    db
      .prepare(
        `SELECT (SELECT available_from_utc FROM dashboard_custom_event_availability WHERE id = 1) AS availableFromUtc,
                MAX(last_completed_at) AS lastCompletedAt
         FROM dashboard_aggregate_watermarks WHERE project_id = ?${sourceId ? ' AND source_id = ?' : ''}`
      )
      .bind(...(sourceId ? [projectId, sourceId] : [projectId]))
  ];
  // 9: property values, only for one event
  if (filters.event !== undefined)
    statements.push(
      q(
        `WITH g AS (
           SELECT property_key AS k, property_value AS v, SUM(event_count) AS c
           FROM dashboard_minute_custom_event_properties
           WHERE ${rangeSql()} AND event_name = ?
           GROUP BY property_key, property_value),
         keys AS (
           SELECT k, SUM(c) AS total FROM g GROUP BY k
           ORDER BY total DESC, k ASC LIMIT ${CUSTOM_EVENT_PROPERTY_KEY_LIMIT}),
         ranked AS (
           SELECT g.k, g.v, g.c, keys.total,
                  ROW_NUMBER() OVER (PARTITION BY g.k ORDER BY g.c DESC, g.v ASC) AS rank
           FROM g JOIN keys ON keys.k = g.k)
         SELECT k, v, c FROM ranked WHERE rank <= ${CUSTOM_EVENT_PROPERTY_VALUE_LIMIT}
         ORDER BY total DESC, k ASC, c DESC, v ASC`,
        ...rangeValues(),
        filters.event
      )
    );

  const shape = (results: unknown[][]): CustomEventsReport => {
    const first = (index: number) => ((results[index] ?? [])[0] ?? {}) as Count;
    const events: CustomEventTotal[] = ((results[2] ?? []) as Array<Record<string, unknown>>).map(
      (row) => ({
        event: String(row.event),
        count: Number(row.count),
        visitors: Number(row.visitors),
        pages: Number(row.pages)
      })
    );
    const coverage = first(3) as { n?: number; names?: number };
    const shown = events.reduce((sum, entry) => sum + entry.count, 0);
    const counts = new Map(
      ((results[4] ?? []) as Array<{ start: string; count: number }>).map((row) => [
        row.start,
        Number(row.count)
      ])
    );
    const step = hourly ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const trend: CustomEventsReport['trend'] = [];
    const startMs = new Date(startUtc).getTime();
    const endMs = new Date(endUtc).getTime();
    for (let at = startMs - (startMs % step); at < endMs; at += step) {
      const startOfBucket = new Date(at).toISOString();
      trend.push({ startUtc: startOfBucket, count: counts.get(startOfBucket) ?? 0 });
    }
    const pages: CustomEventPage[] = ((results[5] ?? []) as Array<Record<string, unknown>>).map(
      (row) => ({
        page: String(row.page),
        count: Number(row.count),
        visitors: Number(row.visitors)
      })
    );
    const properties: CustomEventProperty[] = [];
    for (const row of (results[9] ?? []) as Array<{ k: string; v: string; c: number }>) {
      let entry = properties[properties.length - 1];
      if (!entry || entry.key !== row.k) {
        entry = { key: row.k, values: [] };
        properties.push(entry);
      }
      entry.values.push({ value: row.v, count: Number(row.c) });
    }
    const identityKinds = new Set(
      ((results[7] ?? []) as Array<{ kind: string }>).map((row) => row.kind)
    );
    const identityMode =
      identityKinds.size > 1
        ? 'mixed'
        : identityKinds.has('project-supplied')
          ? 'project-supplied'
          : 'source-local';
    const watermark = ((results[8] ?? [])[0] ?? {}) as {
      availableFromUtc?: string | null;
      lastCompletedAt?: string | null;
    };
    const incomplete = !!watermark.availableFromUtc && startUtc < watermark.availableFromUtc;
    return {
      scope: { ...request.scope, identityMode },
      range: {
        startUtc,
        endUtc,
        interval: hourly ? 'hour' : 'day',
        timezone: 'UTC'
      },
      totals: { events: Number(first(0).n ?? 0), uniqueUsers: Number(first(1).n ?? 0) },
      events,
      other: {
        events: Math.max(0, Number(coverage.names ?? 0) - events.length),
        count: Math.max(0, Number(coverage.n ?? 0) - shown)
      },
      trend,
      pages,
      withoutPage: Number(first(6).n ?? 0),
      properties,
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
