import type {
  IngestionDecision,
  Project,
  QuotaPolicy,
  Source,
  StoredEvent
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
  recordDashboardRollups?(events: StoredEvent[]): Promise<void>;
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
