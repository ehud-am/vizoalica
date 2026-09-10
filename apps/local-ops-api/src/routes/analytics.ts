import type { AnalyticsOverview, AnalyticsSummary } from '../contracts.js';
import { isAnalyticsWindow, isSafeId } from '../contracts.js';
import { WorkerClient } from '../remote-client/worker-client.js';
import { parseAnalyticsRange } from '../../../ingest-api/src/analytics/range.js';
export async function analytics(
  client: WorkerClient,
  projectId: string,
  websiteId: string,
  window: string | null
): Promise<AnalyticsSummary> {
  if (!isAnalyticsWindow(window)) throw new Error('invalid_window');
  if (!isSafeId(projectId) || !isSafeId(websiteId)) throw new Error('invalid_request');
  const response = await client.request(
    `/v1/admin/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(websiteId)}/analytics?window=${window}`
  );
  if (response.status === 401 || response.status === 403) throw new Error('unauthorized');
  if (response.status === 404) throw new Error('not_found');
  if (response.status === 400) throw new Error('invalid_request');
  if (!response.ok) throw new Error('unavailable');
  const result = (await response.json()) as AnalyticsSummary;
  return {
    projectId,
    websiteId,
    window,
    startUtc: result.startUtc,
    endUtc: result.endUtc,
    availability: result.availability,
    ...(result.pageViews !== undefined ? { pageViews: result.pageViews } : {}),
    ...(result.uniqueUsers !== undefined ? { uniqueUsers: result.uniqueUsers } : {}),
    ...(result.lastCompletedAggregateAt !== undefined
      ? { lastCompletedAggregateAt: result.lastCompletedAggregateAt }
      : {})
  };
}

export async function analyticsOverview(
  client: WorkerClient,
  projectId: string,
  sourceId: string | undefined,
  startUtc: string,
  endUtc: string
): Promise<AnalyticsOverview> {
  if (!isSafeId(projectId) || (sourceId !== undefined && !isSafeId(sourceId)))
    throw new Error('invalid_request');
  const range = parseAnalyticsRange(startUtc, endUtc);
  const query = new URLSearchParams({ start: range.startUtc, end: range.endUtc });
  if (sourceId) query.set('source_id', sourceId);
  const response = await client.request(
    `/v1/admin/projects/${encodeURIComponent(projectId)}/analytics?${query.toString()}`
  );
  if (response.status === 401 || response.status === 403) throw new Error('unauthorized');
  if (response.status === 404) throw new Error('not_found');
  if (response.status === 400) throw new Error('invalid_range');
  if (!response.ok) throw new Error('unavailable');
  return (await response.json()) as AnalyticsOverview;
}
