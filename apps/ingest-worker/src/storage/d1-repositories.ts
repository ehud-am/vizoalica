import type {
  IngestionDecision,
  Project,
  QuotaPolicy,
  Source
} from '../../../ingest-api/src/domain/types.js';
import type {
  IngestionDecisionRepository,
  ProjectRepository
} from '../../../ingest-api/src/storage/repositories.js';
import type { D1Database } from '../env.js';

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

export class D1Repositories implements ProjectRepository, IngestionDecisionRepository {
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
        status: row.status
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
  async listDecisions(): Promise<IngestionDecision[]> {
    return [];
  }
}
