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

export interface EventRepository {
  saveAcceptedEvents(events: StoredEvent[]): Promise<void>;
  listAcceptedEvents(projectId?: string): Promise<StoredEvent[]>;
}

export interface IngestionDecisionRepository {
  saveDecision(decision: IngestionDecision): Promise<void>;
  listDecisions(projectId?: string): Promise<IngestionDecision[]>;
}

export interface Repositories
  extends ProjectRepository, EventRepository, IngestionDecisionRepository {}
