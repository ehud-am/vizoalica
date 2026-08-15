import type {
  IngestionDecision,
  Project,
  QuotaPolicy,
  Source,
  StoredEvent
} from '../domain/types.js';
import type { Repositories } from './repositories.js';

export class InMemoryRepositories implements Repositories {
  private readonly projects = new Map<string, Project>();
  private readonly sources = new Map<string, Source>();
  private readonly quotaPolicies = new Map<string, QuotaPolicy>();
  private readonly events: StoredEvent[] = [];
  private readonly decisions: IngestionDecision[] = [];

  constructor(seed?: { projects?: Project[]; sources?: Source[]; quotaPolicies?: QuotaPolicy[] }) {
    for (const project of seed?.projects ?? []) this.projects.set(project.id, project);
    for (const source of seed?.sources ?? []) this.sources.set(source.publicSourceKey, source);
    for (const policy of seed?.quotaPolicies ?? []) this.quotaPolicies.set(policy.id, policy);
  }

  async findProject(id: string): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async findSourceByPublicKey(publicSourceKey: string): Promise<Source | undefined> {
    return this.sources.get(publicSourceKey);
  }

  async findQuotaPolicy(id: string): Promise<QuotaPolicy | undefined> {
    return this.quotaPolicies.get(id);
  }

  async saveAcceptedEvents(events: StoredEvent[]): Promise<void> {
    this.events.push(...events);
  }

  async listAcceptedEvents(projectId?: string): Promise<StoredEvent[]> {
    return projectId
      ? this.events.filter((event) => event.projectId === projectId)
      : [...this.events];
  }

  async saveDecision(decision: IngestionDecision): Promise<void> {
    this.decisions.push(decision);
  }

  async listDecisions(projectId?: string): Promise<IngestionDecision[]> {
    return projectId
      ? this.decisions.filter((decision) => decision.projectId === projectId)
      : [...this.decisions];
  }
}
