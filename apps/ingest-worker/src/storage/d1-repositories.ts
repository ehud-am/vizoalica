import type {
  AdminAuditEntry,
  IngestionDecision,
  PageViewCounts,
  Project,
  QuotaPolicy,
  Source,
  AnalyticsSummary,
  AnalyticsOverview,
  AnalyticsDimensionKind,
  RequestAnalyticsContext,
  RankedResult,
  DistributionResult
} from '../../../ingest-api/src/domain/types.js';
import type {
  IngestionDecisionRepository,
  AdminRepository,
  ProjectRepository
} from '../../../ingest-api/src/storage/repositories.js';
import type { D1Database } from '../env.js';
import type { StoredEvent } from '../../../ingest-api/src/domain/types.js';
import type { QuotaReservation } from '../../../ingest-api/src/storage/repositories.js';

type ProjectRow = {
  id: string;
  name: string;
  mode: Project['mode'];
  default_retention_days: number;
  quota_policy_id: string;
  status: Project['status'];
};
type SourceRow = {
  id: string;
  project_id: string;
  name: string;
  public_source_key: string;
  allowed_origins_json: string;
  status: Source['status'];
  quota_policy_id?: string | null;
  created_at?: string;
  updated_at?: string;
};
type QuotaRow = {
  id: string;
  max_request_bytes: number;
  max_events_per_batch: number;
  max_events_per_token: number;
  max_events_per_second: number;
  max_events_per_day: number;
  max_property_count: number;
  max_property_value_length: number;
  retention_days: number;
};

async function hmacDigest(digestKey: string, ...parts: string[]): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(digestKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(parts.join('\0')));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join(
    ''
  );
}

// Rows returned per overview ranking; see `ranked` in the analytics overview query.
const COUNTRY_RANKING_LIMIT = 300;
const RANKING_LIMIT = 100;
const RETENTION_BATCH_ROWS = 1000;
const RETENTION_MAX_PASSES = 200;

// Physical purge of soft-deleted websites and projects. A website is purgeable when it is deleted
// itself or belongs to a deleted project; a project only when it is deleted.
const DELETED_PROJECTS = "SELECT id FROM projects WHERE status = 'deleted'";
const DELETED_SOURCES = `SELECT id FROM sources WHERE status = 'deleted' OR project_id IN (${DELETED_PROJECTS})`;
const PURGE_SOURCE_TABLES = [
  'dashboard_rollups',
  'dashboard_daily_users',
  'dashboard_hourly_page_views',
  'dashboard_hourly_visitors',
  'dashboard_minute_totals',
  'dashboard_minute_dimensions',
  'dashboard_minute_visitors',
  'dashboard_aggregate_watermarks',
  'quota_windows',
  'ingestion_decisions',
  'administrative_audit'
];
// Rows are matched by website, or by project for rows recorded without one (project audit entries).
const PURGE_SOURCE_WHERE = `source_id IN (${DELETED_SOURCES}) OR project_id IN (${DELETED_PROJECTS})`;
// A deleted project and each deleted website own a quota policy. Drop those, but never one that a
// live project or website still references; done before the website and project rows go.
const PURGE_POLICY_WHERE = `(id IN (SELECT quota_policy_id FROM projects WHERE status = 'deleted')
    OR id IN (SELECT quota_policy_id FROM sources WHERE quota_policy_id IS NOT NULL AND id IN (${DELETED_SOURCES})))
  AND id NOT IN (SELECT quota_policy_id FROM projects WHERE status != 'deleted')
  AND id NOT IN (SELECT quota_policy_id FROM sources WHERE quota_policy_id IS NOT NULL AND id NOT IN (${DELETED_SOURCES}))`;
const PURGE_TABLES: Array<{ table: string; where: string }> = [
  ...PURGE_SOURCE_TABLES.map((table) => ({ table, where: PURGE_SOURCE_WHERE })),
  // Not attributable to a website; only a deleted project's digests can be removed.
  { table: 'dashboard_seen_events', where: `project_id IN (${DELETED_PROJECTS})` },
  { table: 'quota_policies', where: PURGE_POLICY_WHERE },
  { table: 'sources', where: `id IN (${DELETED_SOURCES})` },
  { table: 'projects', where: "status = 'deleted'" }
];

export type PurgeTargets = {
  /** Deleted projects: their whole object prefix goes. */
  projectIds: string[];
  /** Deleted websites of projects that are still live. */
  sources: Array<{ projectId: string; sourceId: string }>;
};
export type PurgeRowResult = { rows: Record<string, number>; complete: boolean };

