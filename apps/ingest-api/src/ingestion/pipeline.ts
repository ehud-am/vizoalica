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
import { isExcluded } from './address-match.js';
import { dayVisitorToken, isLearnWindowOpen, type LearnWindow } from './learn-window.js';
import { PAGE_STRUCTURE_EVENT_TYPE } from './page-structure.js';
import { applyPrivacyGuard } from './privacy-guard.js';

export interface PipelineRequest {
  body: string;
  publicSourceKey: string;
  origin?: string | null;
  authorization?: string | null;
  now?: Date;
  analyticsContext?: RequestAnalyticsContext;
  /**
   * The sender's address, used only to match the website's excluded addresses. It is never stored,
   * logged or returned.
   */
  clientAddress?: string | null;
}

export interface PipelineDependencies {
  repositories: Repositories;
  tokenSecret: string;
  metrics?: MetricsSink;
  logger?: SafeLogger;
  allowUnsignedDemo?: boolean;
  /** The learning window; page structure events are dropped outside it (and always when unset). */
  learnWindow?: LearnWindow | undefined;
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
  // An unsigned batch can only be accepted with no token at all and from a browser origin (a static
  // website), or through the unsigned-demo bypass. Anything else is refused before any D1 lookup,
  // so that traffic costs no database reads. A token that is present but invalid is never
  // downgraded to an unsigned batch.
  const unsigned = !token.ok && token.reason === 'missing_token';
  if (!token.ok && !dependencies.allowUnsignedDemo && !(unsigned && request.origin))
    return reject(401, token.reason);
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
  // authorizeSource has already matched the origin against the website's allowed origins.
  const staticSite = unsigned && !!request.origin && source.tokenRequired === false;
  const demo = !!dependencies.allowUnsignedDemo && project.mode === 'demo';
  if (!token.ok && !staticSite && !demo) return reject(401, token.reason, project, source);

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

  // Internal traffic is dropped only after the sender proved it may write to this website, so a
  // forged request learns nothing and cannot touch the counter. It costs no quota and stores nothing.
  if (
    source.excludedAddresses?.length &&
    isExcluded(request.clientAddress, source.excludedAddresses)
  ) {
    const now = request.now ?? new Date();
    await dependencies.repositories
      .recordExcludedHits?.({
        projectId: project.id,
        sourceId: source.id,
        eventCount: validation.events.length,
        now
      })
      // The count is for transparency; failing to record it must not turn a dropped batch into an error.
      .catch(() => logger.warn('excluded hits could not be counted', { source_id: source.id }));
    const decision: IngestionDecision = {
      decision: 'excluded',
      reasonCodes: ['excluded_address'],
      acceptedCount: 0,
      rejectedCount: 0,
      projectId: project.id,
      sourceId: source.id,
      receivedAt: now
    };
    recordIngestionDecision(metrics, decision);
    return { status: 202, decision };
  }

  // Page structure is accepted only while the learning window is open. A batch may mix it with
  // other events, so it is filtered out instead of rejecting the whole batch.
  const windowOpen = isLearnWindowOpen(dependencies.learnWindow, request.now ?? new Date());
  // Page structure is kept only inside the window and never for a visitor who denied analytics,
  // whatever the sender claims.
  const accepted = validation.events.filter(
    (event) =>
      event.type !== PAGE_STRUCTURE_EVENT_TYPE ||
      (windowOpen && event.vizoalicaconsent !== 'analytics-denied')
  );
  if (accepted.length === 0) {
    const decision: IngestionDecision = {
      decision: 'accepted',
      reasonCodes: ['learning_window_closed'],
      acceptedCount: 0,
      rejectedCount: validation.events.length,
      projectId: project.id,
      sourceId: source.id,
      receivedAt: request.now ?? new Date()
    };
    return { status: 202, decision };
  }

  const privacy = applyPrivacyGuard(accepted, source.groupingRules);
  if (!privacy.ok) return reject(400, privacy.reason, project, source);

  const policy = await dependencies.repositories.findQuotaPolicy(
    source.quotaPolicyId ?? project.quotaPolicyId
  );
  if (!policy) return reject(403, 'quota_policy_not_found', project, source);
  const quotaInput: Parameters<typeof evaluateQuota>[0] = {
    policy,
    requestBytes: new TextEncoder().encode(request.body).byteLength,
    eventCount: accepted.length
  };
  if (claims?.max_events !== undefined) quotaInput.tokenMaxEvents = claims.max_events;
  const quota = evaluateQuota(quotaInput);
  if (!quota.ok)
    return reject(quota.reason === 'request_too_large' ? 413 : 429, quota.reason, project, source);

  if (dependencies.repositories.reserveQuota) {
    const reserved = await dependencies.repositories.reserveQuota({
      projectId: project.id,
      sourceId: source.id,
      eventCount: accepted.length,
      requestBytes: quotaInput.requestBytes,
      maxEventsPerSecond: policy.maxEventsPerSecond,
      maxEventsPerDay: policy.maxEventsPerDay,
      now: request.now ?? new Date()
    });
    if (!reserved) return reject(429, 'project_quota_exceeded', project, source);
  }

  const trustLevel = claims ? 'signed-session' : staticSite ? 'origin-checked' : 'unsigned-demo';
  const visitorDay = windowOpen
    ? await dayVisitorToken(request.analyticsContext?.dailyVisitorId, source.id)
    : undefined;
  const storedEvents: StoredEvent[] = privacy.events.map((event) => {
    const consentState = event.vizoalicaconsent ?? claims?.consent_state ?? 'unknown';
    return {
      projectId: project.id,
      sourceId: source.id,
      trustLevel,
      consentState,
      event: {
        ...event,
        vizoalicaproject: project.id,
        vizoalicasource: source.id,
        vizoalicaauth: trustLevel
      },
      receivedAt: request.now ?? new Date(),
      // Never for a visitor who denied analytics.
      ...(visitorDay && consentState !== 'analytics-denied' ? { visitorDay } : {})
    };
  });
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
