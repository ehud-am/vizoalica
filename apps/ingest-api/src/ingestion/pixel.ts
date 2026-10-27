import type { CloudEvent, PageViewData } from '@vizoalica/event-contracts';
import type { RequestAnalyticsContext, StoredEvent } from '../domain/types.js';
import { authorizeSource } from '../auth/source-authorizer.js';
import { evaluateQuota } from '../quotas/quota-policy.js';
import type { Repositories } from '../storage/repositories.js';
import { isExcluded } from './address-match.js';
import { applyPrivacyGuard } from './privacy-guard.js';

export const MAX_PIXEL_PATH_LENGTH = 512;

export interface PixelRequest {
  /** The website key, the same public value a script tag carries. */
  publicSourceKey: string;
  /** The page key to count the view under, such as `/npm/vizoalica`. */
  path: string;
  /** The origin of the Worker itself: an image request has no page origin of its own. */
  workerOrigin: string;
  clientAddress?: string | null;
  analyticsContext?: RequestAnalyticsContext;
  now?: Date;
}

/** A path that is not a plain page key is ignored rather than cleaned, so a typo never counts. */
export function validPixelPath(path: string): boolean {
  return (
    path.startsWith('/') &&
    path.length <= MAX_PIXEL_PATH_LENGTH &&
    !/[?#\u0000-\u001F\u007F]/.test(path)
  );
}

/**
 * Counts one page view from the no-JavaScript pixel. It never reports why a hit was not counted:
 * the caller answers every request with the same image, so the endpoint reveals nothing about which
 * website keys exist or which have the pixel on.
 */
export async function countPixelHit(
  request: PixelRequest,
  dependencies: { repositories: Repositories }
): Promise<boolean> {
  if (!validPixelPath(request.path)) return false;
  const { repositories } = dependencies;
  // No origin is passed: an image request has none, which is why the pixel is opt-in.
  const authz = await authorizeSource({ repositories, publicSourceKey: request.publicSourceKey });
  if (!authz.ok) return false;
  const { project, source } = authz;
  if (source.pixelEnabled !== true) return false;

  const now = request.now ?? new Date();
  if (
    source.excludedAddresses?.length &&
    isExcluded(request.clientAddress, source.excludedAddresses)
  ) {
    await repositories
      .recordExcludedHits?.({ projectId: project.id, sourceId: source.id, eventCount: 1, now })
      .catch(() => undefined);
    return false;
  }

  const event: CloudEvent<PageViewData> = {
    specversion: '1.0',
    id: `evt_${crypto.randomUUID()}`,
    type: 'com.vizoalica.page_view.v1',
    source: request.workerOrigin,
    subject: `source/${source.publicSourceKey}/pixel`,
    time: now.toISOString(),
    datacontenttype: 'application/json',
    vizoalicaproject: project.id,
    vizoalicasource: source.id,
    vizoalicaauth: 'pixel',
    vizoalicaconsent: 'unknown',
    data: {
      page: { url_origin: request.workerOrigin, url_path: request.path, url_query_redacted: true },
      // Only a fallback: the Worker's daily identifier replaces it when it has the sender's address.
      visitor: { anonymous_id: `anon_${crypto.randomUUID()}` },
      session: { id: 'pixel' }
    }
  };
  const privacy = applyPrivacyGuard([event]);
  if (!privacy.ok) return false;

  const policy = await repositories.findQuotaPolicy(source.quotaPolicyId ?? project.quotaPolicyId);
  if (!policy) return false;
  const requestBytes = new TextEncoder().encode(JSON.stringify(event)).byteLength;
  if (!evaluateQuota({ policy, requestBytes, eventCount: 1 }).ok) return false;
  if (
    repositories.reserveQuota &&
    !(await repositories.reserveQuota({
      projectId: project.id,
      sourceId: source.id,
      eventCount: 1,
      requestBytes,
      maxEventsPerSecond: policy.maxEventsPerSecond,
      maxEventsPerDay: policy.maxEventsPerDay,
      now
    }))
  )
    return false;

  const stored: StoredEvent[] = privacy.events.map((item) => ({
    projectId: project.id,
    sourceId: source.id,
    trustLevel: 'pixel',
    consentState: 'unknown',
    event: item,
    receivedAt: now
  }));
  await repositories.saveAcceptedEvents(stored);
  await repositories.recordDashboardRollups?.(stored, request.analyticsContext);
  return true;
}
