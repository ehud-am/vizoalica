import type { ActionsReport, AnalyticsOverview, AnalyticsSummary } from '../contracts.js';
import { isAnalyticsWindow, isSafeId } from '../contracts.js';
import { WorkerClient } from '../remote-client/worker-client.js';
import {
  AnalyticsRangeError,
  parseAnalyticsRange
} from '../../../ingest-api/src/analytics/range.js';
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
  if (response.status === 400) {
    const body = (await response.json().catch(() => undefined)) as
      { field?: unknown; message?: unknown } | undefined;
    throw new AnalyticsRangeError(
      body?.field === 'start' ? 'start' : 'end',
      typeof body?.message === 'string' ? body.message : 'Invalid time range.'
    );
  }
  if (!response.ok) throw new Error('unavailable');
  return (await response.json()) as AnalyticsOverview;
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export interface ActionsFilterInput {
  page?: string;
  action?: string;
}

export async function analyticsActions(
  client: WorkerClient,
  projectId: string,
  sourceId: string | undefined,
  startUtc: string,
  endUtc: string,
  filters: ActionsFilterInput = {}
): Promise<ActionsReport> {
  if (!isSafeId(projectId) || (sourceId !== undefined && !isSafeId(sourceId)))
    throw new Error('invalid_request');
  const range = parseAnalyticsRange(startUtc, endUtc);
  const query = new URLSearchParams({ start: range.startUtc, end: range.endUtc });
  if (sourceId) query.set('source_id', sourceId);
  // The same limits the Worker enforces, so a bad value never travels further than this process.
  for (const [name, limit] of [
    ['page', 1024],
    ['action', 80]
  ] as const) {
    const value = filters[name];
    if (!value) continue;
    if (value.length > limit || CONTROL_CHARACTERS.test(value)) throw new Error('invalid_request');
    query.set(name, value);
  }
  const response = await client.request(
    `/v1/admin/projects/${encodeURIComponent(projectId)}/analytics/actions?${query.toString()}`
  );
  if (response.status === 401 || response.status === 403) throw new Error('unauthorized');
  if (response.status === 404) throw new Error('not_found');
  if (response.status === 400) {
    const body = (await response.json().catch(() => undefined)) as
      { error?: unknown; field?: unknown; message?: unknown } | undefined;
    if (body?.error === 'invalid_range')
      throw new AnalyticsRangeError(
        body.field === 'start' ? 'start' : 'end',
        typeof body.message === 'string' ? body.message : 'Invalid time range.'
      );
    throw new Error('invalid_request');
  }
  if (!response.ok) throw new Error('unavailable');
  return (await response.json()) as ActionsReport;
}
