export type Window = '24h' | '7d' | '30d';
export type Project = { id: string; name: string; websiteCount?: number };
export type Website = {
  id: string;
  projectId: string;
  name: string;
  publicSourceKey: string;
  allowedOrigins: string[];
  status: 'active' | 'disabled' | 'deleted';
};
export type Summary = {
  projectId: string;
  websiteId: string;
  window: Window;
  pageViews?: number;
  uniqueUsers?: number;
  availability: 'complete' | 'processing' | 'unavailable';
  startUtc: string;
  endUtc: string;
  lastCompletedAggregateAt?: string;
};
export type Integration = {
  projectId?: string;
  sourceId?: string;
  publicSourceKey: string;
  allowedOrigins: string[];
  tokenIssuer: 'website-owned';
  html?: string;
};
export type Status = {
  collection: 'healthy' | 'disabled';
  aggregation: 'available' | 'processing' | 'unavailable';
  configuration?: 'healthy' | 'attention';
  dataAccess: 'available' | 'unavailable';
};
export type CountItem = { label: string; count: number };
export type RankedResult = { items: CountItem[]; otherCount: number; total: number };
export type DistributionResult = { items: CountItem[]; total: number };
export type AnalyticsOverview = {
  scope: {
    projectId: string;
    sourceId: string | null;
    label: string;
    identityMode: 'source-local' | 'project-supplied' | 'mixed';
  };
  range: { startUtc: string; endUtc: string; interval: 'hour' | 'day'; timezone: 'UTC' };
  totals: { pageViews: number; uniqueUsers: number };
  trend: Array<{ startUtc: string; pageViews: number; uniqueUsers: number }>;
  rankings: {
    pagePaths: RankedResult;
    countries: RankedResult;
    userAgents: RankedResult;
    referrers: RankedResult;
  };
  distributions: {
    operatingSystems: DistributionResult;
    browsers: DistributionResult;
    devices: DistributionResult;
    traffic: DistributionResult;
  };
  availability: {
    state: 'complete' | 'incomplete' | 'processing' | 'unavailable';
    lastCompletedAt?: string;
    availableFromUtc?: string;
    taxonomyVersions: number[];
  };
};

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly recovery?: string
  ) {
    super(
      code === 'access_revoked' || code === 'session_expired'
        ? 'Access expired'
        : code === 'remote_unavailable'
          ? 'Service unavailable'
          : 'Request could not be completed'
    );
  }
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: { accept: 'application/json', ...init?.headers }
  });
  if (!response.ok) {
    const details = (await response.json().catch(() => ({}))) as {
      error?: string;
      recovery?: string;
    };
    throw new ApiError(details.error ?? 'request_failed', response.status, details.recovery);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined
    ? {}
    : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
});
export const bootstrapSession = () => request<void>('/api/session', { method: 'POST' });
export const listProjects = () => request<Project[]>('/api/projects');
export const createProject = (name: string) =>
  request<Project>('/api/projects', json('POST', { name }));
export const listWebsites = (projectId: string) =>
  request<Website[]>(`/api/projects/${encodeURIComponent(projectId)}/websites`);
export const createWebsite = (
  projectId: string,
  input: { name: string; allowedOrigins: string[] }
) =>
  request<Website>(`/api/projects/${encodeURIComponent(projectId)}/websites`, json('POST', input));
export const updateWebsite = (
  projectId: string,
  websiteId: string,
  input: Partial<Pick<Website, 'name' | 'allowedOrigins' | 'status'>>
) =>
  request<Website>(
    `/api/projects/${encodeURIComponent(projectId)}/websites/${encodeURIComponent(websiteId)}`,
    json('PATCH', input)
  );
export const deleteWebsite = (projectId: string, websiteId: string) =>
  request<{ status: 'deleted'; audit: 'recorded' }>(
    `/api/projects/${encodeURIComponent(projectId)}/websites/${encodeURIComponent(websiteId)}`,
    json('DELETE')
  );
export const getSnippet = (projectId: string, websiteId: string) =>
  request<Integration>(
    `/api/projects/${encodeURIComponent(projectId)}/websites/${encodeURIComponent(websiteId)}/snippet`
  );
export const getStatus = (projectId: string, websiteId: string) =>
  request<Status>(
    `/api/projects/${encodeURIComponent(projectId)}/websites/${encodeURIComponent(websiteId)}/status`
  );
export const getAnalytics = (projectId: string, websiteId: string, window: Window) =>
  request<Summary>(
    `/api/projects/${encodeURIComponent(projectId)}/websites/${encodeURIComponent(websiteId)}/analytics?window=${window}`
  );
export const getAnalyticsOverview = (
  projectId: string,
  sourceId: string | undefined,
  startUtc: string,
  endUtc: string,
  signal?: AbortSignal
) => {
  const query = new URLSearchParams({ start: startUtc, end: endUtc });
  if (sourceId) query.set('source_id', sourceId);
  return request<AnalyticsOverview>(
    `/api/projects/${encodeURIComponent(projectId)}/analytics?${query.toString()}`,
    signal ? { signal } : undefined
  );
};

export type Theme = 'light' | 'dark';
export type ThemePreferenceResult = { theme: Theme | null; updatedAt?: string };
export const getThemePreference = () => request<ThemePreferenceResult>('/api/preferences/theme');
export const putThemePreference = (theme: Theme) =>
  request<{ theme: Theme; updatedAt: string }>('/api/preferences/theme', json('PUT', { theme }));
