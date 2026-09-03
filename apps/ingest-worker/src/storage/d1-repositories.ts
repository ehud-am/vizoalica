import type {
  AdminAuditEntry,
  IngestionDecision,
  PageViewCounts,
  Project,
  QuotaPolicy,
  Source
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
  public_source_key: string;
  allowed_origins_json: string;
  status: Source['status'];
  quota_policy_id?: string | null;
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

export class D1Repositories
  implements ProjectRepository, IngestionDecisionRepository, AdminRepository
{
  constructor(private readonly db: D1Database) {}
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
        publicSourceKey: row.public_source_key,
        allowedOrigins: JSON.parse(row.allowed_origins_json) as string[],
        status: row.status,
        ...(row.quota_policy_id ? { quotaPolicyId: row.quota_policy_id } : {})
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
        'INSERT INTO sources (id, project_id, public_source_key, allowed_origins_json, status, quota_policy_id) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(
        source.id,
        source.projectId,
        source.publicSourceKey,
        JSON.stringify(source.allowedOrigins),
        source.status,
        source.quotaPolicyId ?? null
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
      publicSourceKey: row.public_source_key,
      allowedOrigins: JSON.parse(row.allowed_origins_json) as string[],
      status: row.status,
      ...(row.quota_policy_id ? { quotaPolicyId: row.quota_policy_id } : {})
    }));
  }
  async disableSource(projectId: string, sourceId: string): Promise<boolean> {
    const result = await this.db
      .prepare(
        "UPDATE sources SET status = 'disabled' WHERE id = ? AND project_id = ? AND status = 'active'"
      )
      .bind(sourceId, projectId)
      .run();
    return (result.meta?.changes ?? 0) === 1;
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
