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
    const configuration = new D1Repositories(env.VIZOALICA_DB);
    const events = new R2EventBatchRepository(env.VIZOALICA_EVENTS);
    const repositories = {
      findProject: configuration.findProject.bind(configuration),
      findSourceByPublicKey: configuration.findSourceByPublicKey.bind(configuration),
      findQuotaPolicy: configuration.findQuotaPolicy.bind(configuration),
      saveDecision: configuration.saveDecision.bind(configuration),
      listDecisions: configuration.listDecisions.bind(configuration),
      reserveQuota: configuration.reserveQuota.bind(configuration),
      recordDashboardRollups: configuration.recordDashboardRollups.bind(configuration),
      saveAcceptedEvents: events.saveAcceptedEvents.bind(events),
      listAcceptedEvents: events.listAcceptedEvents.bind(events)
    };
    return handleWorkerRequest(request, {
      repositories,
      tokenSecret: env.VIZOALICA_TOKEN_SECRET,
      verifyAuthorization: createWorkerTokenVerifier(env.VIZOALICA_TOKEN_SECRET),
      allowUnsignedDemo: config.allowUnsignedDemo,
      metrics: new InMemoryMetricsSink(),
      logger: workerLogger
    }, config.maxRequestBytes);
  }
};
