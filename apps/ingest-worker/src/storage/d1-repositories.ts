import type {
  AdminAuditEntry,
  IngestionDecision,
  PageViewCounts,
  Project,
  QuotaPolicy,
  Source,
  AnalyticsSummary
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

async function digestVisitor(visitorId: string, digestKey: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(digestKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(visitorId));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join(
    ''
  );
}

export class D1Repositories
  implements ProjectRepository, IngestionDecisionRepository, AdminRepository
{
  constructor(
    private readonly db: D1Database,
    private readonly visitorDigestKey = 'test-only-visitor-digest-key'
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
          quotaPolicyId: row.quota_policy_id
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
  async recordDashboardRollups(events: StoredEvent[]): Promise<void> {
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
              await digestVisitor(visitorId, this.visitorDigestKey)
            )
            .run();
        }
      }
    }
  }
  async listDecisions(): Promise<IngestionDecision[]> {
    return [];
  }
  async createProject(project: Project): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO projects (id, name, mode, default_retention_days, quota_policy_id) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(
        project.id,
        project.name,
        project.mode,
        project.defaultRetentionDays,
        project.quotaPolicyId
      )
      .run();
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
      quotaPolicyId: row.quota_policy_id
    }));
  }
  async createSource(source: Source): Promise<void> {
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
        source.createdAt ?? new Date().toISOString(),
        source.updatedAt ?? new Date().toISOString()
      )
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
