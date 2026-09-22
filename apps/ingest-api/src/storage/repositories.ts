import type {
  IngestionDecision,
  Project,
  QuotaPolicy,
  Source,
  StoredEvent
} from '../domain/types.js';
import type {
  AccessKeyRecord,
  AccessKeyRole,
  AccessKeyScope,
  AccessKeySummary,
  ActionsFilters,
  ActionsReport,
  AdminAuditEntry,
  AnalyticsOverview,
  PageViewCounts,
  AnalyticsSummary,
  RequestAnalyticsContext
} from '../domain/types.js';

export interface ProjectRepository {
  findProject(id: string): Promise<Project | undefined>;
  findSourceByPublicKey(publicSourceKey: string): Promise<Source | undefined>;
  findQuotaPolicy(id: string): Promise<QuotaPolicy | undefined>;
}

export type QuotaReservation = {
  projectId: string;
  sourceId: string;
  eventCount: number;
  requestBytes: number;
  maxEventsPerSecond: number;
  maxEventsPerDay: number;
  now: Date;
};

export interface EventRepository {
  saveAcceptedEvents(events: StoredEvent[]): Promise<void>;
  listAcceptedEvents(projectId?: string): Promise<StoredEvent[]>;
  /** Updates bounded dashboard aggregates; raw events always remain in R2. */
  recordDashboardRollups?(events: StoredEvent[], context?: RequestAnalyticsContext): Promise<void>;
}

export interface IngestionDecisionRepository {
  saveDecision(decision: IngestionDecision): Promise<void>;
  listDecisions(projectId?: string): Promise<IngestionDecision[]>;
}

export interface Repositories
  extends ProjectRepository, EventRepository, IngestionDecisionRepository {
  /** Atomically reserves bounded ingestion capacity before raw-event persistence. */
  reserveQuota?(reservation: QuotaReservation): Promise<boolean>;
}

export interface AdminRepository {
  createProject(project: Project): Promise<void>;
  createQuotaPolicy(policy: QuotaPolicy): Promise<void>;
  listProjects(): Promise<Project[]>;
  setProjectStatus(projectId: string, status: 'active' | 'deleted'): Promise<Project | undefined>;
  createSource(source: Source): Promise<void>;
  listSources(projectId: string): Promise<Source[]>;
  setSourceStatus(
    projectId: string,
    sourceId: string,
    status: 'active' | 'disabled' | 'deleted'
  ): Promise<Source | undefined>;
  updateSource(
    projectId: string,
    sourceId: string,
    changes: { name?: string; allowedOrigins?: string[]; status?: 'active' | 'disabled' }
  ): Promise<Source | undefined>;
  getSource(projectId: string, sourceId: string): Promise<Source | undefined>;
  getPageViewCounts(
    projectId: string,
    sourceId: string,
    startDate: string,
    endDate: string
  ): Promise<PageViewCounts | undefined>;
  getAnalyticsSummary(
    projectId: string,
    sourceId: string,
    window: '24h' | '7d' | '30d',
    now?: Date
  ): Promise<AnalyticsSummary | undefined>;
  getAnalyticsOverview?(
    projectId: string,
    sourceId: string | undefined,
    startUtc: string,
    endUtc: string
  ): Promise<AnalyticsOverview | undefined>;
  getActionsReport?(
    projectId: string,
    sourceId: string | undefined,
    startUtc: string,
    endUtc: string,
    filters?: ActionsFilters
  ): Promise<ActionsReport | undefined>;
  deleteExpiredDashboardData?(beforeUtc: string): Promise<void>;
  saveAdminAudit(entry: AdminAuditEntry): Promise<void>;
  /** Absent on a Worker whose database predates access keys. */
  createAccessKey?(input: {
    id: string;
    label: string;
    role: AccessKeyRole;
    secretHash: string;
    scope: AccessKeyScope;
  }): Promise<AccessKeySummary>;
  listAccessKeys?(): Promise<AccessKeySummary[]>;
  findAccessKeyById?(id: string): Promise<AccessKeyRecord | undefined>;
  revokeAccessKey?(id: string): Promise<boolean>;
  countActiveAccessKeys?(): Promise<number>;
  /** True when the schema has the `access_keys` table (a database updated to at least schema 2). */
  hasAccessKeysTable?(): Promise<boolean>;
}
