import { eventsBatchResponse } from '../../ingest-api/src/http/events.js';
import { healthResponse } from '../../ingest-api/src/http/health.js';
import { InMemoryMetricsSink } from '../../ingest-api/src/observability/index.js';
import { loadWorkerConfig } from './config.js';
import type { Env } from './env.js';
import { workerLogger } from './observability.js';
import { createWorkerTokenVerifier } from './auth/token-verifier.js';
import { D1Repositories } from './storage/d1-repositories.js';
import { R2EventBatchRepository } from './storage/r2-event-batches.js';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/healthz') return healthResponse();
    if (request.method !== 'POST' || url.pathname !== '/v1/events:batch')
      return Response.json({ error: 'not_found' }, { status: 404 });
    const config = loadWorkerConfig(env);
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > config.maxRequestBytes)
      return Response.json({ error: 'request_too_large' }, { status: 413 });
    const configuration = new D1Repositories(env.VIZOALICA_DB);
    const events = new R2EventBatchRepository(env.VIZOALICA_EVENTS);
    const repositories = {
      findProject: configuration.findProject.bind(configuration),
      findSourceByPublicKey: configuration.findSourceByPublicKey.bind(configuration),
      findQuotaPolicy: configuration.findQuotaPolicy.bind(configuration),
      saveDecision: configuration.saveDecision.bind(configuration),
      listDecisions: configuration.listDecisions.bind(configuration),
      saveAcceptedEvents: events.saveAcceptedEvents.bind(events),
      listAcceptedEvents: events.listAcceptedEvents.bind(events)
    };
    return eventsBatchResponse(request, {
      repositories,
      tokenSecret: env.VIZOALICA_TOKEN_SECRET,
      verifyAuthorization: createWorkerTokenVerifier(env.VIZOALICA_TOKEN_SECRET),
      allowUnsignedDemo: config.allowUnsignedDemo,
      metrics: new InMemoryMetricsSink(),
      logger: workerLogger
    });
  }
};
