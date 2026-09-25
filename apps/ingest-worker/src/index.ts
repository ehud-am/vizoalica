import { InMemoryMetricsSink } from '../../ingest-api/src/observability/index.js';
import { loadWorkerConfig } from './config.js';
import type { Env } from './env.js';
import { workerLogger } from './observability.js';
import { createWorkerTokenVerifier } from './auth/token-verifier.js';
import { D1Repositories } from './storage/d1-repositories.js';
import { purgeDeleted } from './storage/purge-deleted.js';
import { R2EventBatchRepository } from './storage/r2-event-batches.js';
import { handleWorkerRequest } from './http/worker-adapter.js';
import { readHealth, readSchemaVersion } from './schema-version.js';
import { workerVersion } from './version.js';

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
      getActionsReport: configuration.getActionsReport.bind(configuration),
      deleteExpiredDashboardData: configuration.deleteExpiredDashboardData.bind(configuration),
      saveAdminAudit: configuration.saveAdminAudit.bind(configuration),
      saveDecision: configuration.saveDecision.bind(configuration),
      listDecisions: configuration.listDecisions.bind(configuration),
      reserveQuota: configuration.reserveQuota.bind(configuration),
      recordDashboardRollups: configuration.recordDashboardRollups.bind(configuration),
      saveAcceptedEvents: events.saveAcceptedEvents.bind(events),
      listAcceptedEvents: events.listAcceptedEvents.bind(events),
      createAccessKey: configuration.createAccessKey.bind(configuration),
      listAccessKeys: configuration.listAccessKeys.bind(configuration),
      findAccessKeyById: configuration.findAccessKeyById.bind(configuration),
      revokeAccessKey: configuration.revokeAccessKey.bind(configuration),
      countActiveAccessKeys: configuration.countActiveAccessKeys.bind(configuration),
      hasAccessKeysTable: configuration.hasAccessKeysTable.bind(configuration)
    };
    return handleWorkerRequest(
      request,
      {
        repositories,
        tokenSecret: env.VIZOALICA_TOKEN_SECRET,
        adminSecret: env.VIZOALICA_ADMIN_SECRET,
        adminRepositories: repositories,
        purgeDeleted: (dryRun) =>
          purgeDeleted({ repositories: configuration, bucket: env.VIZOALICA_EVENTS, dryRun }),
        verifyAuthorization: createWorkerTokenVerifier(env.VIZOALICA_TOKEN_SECRET),
        allowUnsignedDemo: config.allowUnsignedDemo,
        metrics: new InMemoryMetricsSink(),
        logger: workerLogger,
        backendInfo: async () => ({
          workerVersion: workerVersion(env),
          schema: await readSchemaVersion(env.VIZOALICA_DB),
          health: await readHealth(env.VIZOALICA_DB, env.VIZOALICA_EVENTS)
        }),
        ...(env.VIZOALICA_INGEST_LIMITER ? { rateLimiter: env.VIZOALICA_INGEST_LIMITER } : {})
      },
      config.maxRequestBytes
    );
  },
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    // Fails closed on a missing or weak binding, like a request does.
    loadWorkerConfig(env);
    const repositories = new D1Repositories(
      env.VIZOALICA_DB,
      env.VIZOALICA_ANALYTICS_DIGEST_SECRET
    );
    const before = new Date(Date.now() - 32 * 24 * 60 * 60 * 1000);
    before.setUTCSeconds(0, 0);
    await repositories.deleteExpiredDashboardData(before.toISOString());
    // Deletion is terminal, so whatever operators deleted is physically removed on the next run.
    // A run that hits its operation budget resumes on the next one.
    const purged = await purgeDeleted({
      repositories,
      bucket: env.VIZOALICA_EVENTS,
      dryRun: false
    });
    if (purged.objects + Object.values(purged.rows).reduce((sum, count) => sum + count, 0) > 0)
      await repositories.saveAdminAudit({
        operation: 'purge_deleted',
        outcome: 'allowed',
        reasonCode: purged.complete ? 'purged' : 'partial'
      });
  }
};