export class D1Repositories
  implements ProjectRepository, IngestionDecisionRepository, AdminRepository
{
  constructor(
    private readonly db: D1Database,
    private readonly analyticsDigestSecret = 'test-only-analytics-digest-secret'
  ) {}
  async findProject(id: string): Promise<Project | undefined> {
    const row = await this.db
      .prepare('SELECT * FROM projects WHERE id = ?')
      .bind(id)
      .first<ProjectRow>();
    return row
      ? {
          id: row.id,
          name: row.name,
          mode: row.mode,
          defaultRetentionDays: row.default_retention_days,
          quotaPolicyId: row.quota_policy_id,
          status: row.status
        }
      : undefined;
  }
  async findSourceByPublicKey(key: string): Promise<Source | undefined> {
    const row = await this.db
      .prepare('SELECT * FROM sources WHERE public_source_key = ?')
      .bind(key)
      .first<SourceRow>();
    if (!row) return undefined;
    try {
      return {
        id: row.id,
        projectId: row.project_id,
        name: row.name,
        publicSourceKey: row.public_source_key,
        allowedOrigins: JSON.parse(row.allowed_origins_json) as string[],
        status: row.status,
        ...(row.quota_policy_id ? { quotaPolicyId: row.quota_policy_id } : {}),
        ...(row.created_at ? { createdAt: row.created_at } : {}),
        ...(row.updated_at ? { updatedAt: row.updated_at } : {})
      };
    } catch {
      return undefined;
    }
  }
  async findQuotaPolicy(id: string): Promise<QuotaPolicy | undefined> {
    const row = await this.db
      .prepare('SELECT * FROM quota_policies WHERE id = ?')
      .bind(id)
      .first<QuotaRow>();
    return row
      ? {
          id: row.id,
          maxRequestBytes: row.max_request_bytes,
          maxEventsPerBatch: row.max_events_per_batch,
          maxEventsPerToken: row.max_events_per_token,
          maxEventsPerSecond: row.max_events_per_second,
          maxEventsPerDay: row.max_events_per_day,
          maxPropertyCount: row.max_property_count,
          maxPropertyValueLength: row.max_property_value_length,
          retentionDays: row.retention_days
        }
      : undefined;
  }
  async saveDecision(decision: IngestionDecision): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO ingestion_decisions (project_id, source_id, decision, accepted_count, rejected_count, reason_codes_json, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        decision.projectId ?? null,
        decision.sourceId ?? null,
        decision.decision,
        decision.acceptedCount,
        decision.rejectedCount,
        JSON.stringify(decision.reasonCodes),
        decision.receivedAt.toISOString()
      )
      .run();
  }
  async reserveQuota(reservation: QuotaReservation): Promise<boolean> {
    const reserve = async (windowKind: 'second' | 'day', windowStart: string, limit: number) => {
      const result = await this.db
        .prepare(
          `INSERT INTO quota_windows (project_id, source_id, window_kind, window_start, accepted_events, accepted_bytes)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(project_id, source_id, window_kind, window_start) DO UPDATE SET
             accepted_events = accepted_events + excluded.accepted_events,
             accepted_bytes = accepted_bytes + excluded.accepted_bytes
           WHERE quota_windows.accepted_events + excluded.accepted_events <= ?`
        )
        .bind(
          reservation.projectId,
          reservation.sourceId,
          windowKind,
          windowStart,
          reservation.eventCount,
          reservation.requestBytes,
          limit
        )
        .run();
      return (result.meta?.changes ?? 1) > 0;
    };
    const second = reservation.now.toISOString().slice(0, 19);
    const day = reservation.now.toISOString().slice(0, 10);
    return (
      (await reserve('second', second, reservation.maxEventsPerSecond)) &&
      (await reserve('day', day, reservation.maxEventsPerDay))
    );
  }
  /** Runs read statements in one round trip when the database supports batching (D1 does). */
  private async readAll(statements: ReturnType<D1Database['prepare']>[]): Promise<unknown[][]> {
    if (this.db.batch)
      return (await this.db.batch(statements)).map((result) => result.results ?? []);
    return Promise.all(statements.map(async (statement) => (await statement.all()).results));
  }
  private async runBatch(
    statements: ReturnType<D1Database['prepare']>[]
  ): Promise<Array<{ meta?: { changes?: number } }>> {
    if (this.db.batch) return this.db.batch(statements);
    const results: Array<{ meta?: { changes?: number } }> = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }

  async recordDashboardRollups(
    events: StoredEvent[],
    context?: RequestAnalyticsContext
  ): Promise<void> {
    const expanded: Array<{
      event: StoredEvent;
      eventDigest: string;
      minute: string;
      dimensions: Array<[AnalyticsDimensionKind, string]>;
      visitorDigest?: string;
      identityKind?: 'source-local' | 'project-supplied';
    }> = [];
    for (const stored of events) {
      const day = stored.receivedAt.toISOString().slice(0, 10);
      const eventType = stored.event.type;
      const data = stored.event.data as { page?: { url_path?: unknown } };
      const pagePath =
        eventType === 'com.vizoalica.page_view.v1' && typeof data.page?.url_path === 'string'
          ? data.page.url_path
          : '';
      await this.db
        .prepare(
          'INSERT INTO dashboard_rollups (project_id, source_id, event_date, event_type, page_path, event_count) VALUES (?, ?, ?, ?, ?, 1) ON CONFLICT(project_id, source_id, event_date, event_type, page_path) DO UPDATE SET event_count = event_count + 1'
        )
        .bind(stored.projectId, stored.sourceId, day, eventType, pagePath)
        .run();
      if (eventType === 'com.vizoalica.page_view.v1') {
        const hour = stored.receivedAt.toISOString().slice(0, 13) + ':00:00.000Z';
        await this.db
          .prepare(
            'INSERT INTO dashboard_hourly_page_views (project_id, source_id, hour_utc, page_view_count) VALUES (?, ?, ?, 1) ON CONFLICT(project_id, source_id, hour_utc) DO UPDATE SET page_view_count = page_view_count + 1'
          )
          .bind(stored.projectId, stored.sourceId, hour)
          .run();
        const visitorId = (stored.event.data as { visitor?: { anonymous_id?: unknown } }).visitor
          ?.anonymous_id;
        if (typeof visitorId === 'string' && visitorId) {
          await this.db
            .prepare(
              'INSERT OR IGNORE INTO dashboard_hourly_visitors (project_id, source_id, hour_utc, visitor_digest) VALUES (?, ?, ?, ?)'
            )
            .bind(
              stored.projectId,
              stored.sourceId,
              hour,
              await hmacDigest(this.analyticsDigestSecret, 'legacy-v1', visitorId)
            )
            .run();
        }
        if (typeof stored.event.id === 'string' && stored.event.id) {
          const minute = stored.receivedAt.toISOString().slice(0, 16) + ':00.000Z';
          const referrer = (stored.event.data as { referrer?: { origin?: unknown } }).referrer
            ?.origin;
          const safeContext =
            context ??
            ({
              country: 'Unknown',
              browser: 'Unknown',
              os: 'Unknown',
              device: 'unknown',
              traffic: 'unknown',
              userAgentFamily: 'Unknown',
              taxonomyVersion: 1
            } satisfies RequestAnalyticsContext);
          const identity = safeContext.projectVisitorId ?? visitorId;
          const identityKind = safeContext.projectVisitorId ? 'project-supplied' : 'source-local';
          const visitorDigest = identity
            ? await hmacDigest(
                this.analyticsDigestSecret,
                ...[
                  identityKind === 'project-supplied' ? 'project-v1' : 'source-v1',
                  stored.projectId,
                  identityKind === 'source-local' ? stored.sourceId : undefined,
                  identity
                ].filter((part): part is string => part !== undefined)
              )
            : undefined;
          expanded.push({
            event: stored,
            eventDigest: await hmacDigest(
              this.analyticsDigestSecret,
              'event-v1',
              stored.projectId,
              stored.event.id
            ),
            minute,
            dimensions: [
              ['page_path', pagePath || 'Unknown'],
              ['country', safeContext.country],
              ['user_agent', safeContext.userAgentFamily],
              ['browser', safeContext.browser],
              ['os', safeContext.os],
              ['device', safeContext.device],
              ['traffic', safeContext.traffic],
              ['referrer', typeof referrer === 'string' && referrer ? referrer : 'Unknown']
            ],
            ...(visitorDigest ? { visitorDigest, identityKind } : {})
          });
        }
      }
    }
    if (!expanded.length) return;

    const nonce = crypto.randomUUID();
    const statements = expanded.map(({ event, eventDigest }) =>
      this.db
        .prepare(
          'INSERT OR IGNORE INTO dashboard_seen_events (project_id, event_digest, received_at, request_nonce, digest_version) VALUES (?, ?, ?, ?, 1)'
        )
        .bind(event.projectId, eventDigest, event.receivedAt.toISOString(), nonce)
    );
    type Group = { projectId: string; sourceId: string; minute: string; eventDigests: string[] };
    const totals = new Map<string, Group>();
    const dimensions = new Map<
      string,
      Group & { kind: AnalyticsDimensionKind; value: string; taxonomyVersion: number }
    >();
    const visitors = new Map<
      string,
      Group & { visitorDigest: string; identityKind: 'source-local' | 'project-supplied' }
    >();
    for (const item of expanded) {
      const base = {
        projectId: item.event.projectId,
        sourceId: item.event.sourceId,
        minute: item.minute
      };
      const totalKey = JSON.stringify(base);
      const total = totals.get(totalKey) ?? { ...base, eventDigests: [] };
      total.eventDigests.push(item.eventDigest);
      totals.set(totalKey, total);
      for (const [kind, value] of item.dimensions) {
        const key = JSON.stringify({
          ...base,
          kind,
          value,
          taxonomyVersion: context?.taxonomyVersion ?? 1
        });
        const group = dimensions.get(key) ?? {
          ...base,
          kind,
          value,
          taxonomyVersion: context?.taxonomyVersion ?? 1,
          eventDigests: []
        };
        group.eventDigests.push(item.eventDigest);
        dimensions.set(key, group);
      }
      if (item.visitorDigest && item.identityKind) {
        const key = JSON.stringify({
          ...base,
          visitorDigest: item.visitorDigest,
          identityKind: item.identityKind
        });
        const group = visitors.get(key) ?? {
          ...base,
          visitorDigest: item.visitorDigest,
          identityKind: item.identityKind,
          eventDigests: []
        };
        group.eventDigests.push(item.eventDigest);
        visitors.set(key, group);
      }
    }
    const placeholders = (count: number) => Array.from({ length: count }, () => '?').join(', ');
    for (const group of totals.values()) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO dashboard_minute_totals (project_id, source_id, minute_utc, page_view_count)
             SELECT ?, ?, ?, COUNT(*) FROM dashboard_seen_events
             WHERE project_id = ? AND request_nonce = ? AND event_digest IN (${placeholders(group.eventDigests.length)})
             HAVING COUNT(*) > 0
             ON CONFLICT(project_id, source_id, minute_utc) DO UPDATE SET page_view_count = page_view_count + excluded.page_view_count`
          )
          .bind(
            group.projectId,
            group.sourceId,
            group.minute,
            group.projectId,
            nonce,
            ...group.eventDigests
          )
      );
    }
    for (const group of dimensions.values()) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO dashboard_minute_dimensions (project_id, source_id, minute_utc, dimension_kind, dimension_value, taxonomy_version, event_count)
             SELECT ?, ?, ?, ?, ?, ?, COUNT(*) FROM dashboard_seen_events
             WHERE project_id = ? AND request_nonce = ? AND event_digest IN (${placeholders(group.eventDigests.length)})
             HAVING COUNT(*) > 0
             ON CONFLICT(project_id, source_id, minute_utc, dimension_kind, dimension_value, taxonomy_version) DO UPDATE SET event_count = event_count + excluded.event_count`
          )
          .bind(
            group.projectId,
            group.sourceId,
            group.minute,
            group.kind,
            group.value,
            group.taxonomyVersion,
            group.projectId,
            nonce,
            ...group.eventDigests
          )
      );
    }
    for (const group of visitors.values()) {
      statements.push(
        this.db
          .prepare(
            `INSERT OR IGNORE INTO dashboard_minute_visitors (project_id, source_id, minute_utc, visitor_digest, digest_version, identity_kind)
             SELECT ?, ?, ?, ?, 1, ? FROM dashboard_seen_events
             WHERE project_id = ? AND request_nonce = ? AND event_digest IN (${placeholders(group.eventDigests.length)}) LIMIT 1`
          )
          .bind(
            group.projectId,
            group.sourceId,
            group.minute,
            group.visitorDigest,
            group.identityKind,
            group.projectId,
            nonce,
            ...group.eventDigests
          )
      );
    }
    const watermarks = new Map<string, { projectId: string; sourceId: string; minute: string }>();
    for (const item of expanded) {
      const key = `${item.event.projectId}\0${item.event.sourceId}`;
      const current = watermarks.get(key);
      if (!current || item.minute > current.minute)
        watermarks.set(key, {
          projectId: item.event.projectId,
          sourceId: item.event.sourceId,
          minute: item.minute
        });
    }
    for (const watermark of watermarks.values())
      statements.push(
        this.db
          .prepare(
            `INSERT INTO dashboard_aggregate_watermarks (project_id, source_id, expanded_from_utc, last_completed_at, taxonomy_version)
             VALUES (?, ?, ?, ?, 1)
             ON CONFLICT(project_id, source_id) DO UPDATE SET last_completed_at = excluded.last_completed_at, taxonomy_version = excluded.taxonomy_version`
          )
          .bind(watermark.projectId, watermark.sourceId, watermark.minute, new Date().toISOString())
      );
    statements.push(
      this.db
        .prepare('UPDATE dashboard_seen_events SET request_nonce = NULL WHERE request_nonce = ?')
        .bind(nonce)
    );
    await this.runBatch(statements);
  }
  async listDecisions(): Promise<IngestionDecision[]> {
    return [];
  }
  async createProject(project: Project): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO projects (id, name, mode, default_retention_days, quota_policy_id, status) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(
        project.id,
        project.name,
        project.mode,
        project.defaultRetentionDays,
        project.quotaPolicyId,
        project.status
      )
      .run();
  }
  async setProjectStatus(
    projectId: string,
    status: 'active' | 'deleted'
  ): Promise<Project | undefined> {
    const result = await this.db
      .prepare("UPDATE projects SET status = ? WHERE id = ? AND status != 'deleted'")
      .bind(status, projectId)
      .run();
    if ((result.meta?.changes ?? 0) !== 1) return undefined;
    if (status === 'deleted') {
      await this.db
        .prepare(
          "UPDATE sources SET status = 'deleted', updated_at = ? WHERE project_id = ? AND status != 'deleted'"
        )
        .bind(new Date().toISOString(), projectId)
        .run();
    }
    return this.findProject(projectId);
  }
  async createQuotaPolicy(policy: QuotaPolicy): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO quota_policies (id, max_request_bytes, max_events_per_batch, max_events_per_token, max_events_per_second, max_events_per_day, max_property_count, max_property_value_length, retention_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        policy.id,
        policy.maxRequestBytes,
        policy.maxEventsPerBatch,
        policy.maxEventsPerToken,
        policy.maxEventsPerSecond,
        policy.maxEventsPerDay,
        policy.maxPropertyCount,
        policy.maxPropertyValueLength,
        policy.retentionDays
      )
      .run();
  }
  async listProjects(): Promise<Project[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM projects ORDER BY name')
      .all<ProjectRow>();
    return results.map((row) => ({
      id: row.id,
      name: row.name,
      mode: row.mode,
      defaultRetentionDays: row.default_retention_days,
      quotaPolicyId: row.quota_policy_id,
      status: row.status
    }));
  }
  async createSource(source: Source): Promise<void> {
    const createdAt = source.createdAt ?? new Date().toISOString();
    await this.db
      .prepare(
        'INSERT INTO sources (id, project_id, name, public_source_key, allowed_origins_json, status, quota_policy_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        source.id,
        source.projectId,
        source.name,
        source.publicSourceKey,
        JSON.stringify(source.allowedOrigins),
        source.status,
        source.quotaPolicyId ?? null,
        createdAt,
        source.updatedAt ?? new Date().toISOString()
      )
      .run();
    const expandedFrom = new Date(createdAt);
    expandedFrom.setUTCSeconds(0, 0);
    await this.db
      .prepare(
        'INSERT OR IGNORE INTO dashboard_aggregate_watermarks (project_id, source_id, expanded_from_utc, last_completed_at, taxonomy_version) VALUES (?, ?, ?, ?, 1)'
      )
      .bind(source.projectId, source.id, expandedFrom.toISOString(), createdAt)
      .run();
  }
  async listSources(projectId: string): Promise<Source[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM sources WHERE project_id = ? ORDER BY id')
      .bind(projectId)
      .all<SourceRow>();
    return results.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      publicSourceKey: row.public_source_key,
      allowedOrigins: JSON.parse(row.allowed_origins_json) as string[],
      status: row.status,
      ...(row.quota_policy_id ? { quotaPolicyId: row.quota_policy_id } : {}),
      ...(row.created_at ? { createdAt: row.created_at } : {}),
      ...(row.updated_at ? { updatedAt: row.updated_at } : {})
    }));
  }
  async setSourceStatus(
    projectId: string,
    sourceId: string,
    status: 'active' | 'disabled' | 'deleted'
  ): Promise<Source | undefined> {
    const result = await this.db
      .prepare(
        "UPDATE sources SET status = ?, updated_at = ? WHERE id = ? AND project_id = ? AND status != 'deleted'"
      )
      .bind(status, new Date().toISOString(), sourceId, projectId)
      .run();
    return (result.meta?.changes ?? 0) === 1 ? this.getSource(projectId, sourceId) : undefined;
  }
  async getSource(projectId: string, sourceId: string): Promise<Source | undefined> {
    const row = await this.db
      .prepare('SELECT * FROM sources WHERE id = ? AND project_id = ?')
      .bind(sourceId, projectId)
      .first<SourceRow>();
    return row
      ? {
          id: row.id,
          projectId: row.project_id,
          name: row.name,
          publicSourceKey: row.public_source_key,
          allowedOrigins: JSON.parse(row.allowed_origins_json) as string[],
          status: row.status,
          ...(row.quota_policy_id ? { quotaPolicyId: row.quota_policy_id } : {}),
          ...(row.created_at ? { createdAt: row.created_at } : {}),
          ...(row.updated_at ? { updatedAt: row.updated_at } : {})
        }
      : undefined;
  }
  async updateSource(
    projectId: string,
    sourceId: string,
    changes: { name?: string; allowedOrigins?: string[]; status?: 'active' | 'disabled' }
  ): Promise<Source | undefined> {
    const existing = await this.getSource(projectId, sourceId);
    if (!existing || existing.status === 'deleted') return undefined;
    const result = await this.db
      .prepare(
        "UPDATE sources SET name = ?, allowed_origins_json = ?, status = ?, updated_at = ? WHERE id = ? AND project_id = ? AND status != 'deleted'"
      )
      .bind(
        changes.name ?? existing.name,
        JSON.stringify(changes.allowedOrigins ?? existing.allowedOrigins),
        changes.status ?? existing.status,
        new Date().toISOString(),
        sourceId,
        projectId
      )
      .run();
    return (result.meta?.changes ?? 0) ? this.getSource(projectId, sourceId) : undefined;
  }
  async getPageViewCounts(
    projectId: string,
    sourceId: string,
    startDate: string,
    endDate: string
  ): Promise<PageViewCounts | undefined> {
    const source = await this.db
      .prepare('SELECT * FROM sources WHERE id = ? AND project_id = ?')
      .bind(sourceId, projectId)
      .first<SourceRow>();
    if (!source) return undefined;
    const { results } = await this.db
      .prepare(
        "SELECT event_date AS date, page_path AS path, event_count AS count FROM dashboard_rollups WHERE project_id = ? AND source_id = ? AND event_type = 'com.vizoalica.page_view.v1' AND event_date BETWEEN ? AND ? ORDER BY event_date, page_path"
      )
      .bind(projectId, sourceId, startDate, endDate)
      .all<{ date: string; path: string; count: number }>();
    return { total: results.reduce((total, row) => total + row.count, 0), byDateAndPath: results };
  }
  async getAnalyticsSummary(
    projectId: string,
    sourceId: string,
    window: '24h' | '7d' | '30d',
    now = new Date()
  ): Promise<AnalyticsSummary | undefined> {
    const source = await this.db
      .prepare('SELECT id FROM sources WHERE id = ? AND project_id = ?')
      .bind(sourceId, projectId)
      .first();
    if (!source) return undefined;
    const hours = window === '24h' ? 24 : window === '7d' ? 168 : 720;
    const endUtc = now.toISOString();
    const startUtc = new Date(now.getTime() - hours * 3600000).toISOString();
    const row = await this.db
      .prepare(
        'SELECT COALESCE(SUM(page_view_count), 0) AS pageViews FROM dashboard_hourly_page_views WHERE project_id = ? AND source_id = ? AND hour_utc >= ? AND hour_utc < ?'
      )
      .bind(projectId, sourceId, startUtc, endUtc)
      .first<{ pageViews: number }>();
    const visitors = await this.db
      .prepare(
        'SELECT COUNT(DISTINCT visitor_digest) AS uniqueUsers FROM dashboard_hourly_visitors WHERE project_id = ? AND source_id = ? AND hour_utc >= ? AND hour_utc < ?'
      )
      .bind(projectId, sourceId, startUtc, endUtc)
      .first<{ uniqueUsers: number }>();
    return {
      projectId,
      sourceId,
      window,
      startUtc,
      endUtc,
      pageViews: row?.pageViews ?? 0,
      uniqueUsers: visitors?.uniqueUsers ?? 0,
      availability: 'complete'
    };
  }
  async getAnalyticsOverview(
    projectId: string,
    sourceId: string | undefined,
    startUtc: string,
    endUtc: string
  ): Promise<AnalyticsOverview | undefined> {
    const project = await this.findProject(projectId);
    if (!project) return undefined;
    const source = sourceId ? await this.getSource(projectId, sourceId) : undefined;
    if (sourceId && (!source || source.status === 'deleted')) return undefined;
    const duration = new Date(endUtc).getTime() - new Date(startUtc).getTime();
    const interval: 'hour' | 'day' = duration <= 24 * 60 * 60 * 1000 ? 'hour' : 'day';
    const scopeSql = sourceId
      ? 'AND source_id = ?'
      : "AND source_id IN (SELECT id FROM sources WHERE project_id = ? AND status != 'deleted')";
    const rangeValues = () => [projectId, startUtc, endUtc, sourceId ?? projectId];
    const bucket =
      interval === 'hour'
        ? "substr(minute_utc, 1, 13) || ':00:00.000Z'"
        : "substr(minute_utc, 1, 10) || 'T00:00:00.000Z'";
    const inRange = `project_id = ? AND minute_utc >= ? AND minute_utc < ? ${scopeSql}`;
    const rangeQuery = (sql: string, ...extra: unknown[]) =>
      this.db.prepare(sql).bind(...rangeValues(), ...extra);
    // Ranking limits keep responses bounded: real countries number about 250, while pages and
    // referrers are open-ended, so those are capped and the remainder is folded into `otherCount`.
    const dimensions: Array<[AnalyticsDimensionKind, number]> = [
      ['page_path', RANKING_LIMIT],
      ['country', COUNTRY_RANKING_LIMIT],
      ['user_agent', RANKING_LIMIT],
      ['referrer', RANKING_LIMIT],
      ['os', 0],
      ['browser', 0],
      ['device', 0],
      ['traffic', 0]
    ];

    // Every read goes out in one round trip, and D1 runs a batch as one transaction, so the
    // numbers on a dashboard also come from one consistent snapshot.
    const [
      totalRows,
      uniqueRows,
      pageTrendRows,
      visitorTrendRows,
      watermarkRows,
      versionRows,
      identityRows,
      ...dimensionResults
    ] = await this.readAll([
      rangeQuery(
        `SELECT COALESCE(SUM(page_view_count), 0) AS pageViews FROM dashboard_minute_totals WHERE ${inRange}`
      ),
      rangeQuery(
        `SELECT COUNT(DISTINCT visitor_digest) AS uniqueUsers FROM dashboard_minute_visitors WHERE ${inRange}`
      ),
      rangeQuery(
        `SELECT ${bucket} AS startUtc, SUM(page_view_count) AS pageViews
         FROM dashboard_minute_totals WHERE ${inRange} GROUP BY startUtc ORDER BY startUtc`
      ),
      rangeQuery(
        `SELECT ${bucket} AS startUtc, COUNT(DISTINCT visitor_digest) AS uniqueUsers
         FROM dashboard_minute_visitors WHERE ${inRange} GROUP BY startUtc ORDER BY startUtc`
      ),
      this.db
        .prepare(
          `SELECT MAX(expanded_from_utc) AS availableFromUtc, MAX(last_completed_at) AS lastCompletedAt
           FROM dashboard_aggregate_watermarks WHERE project_id = ?${sourceId ? ' AND source_id = ?' : ''}`
        )
        .bind(...(sourceId ? [projectId, sourceId] : [projectId])),
      rangeQuery(
        `SELECT DISTINCT taxonomy_version AS version FROM dashboard_minute_dimensions WHERE ${inRange} ORDER BY version`
      ),
      rangeQuery(
        `SELECT DISTINCT identity_kind AS kind FROM dashboard_minute_visitors WHERE ${inRange}`
      ),
      ...dimensions.map(([kind]) =>
        rangeQuery(
          `SELECT dimension_value AS label, SUM(event_count) AS count
           FROM dashboard_minute_dimensions WHERE ${inRange} AND dimension_kind = ?
           GROUP BY dimension_value ORDER BY count DESC, label ASC`,
          kind
        )
      )
    ]);

    const total = totalRows?.[0] as { pageViews: number } | undefined;
    const unique = uniqueRows?.[0] as { uniqueUsers: number } | undefined;
    const watermark = watermarkRows?.[0] as
      { availableFromUtc?: string; lastCompletedAt?: string } | undefined;
    const trendMap = new Map<
      string,
      { startUtc: string; pageViews: number; uniqueUsers: number }
    >();
    for (const row of (pageTrendRows ?? []) as Array<{ startUtc: string; pageViews: number }>)
      trendMap.set(row.startUtc, {
        startUtc: row.startUtc,
        pageViews: Number(row.pageViews),
        uniqueUsers: 0
      });
    for (const row of (visitorTrendRows ?? []) as Array<{
      startUtc: string;
      uniqueUsers: number;
    }>) {
      const current = trendMap.get(row.startUtc) ?? {
        startUtc: row.startUtc,
        pageViews: 0,
        uniqueUsers: 0
      };
      current.uniqueUsers = Number(row.uniqueUsers);
      trendMap.set(row.startUtc, current);
    }

    const counted = (index: number) =>
      ((dimensionResults[index] ?? []) as Array<{ label: string; count: number }>).map((row) => ({
        label: row.label,
        count: Number(row.count)
      }));
    const sum = (rows: Array<{ count: number }>) => rows.reduce((all, row) => all + row.count, 0);
    const ranked = (index: number): RankedResult => {
      const rows = counted(index);
      const limit = dimensions[index]![1];
      return {
        items: rows.slice(0, limit),
        otherCount: sum(rows.slice(limit)),
        total: sum(rows)
      };
    };
    const distribution = (index: number): DistributionResult => {
      const rows = counted(index);
      const items = rows.slice(0, 11);
      const remainder = sum(rows.slice(11));
      if (remainder) items.push({ label: 'Other', count: remainder });
      return { items, total: sum(rows) };
    };
    const [pagePaths, countries, userAgents, referrers] = [0, 1, 2, 3].map(ranked) as [
      RankedResult,
      RankedResult,
      RankedResult,
      RankedResult
    ];
    const [operatingSystems, browsers, devices, traffic] = [4, 5, 6, 7].map(distribution) as [
      DistributionResult,
      DistributionResult,
      DistributionResult,
      DistributionResult
    ];
    const identityKinds = new Set(
      ((identityRows ?? []) as Array<{ kind: string }>).map((row) => row.kind)
    );
    const identityMode =
      identityKinds.size > 1
        ? 'mixed'
        : identityKinds.has('project-supplied')
          ? 'project-supplied'
          : 'source-local';
    const incomplete = !!watermark?.availableFromUtc && startUtc < watermark.availableFromUtc;
    return {
      scope: {
        projectId,
        sourceId: sourceId ?? null,
        label: source?.name ?? 'All websites',
        identityMode
      },
      range: { startUtc, endUtc, interval, timezone: 'UTC' },
      totals: {
        pageViews: Number(total?.pageViews ?? 0),
        uniqueUsers: Number(unique?.uniqueUsers ?? 0)
      },
      trend: [...trendMap.values()].sort((a, b) => a.startUtc.localeCompare(b.startUtc)),
      rankings: { pagePaths, countries, userAgents, referrers },
      distributions: { operatingSystems, browsers, devices, traffic },
      availability: {
        state: incomplete ? 'incomplete' : 'complete',
        ...(watermark?.lastCompletedAt ? { lastCompletedAt: watermark.lastCompletedAt } : {}),
        ...(incomplete && watermark?.availableFromUtc
          ? { availableFromUtc: watermark.availableFromUtc }
          : {}),
        taxonomyVersions: ((versionRows ?? []) as Array<{ version: number }>).map((row) =>
          Number(row.version)
        )
      }
    };
  }

  async deleteExpiredDashboardData(beforeUtc: string): Promise<void> {
    let pending: Array<[string, string]> = [
      ['dashboard_minute_totals', 'minute_utc'],
      ['dashboard_minute_dimensions', 'minute_utc'],
      ['dashboard_minute_visitors', 'minute_utc'],
      ['dashboard_seen_events', 'received_at'],
      // Operational tables share the aggregate boundary so no table grows without bound.
      ['ingestion_decisions', 'received_at'],
      ['quota_windows', 'window_start']
    ];
    // A single bounded batch cannot keep pace with steady traffic, so repeat while any table
    // still returned a full batch, up to a per-run cap that keeps the Cron invocation short.
    // Tables that came back short are drained and dropped from later passes, so they are not
    // rescanned (some have no index on the retention column).
    for (let pass = 0; pass < RETENTION_MAX_PASSES && pending.length > 0; pass += 1) {
      const results = await this.runBatch(
        pending.map(([table, column]) =>
          this.db
            .prepare(
              `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${column} < ? LIMIT ${RETENTION_BATCH_ROWS})`
            )
            .bind(beforeUtc)
        )
      );
      pending = pending.filter(
        (_entry, index) => (results[index]?.meta?.changes ?? 0) >= RETENTION_BATCH_ROWS
      );
    }
  }
  async listPurgeTargets(): Promise<PurgeTargets> {
    const projects = await this.db.prepare(DELETED_PROJECTS).all<{ id: string }>();
    const sources = await this.db
      .prepare(
        `SELECT id, project_id FROM sources WHERE status = 'deleted' AND project_id NOT IN (${DELETED_PROJECTS})`
      )
      .all<{ id: string; project_id: string }>();
    return {
      projectIds: projects.results.map((row) => row.id),
      sources: sources.results.map((row) => ({ projectId: row.project_id, sourceId: row.id }))
    };
  }

  /** Rows a purge would remove, per table. */
  async countPurgeRows(): Promise<Record<string, number>> {
    const rows: Record<string, number> = {};
    for (const { table, where } of PURGE_TABLES) {
      const result = await this.db
        .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)
        .first<{ n: number }>();
      rows[table] = Number(result?.n ?? 0);
    }
    return rows;
  }

  /**
   * Deletes purgeable rows in bounded batches, dependents first so the website and project rows
   * that identify them are removed last. Stops when `budget.remaining` statements are spent;
   * `complete` is false then, and rerunning resumes where it stopped.
   */
  async purgeDeletedRows(budget: { remaining: number }): Promise<PurgeRowResult> {
    const rows: Record<string, number> = {};
    for (const { table, where } of PURGE_TABLES) {
      rows[table] = 0;
      for (;;) {
        if (budget.remaining < 1) return { rows, complete: false };
        budget.remaining -= 1;
        const result = await this.db
          .prepare(
            `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${where} LIMIT ${RETENTION_BATCH_ROWS})`
          )
          .run();
        const changes = result.meta?.changes ?? 0;
        rows[table] += changes;
        if (changes < RETENTION_BATCH_ROWS) break;
      }
    }
    return { rows, complete: true };
  }
  async saveAdminAudit(entry: AdminAuditEntry): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO administrative_audit (occurred_at, operation, outcome, project_id, source_id, reason_code) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(
        new Date().toISOString(),
        entry.operation,
        entry.outcome,
        entry.projectId ?? null,
        entry.sourceId ?? null,
        entry.reasonCode
      )
      .run();
  }
}
