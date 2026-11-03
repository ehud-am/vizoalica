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
  CampaignsFilters,
  CampaignsReport,
  RageClicksReport,
  Goal,
  GoalsReport,
  GroupingRule,
  ExcludedHitsReport,
  CustomEventsFilters,
  CustomEventsReport,
  AdminAuditEntry,
  AnalyticsOverview,
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
  /**
   * Whether the pixel may count this path: already known, or the website is under its cap. A new
   * path over the cap is refused. Absent on a database older than schema 9, where there is no cap.
   */
  admitPixelPath?(input: {
    projectId: string;
    sourceId: string;
    path: string;
    maxPaths: number;
    now: Date;
  }): Promise<boolean>;
  /** Counts events dropped because their address is excluded: a count per website and day, no address. */
  recordExcludedHits?(input: {
    projectId: string;
    sourceId: string;
    eventCount: number;
    now: Date;
  }): Promise<void>;
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
    changes: {
      name?: string;
      allowedOrigins?: string[];
      status?: 'active' | 'disabled';
      tokenRequired?: boolean;
      excludedAddresses?: string[];
      pixelEnabled?: boolean;
      groupingRules?: GroupingRule[];
    }
  ): Promise<Source | undefined>;
  getSource(projectId: string, sourceId: string): Promise<Source | undefined>;
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
  getCustomEventsReport?(
    projectId: string,
    sourceId: string | undefined,
    startUtc: string,
    endUtc: string,
    filters?: CustomEventsFilters
  ): Promise<CustomEventsReport | undefined>;
  getCampaignsReport?(
    projectId: string,
    sourceId: string | undefined,
    startUtc: string,
    endUtc: string,
    filters?: CampaignsFilters
  ): Promise<CampaignsReport | undefined>;
  getRageClicksReport?(
    projectId: string,
    sourceId: string | undefined,
    startUtc: string,
    endUtc: string,
    filters?: ActionsFilters
  ): Promise<RageClicksReport | undefined>;
  /** Goals of a website, newest last. Absent on a Worker whose database predates schema 9. */
  listGoals?(projectId: string, sourceId: string): Promise<Goal[]>;
  createGoal?(goal: Goal): Promise<void>;
  deleteGoal?(projectId: string, sourceId: string, goalId: string): Promise<boolean>;
  getGoalsReport?(
    projectId: string,
    sourceId: string,
    startUtc: string,
    endUtc: string
  ): Promise<GoalsReport | undefined>;
  /** Distinct pixel paths counted for a website. */
  getPixelPathUsage?(sourceId: string): Promise<{ count: number }>;
  /** Events dropped for excluded addresses over the last `windowDays` UTC days, today included. */
  getExcludedHits?(
    projectId: string,
    sourceId: string,
    windowDays: number,
    now?: Date
  ): Promise<ExcludedHitsReport | undefined>;
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
  /** Renames and/or replaces the secret of an active key. Undefined when it is missing or revoked. */
  updateAccessKey?(
    id: string,
    changes: { label?: string; secretHash?: string }
  ): Promise<AccessKeySummary | undefined>;
  countActiveAccessKeys?(): Promise<number>;
  /** True when the schema has the `access_keys` table (a database updated to at least schema 2). */
  hasAccessKeysTable?(): Promise<boolean>;
}
