import type { TokenClaims } from '@vizoalica/event-contracts';
import { validateTokenConstraints } from '../auth/token-constraints.js';
import { authorizeSource } from '../auth/source-authorizer.js';
import { TokenVerifier, type TokenVerificationResult } from '../auth/token-verifier.js';
import type {
  IngestionDecision,
  Project,
  RequestAnalyticsContext,
  Source,
  StoredEvent
} from '../domain/types.js';
import type { MetricsSink, SafeLogger } from '../observability/index.js';
import { InMemoryMetricsSink, consoleLogger } from '../observability/index.js';
import { recordIngestionDecision } from '../observability/metrics.js';
import { evaluateQuota } from '../quotas/quota-policy.js';
import type { Repositories } from '../storage/repositories.js';
import { validateEventBatch } from './event-validator.js';
import { applyPrivacyGuard } from './privacy-guard.js';

export interface PipelineRequest {
  body: string;
  publicSourceKey: string;
  origin?: string | null;
  authorization?: string | null;
  now?: Date;
  analyticsContext?: RequestAnalyticsContext;
}

export interface PipelineDependencies {
  repositories: Repositories;
  tokenSecret: string;
  metrics?: MetricsSink;
  logger?: SafeLogger;
  allowUnsignedDemo?: boolean;
  verifyAuthorization?: (header: string | null | undefined) => Promise<TokenVerificationResult>;
}

export interface PipelineResult {
  status: number;
  decision: IngestionDecision;
}

function reject(
  status: number,
  reason: string,
  project?: Project,
  source?: Source
): PipelineResult {
  const decision: IngestionDecision = {
    decision: status === 429 ? 'throttled' : 'rejected',
    reasonCodes: [reason],
    acceptedCount: 0,
    rejectedCount: 0,
    receivedAt: new Date()
  };
  if (project) decision.projectId = project.id;
  if (source) decision.sourceId = source.id;
  return { status, decision };
}

export async function ingestBatch(
  request: PipelineRequest,
  dependencies: PipelineDependencies
): Promise<PipelineResult> {
  const metrics = dependencies.metrics ?? new InMemoryMetricsSink();
  const logger = dependencies.logger ?? consoleLogger;
  const validation = validateEventBatch(request.body, request.now);
  if (!validation.ok) return reject(400, validation.reason);

  const token = dependencies.verifyAuthorization
    ? await dependencies.verifyAuthorization(request.authorization)
    : new TokenVerifier(dependencies.tokenSecret).verifyAuthorizationHeader(request.authorization);
  let claims: TokenClaims | undefined;
  if (token.ok) claims = token.verified.claims;

  const authzInput: Parameters<typeof authorizeSource>[0] = {
    repositories: dependencies.repositories,
    publicSourceKey: request.publicSourceKey
  };
  if (request.origin !== undefined) authzInput.origin = request.origin;
  if (claims) authzInput.claims = claims;
  const authz = await authorizeSource(authzInput);
  if (!authz.ok) return reject(403, authz.reason);

  const { project, source } = authz;
  if (!token.ok && !(dependencies.allowUnsignedDemo && project.mode === 'demo'))
    return reject(401, token.reason, project, source);

  if (claims) {
    const constraintInput: Parameters<typeof validateTokenConstraints>[0] = {
      claims,
      eventCount: validation.events.length
    };
    if (request.now) constraintInput.now = request.now;
    if (request.origin !== undefined) constraintInput.origin = request.origin;
    const constraints = validateTokenConstraints(constraintInput);
    if (!constraints.ok) return reject(401, constraints.reason, project, source);
  }

  const privacy = applyPrivacyGuard(validation.events);
  if (!privacy.ok) return reject(400, privacy.reason, project, source);

  const policy = await dependencies.repositories.findQuotaPolicy(
    source.quotaPolicyId ?? project.quotaPolicyId
  );
  if (!policy) return reject(403, 'quota_policy_not_found', project, source);
  const quotaInput: Parameters<typeof evaluateQuota>[0] = {
    policy,
    requestBytes: new TextEncoder().encode(request.body).byteLength,
    eventCount: validation.events.length
  };
  if (claims?.max_events !== undefined) quotaInput.tokenMaxEvents = claims.max_events;
  const quota = evaluateQuota(quotaInput);
  if (!quota.ok)
    return reject(quota.reason === 'request_too_large' ? 413 : 429, quota.reason, project, source);

  if (dependencies.repositories.reserveQuota) {
    const reserved = await dependencies.repositories.reserveQuota({
      projectId: project.id,
      sourceId: source.id,
      eventCount: validation.events.length,
      requestBytes: quotaInput.requestBytes,
      maxEventsPerSecond: policy.maxEventsPerSecond,
      maxEventsPerDay: policy.maxEventsPerDay,
      now: request.now ?? new Date()
    });
    if (!reserved) return reject(429, 'project_quota_exceeded', project, source);
  }

  const trustLevel = claims ? 'signed-session' : 'unsigned-demo';
  const storedEvents: StoredEvent[] = privacy.events.map((event) => ({
    projectId: project.id,
    sourceId: source.id,
    trustLevel,
    consentState: event.vizoalicaconsent ?? claims?.consent_state ?? 'unknown',
    event: {
      ...event,
      vizoalicaproject: project.id,
      vizoalicasource: source.id,
      vizoalicaauth: trustLevel
    },
    receivedAt: request.now ?? new Date()
  }));
  await dependencies.repositories.saveAcceptedEvents(storedEvents);
  const analyticsContext = request.analyticsContext
    ? {
        ...request.analyticsContext,
        ...(claims?.visitor_id ? { projectVisitorId: claims.visitor_id } : {})
      }
    : undefined;
  await dependencies.repositories.recordDashboardRollups?.(storedEvents, analyticsContext);

  const decision: IngestionDecision = {
    decision: 'accepted',
    reasonCodes: [],
    acceptedCount: storedEvents.length,
    rejectedCount: 0,
    projectId: project.id,
    sourceId: source.id,
    receivedAt: request.now ?? new Date()
  };
  await dependencies.repositories.saveDecision(decision);
  recordIngestionDecision(metrics, decision);
  logger.info('ingestion batch accepted', {
    project_id: project.id,
    source_id: source.id,
    accepted_count: storedEvents.length
  });
  return { status: 202, decision };
}
