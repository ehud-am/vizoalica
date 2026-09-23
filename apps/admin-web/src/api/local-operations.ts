export type Project = {
  id: string;
  name: string;
  websiteCount?: number;
  status?: 'active' | 'deleted';
};
export type Website = {
  id: string;
  projectId: string;
  name: string;
  publicSourceKey: string;
  allowedOrigins: string[];
  status: 'active' | 'disabled' | 'deleted';
};
export type DynamicConfigV1 = {
  version: 1;
  src: string;
  'data-endpoint': string;
  'data-source': string;
  'data-project': string;
  'data-token-url': string;
  'data-consent': 'analytics-granted' | 'analytics-denied' | 'unknown';
};
export type StaticInstallation = { id: 'static'; snippet: string };
export type CloudflareGuidance = {
  workflowRef: string;
  repoVariables: Record<string, string>;
  accountSpecificVariables: string[];
  repoSecretNames: string[];
  starterWorkflowYaml: string;
  setupCommands: string[];
  warnings: string[];
};
export type DynamicInstallation = {
  id: 'dynamic';
  snippet: string;
  configUrl: '/vizoalica/config.json';
  config: DynamicConfigV1;
  cloudflare: CloudflareGuidance;
};
export type Integration = {
  projectId: string;
  sourceId: string;
  publicSourceKey: string;
  allowedOrigins: string[];
  modes: [StaticInstallation, DynamicInstallation];
  privateSetup: { tokenIssuer: 'website-owned'; tokenSecretRequired: true };
  /** Transitional compatibility alias; identical to modes[0].snippet. */
  html?: string;
};
export type Reachability = {
  configEndpointReachable: boolean;
  configEndpointCheckedAt: string;
  configEndpointError: string | null;
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

export type ActionKind = 'button' | 'link' | 'other';
export type ActionReportRow = {
  page: string;
  action: string;
  kind: ActionKind;
  /** Links only: origin plus path. */
  destination?: string;
  count: number;
  visitors: number;
  /** Views of `page` in the same range; 0 when the page has none. */
  pageViews: number;
};
export type ActionTotal = {
  action: string;
  kind: ActionKind;
  count: number;
  visitors: number;
  pages: number;
};
export type ActionsFilters = { page?: string; action?: string };
export type ActionsReport = {
  scope: AnalyticsOverview['scope'];
  range: AnalyticsOverview['range'];
  totals: { actions: number; uniqueUsers: number };
  rows: ActionReportRow[];
  /** What lies beyond `rows`; keeps the totals exact. */
  other: { rows: number; count: number };
  actions: ActionTotal[];
  selection?: { page?: { path: string; views: number; actions: number } };
  availability: AnalyticsOverview['availability'];
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
export const deleteProject = (projectId: string) =>
  request<{ status: 'deleted'; audit: 'recorded' }>(
    `/api/projects/${encodeURIComponent(projectId)}`,
    json('DELETE')
  );
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
export const getReachability = (projectId: string, websiteId: string) =>
  request<Reachability>(
    `/api/projects/${encodeURIComponent(projectId)}/websites/${encodeURIComponent(websiteId)}/reachability`
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

export const getAnalyticsActions = (
  projectId: string,
  sourceId: string | undefined,
  startUtc: string,
  endUtc: string,
  filters: ActionsFilters = {},
  signal?: AbortSignal
) => {
  const query = new URLSearchParams({ start: startUtc, end: endUtc });
  if (sourceId) query.set('source_id', sourceId);
  if (filters.page) query.set('page', filters.page);
  if (filters.action) query.set('action', filters.action);
  return request<ActionsReport>(
    `/api/projects/${encodeURIComponent(projectId)}/analytics/actions?${query.toString()}`,
    signal ? { signal } : undefined
  );
};

export type Theme = 'light' | 'dark';
export type ThemePreferenceResult = { theme: Theme | null; updatedAt?: string };
export const getThemePreference = () => request<ThemePreferenceResult>('/api/preferences/theme');
export const putThemePreference = (theme: Theme) =>
  request<{ theme: Theme; updatedAt: string }>('/api/preferences/theme', json('PUT', { theme }));

export type ViewRole = 'admin' | 'owner' | 'analyst';
export type RoleHint = 'admin' | 'website-owner' | 'analyst';
export type ConnectionStatus = 'none' | 'connected' | 'unreachable' | 'revoked' | 'incompatible';
export type StageId = 'console' | 'backend' | 'website' | 'data';
export type NextAction = { id: string; label: string; href?: string };
export type Stage = {
  id: StageId;
  label: string;
  status: 'done' | 'current' | 'todo' | 'blocked';
  next?: NextAction;
};
export type VersionStatus = {
  status: 'current' | 'update-available' | 'console-older' | 'unknown' | 'unsupported';
  message: string;
  update: 'backend' | 'console' | null;
};
export type SetupState = {
  version: string;
  needsFirstRun: boolean;
  connection: {
    status: ConnectionStatus;
    workerHost?: string;
    mode?: 'file' | 'onecli';
    roleHint?: RoleHint;
  };
  principal?: {
    role: ViewRole;
    scope: { projectId: string | null; sourceId: string | null };
    keyLabel: string | null;
    features: { accessKeys: boolean; versions: boolean };
  };
  backend?: {
    workerVersion: string | null;
    schema: { applied: number | null; expected: number | null };
    worker: VersionStatus;
    schemaStatus: VersionStatus;
    message: string;
  };
  stages: Stage[];
  notice?: 'administrator_secret_used' | 'role_corrected';
  /** A pre-0.7.0 single connection file waiting to be named and imported as the first environment. */
  legacySetup?: { workerHost: string; mode: 'file' | 'onecli' };
};
export const getSetupState = () => request<SetupState>('/api/setup/state');
export const connectBackend = (input: {
  workerUrl: string;
  credential: string;
  roleHint?: RoleHint;
}) => request<SetupState>('/api/setup/connect', json('POST', input));
export const disconnectBackend = () => request<SetupState>('/api/setup/disconnect', json('POST'));
export const setRoleHint = (roleHint: RoleHint) =>
  request<SetupState>('/api/setup/role', json('POST', { roleHint }));
export const importLegacySetup = (name: string) =>
  request<SetupState>('/api/setup/import-legacy', json('POST', { name }));

export type EnvironmentCloudflareCredential = { mode: 'token'; token: string } | { mode: 'onecli' };
export type EnvironmentSummary = {
  name: string;
  hasConnection: boolean;
  mode?: 'file' | 'onecli';
};
export type EnvironmentsList = { active: string | null; environments: EnvironmentSummary[] };
export const listEnvironments = () => request<EnvironmentsList>('/api/environments');
export const createEnvironment = (name: string, cloudflare?: EnvironmentCloudflareCredential) =>
  request<EnvironmentsList>('/api/environments', json('POST', { name, cloudflare }));
export const selectEnvironment = (name: string) =>
  request<SetupState>(`/api/environments/${encodeURIComponent(name)}/select`, json('POST'));
export const connectEnvironment = (
  name: string,
  input: { workerUrl: string; credential: string; roleHint?: RoleHint }
) =>
  request<SetupState>(`/api/environments/${encodeURIComponent(name)}/connect`, json('POST', input));
export const removeEnvironment = (name: string) =>
  request<EnvironmentsList>(
    `/api/environments/${encodeURIComponent(name)}`,
    json('DELETE', { confirm: true })
  );

export type AccessKeyRole = 'analyst' | 'owner';
export type AccessKeySummary = {
  id: string;
  label: string;
  role: AccessKeyRole;
  scope: { projectId: string | null; sourceId: string | null };
  createdAt: string;
  revokedAt: string | null;
};
export type IssuedAccessKey = AccessKeySummary & { key: string };
export const listAccessKeys = () => request<AccessKeySummary[]>('/api/access-keys');
export const issueAccessKey = (input: {
  label: string;
  role: AccessKeyRole;
  projectId?: string;
  sourceId?: string;
}) => request<IssuedAccessKey>('/api/access-keys', json('POST', input));
export const revokeAccessKey = (id: string) =>
  request<{ status: 'revoked' }>(`/api/access-keys/${encodeURIComponent(id)}`, json('DELETE'));

export type SetupDetails = {
  workerUrl: string;
  projectId: string;
  sourceId: string;
  publicSourceKey: string;
  allowedOrigins: string[];
  readKey: string;
  guidance: string;
};
export const shareWebsite = (projectId: string, websiteId: string, role: AccessKeyRole = 'owner') =>
  request<SetupDetails>(
    `/api/projects/${encodeURIComponent(projectId)}/websites/${encodeURIComponent(websiteId)}/share`,
    json('POST', { role })
  );

export type BackendState = {
  workerVersion: string | null;
  consoleVersion: string;
  schema: { applied: number | null; expected: number | null; appliedNames: string[] };
  worker: VersionStatus;
  schemaStatus: VersionStatus;
  health: { database: 'ok' | 'unavailable'; storage: 'ok' | 'unavailable' } | null;
  featuresAccessKeys: boolean;
};
export const getBackendState = () => request<BackendState>('/api/backend');

export type DeployPreflight = {
  environment: string;
  names: { worker: string; database: string; bucket: string };
  signedIn: boolean;
  accounts: Array<{ id: string; name: string }>;
  existing: { database: boolean; bucket: boolean };
};
export const getDeployPreflight = () => request<DeployPreflight>('/api/deploy/preflight');

export type DeployPlanResource = { kind: 'd1' | 'r2' | 'worker'; name: string; purpose: string };
export type DeployPlan = {
  id: string;
  mode: 'first-install' | 'update-backend';
  environment: string;
  names: { worker: string; database: string; bucket: string };
  accountId?: string;
  accountName?: string;
  resources: DeployPlanResource[];
  createdAt: string;
};
export const createDeployPlan = (input: { accountId?: string; accountName?: string } = {}) =>
  request<DeployPlan>('/api/deploy/plan', json('POST', input));

export type DeployStep = {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  error?: string;
};
export type DeployRun = {
  id: string;
  planId: string;
  mode: 'first-install' | 'update-backend';
  environment: string;
  names: { worker: string; database: string; bucket: string };
  status: 'running' | 'done' | 'failed';
  steps: DeployStep[];
  createdAt: string;
  finishedAt?: string;
  error?: string;
  result?: { workerUrl?: string; healthy?: boolean; secretNames?: string[] };
  canReveal?: boolean;
};
export const startDeployRun = (planId: string) =>
  request<DeployRun>('/api/deploy/runs', json('POST', { planId }));
export const getDeployRun = (runId: string) =>
  request<DeployRun>(`/api/deploy/runs/${encodeURIComponent(runId)}`);
export const resumeDeployRun = (runId: string) =>
  request<DeployRun>(`/api/deploy/runs/${encodeURIComponent(runId)}/resume`, json('POST'));
export const cleanupDeployRun = (runId: string) =>
  request<{ removed: string[] }>(
    `/api/deploy/runs/${encodeURIComponent(runId)}/cleanup`,
    json('POST', { confirm: true })
  );
export const revealDeploySecrets = (runId: string) =>
  request<{ secrets: Record<string, string> }>(
    `/api/deploy/runs/${encodeURIComponent(runId)}/reveal`,
    json('POST')
  );

export const rotateBackendSecret = (kind: 'admin' | 'token' | 'digest') =>
  request<{ kind: string; value: string }>(
    `/api/backend/rotate/${encodeURIComponent(kind)}`,
    json('POST')
  );
export type PurgeSummary = {
  dryRun: boolean;
  complete: boolean;
  rows: Record<string, number>;
  objects: number;
};
export const purgeDeleted = (apply: boolean) =>
  request<PurgeSummary>('/api/backend/purge-deleted', json('POST', { apply }));
