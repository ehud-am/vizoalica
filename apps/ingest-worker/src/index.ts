import { InMemoryMetricsSink } from '../../ingest-api/src/observability/index.js';
import { loadWorkerConfig } from './config.js';
import type { Env } from './env.js';
import { workerLogger } from './observability.js';
import { createWorkerTokenVerifier } from './auth/token-verifier.js';
import { D1Repositories } from './storage/d1-repositories.js';
import { R2EventBatchRepository } from './storage/r2-event-batches.js';
import { handleWorkerRequest } from './http/worker-adapter.js';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const config = loadWorkerConfig(env);
    const configuration = new D1Repositories(
      env.VIZOALICA_DB,
      env.VIZOALICA_ANALYTICS_DIGEST_SECRET
    );
    const events = new R2EventBatchRepository(env.VIZOALICA_EVENTS);
    const repositories = {
      findProject: configuration.findProject.bind(configuration),
      findSourceByPublicKey: configuration.findSourceByPublicKey.bind(configuration),
      findQuotaPolicy: configuration.findQuotaPolicy.bind(configuration),
      createQuotaPolicy: configuration.createQuotaPolicy.bind(configuration),
      createProject: configuration.createProject.bind(configuration),
      listProjects: configuration.listProjects.bind(configuration),
      setProjectStatus: configuration.setProjectStatus.bind(configuration),
      createSource: configuration.createSource.bind(configuration),
      listSources: configuration.listSources.bind(configuration),
      setSourceStatus: configuration.setSourceStatus.bind(configuration),
      updateSource: configuration.updateSource.bind(configuration),
      getSource: configuration.getSource.bind(configuration),
      getPageViewCounts: configuration.getPageViewCounts.bind(configuration),
      getAnalyticsSummary: configuration.getAnalyticsSummary.bind(configuration),
      getAnalyticsOverview: configuration.getAnalyticsOverview.bind(configuration),
      deleteExpiredDashboardData: configuration.deleteExpiredDashboardData.bind(configuration),
      saveAdminAudit: configuration.saveAdminAudit.bind(configuration),
      saveDecision: configuration.saveDecision.bind(configuration),
      listDecisions: configuration.listDecisions.bind(configuration),
      reserveQuota: configuration.reserveQuota.bind(configuration),
      recordDashboardRollups: configuration.recordDashboardRollups.bind(configuration),
      saveAcceptedEvents: events.saveAcceptedEvents.bind(events),
      listAcceptedEvents: events.listAcceptedEvents.bind(events)
    };
    return handleWorkerRequest(
      request,
      {
        repositories,
        tokenSecret: env.VIZOALICA_TOKEN_SECRET,
        adminSecret: env.VIZOALICA_ADMIN_SECRET,
        adminRepositories: repositories,
        verifyAuthorization: createWorkerTokenVerifier(env.VIZOALICA_TOKEN_SECRET),
        allowUnsignedDemo: config.allowUnsignedDemo,
        metrics: new InMemoryMetricsSink(),
        logger: workerLogger
      },
      config.maxRequestBytes
    );
  },
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    const config = loadWorkerConfig(env);
    const repositories = new D1Repositories(
      env.VIZOALICA_DB,
      env.VIZOALICA_ANALYTICS_DIGEST_SECRET
    );
    const before = new Date(Date.now() - 32 * 24 * 60 * 60 * 1000);
    before.setUTCSeconds(0, 0);
    await repositories.deleteExpiredDashboardData(before.toISOString());
    void config;
  }
};
