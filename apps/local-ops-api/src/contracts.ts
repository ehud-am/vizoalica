import type {
  ActionsReport as WorkerActionsReport,
  AnalyticsOverview as WorkerAnalyticsOverview
} from '../../ingest-api/src/domain/types.js';

export type AnalyticsWindow = '24h' | '7d' | '30d';
export type Availability = 'complete' | 'processing' | 'unavailable';
export type Project = { id: string; name: string; websiteCount?: number };
export type WebsiteStatus = 'active' | 'disabled' | 'deleted';
export type Website = {
  id: string;
  projectId: string;
  name: string;
  publicSourceKey: string;
  allowedOrigins: string[];
  status: WebsiteStatus;
  createdAt?: string;
  updatedAt?: string;
};
export type IntegrationSnippet = {
  projectId: string;
  sourceId: string;
  publicSourceKey: string;
  allowedOrigins: string[];
  modes: [StaticInstallation, DynamicInstallation];
  privateSetup: {
    tokenIssuer: 'website-owned';
    tokenSecretRequired: true;
  };
  /** Transitional compatibility alias; identical to the static snippet. */
  html?: string;
};
export type ConsentState = 'analytics-granted' | 'analytics-denied' | 'unknown';
export type DynamicConfigV1 = {
  version: 1;
  src: string;
  'data-endpoint': string;
  'data-source': string;
  'data-project'?: string;
  'data-token-url'?: string;
  'data-consent'?: ConsentState;
};
export type StaticInstallation = {
  id: 'static';
  /** The recommended embed: only what is unique to the website, everything else defaulted. */
  snippet: string;
  /** The same embed with every default written out, for people who want to override one. */
  customize: string;
  /** The defaults the short embed leaves out, with their values. */
  defaults: Record<string, string>;
};
/**
 * Guidance for the CI/CD (GitHub Actions) deployment path. `repoVariables` holds
 * values Vizoalica already knows and can prefill; `accountSpecificVariables` and
 * `repoSecretNames` are named but never carry a real value, since Vizoalica has
 * no access to the customer's Cloudflare account or their chosen secrets.
 */
export type CloudflareGuidance = {
  workflowRef: string;
  /** What must be added: one public value that bundles this website's public settings. */
  repoVariables: Record<string, string>;
  /** The same settings as separate variables, for people who prefer them or already use them. */
  expandedRepoVariables: Record<string, string>;
  /** Optional variables that are left out because they have a default, with that default. */
  defaults: Record<string, string>;
  /** How many values the person adds in total. */
  summary: { publicValues: number; secrets: number };
  /** One command that prints the Cloudflare account ID and the Pages projects. */
  accountLookupCommand: string;
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
export type InstallationGuidance = IntegrationSnippet;
export type InstallCode =
  | 'ok'
  | 'site-unreachable'
  | 'sdk-file-missing'
  | 'token-endpoint-missing'
  | 'token-endpoint-rejecting'
  | 'origin-not-allowed'
  | 'config-file-missing';
/** What the install check found, as one code and the single next thing to do. */
export type InstallCheck = { code: InstallCode; nextAction: string };
export type ReachabilityStatus = {
  configEndpointReachable: boolean;
  configEndpointCheckedAt: string;
  configEndpointError: string | null;
  /** Present when the route ran the install probes. */
  install?: InstallCheck;
};
export type OperationalStatus = {
  sourceId: string;
  collection: 'healthy' | 'disabled';
  aggregation: 'available' | 'processing' | 'unavailable';
  configuration?: 'healthy' | 'attention';
  dataAccess: 'available' | 'unavailable';
};
export type AnalyticsSummary = {
  projectId: string;
  websiteId: string;
  window: AnalyticsWindow;
  startUtc: string;
  endUtc: string;
  pageViews?: number;
  uniqueUsers?: number;
  availability: Availability;
  lastCompletedAggregateAt?: string;
};
export const isAnalyticsWindow = (value: string | null): value is AnalyticsWindow =>
  value === '24h' || value === '7d' || value === '30d';
export const isSafeId = (value: string): boolean => /^[A-Za-z0-9_-]{1,128}$/.test(value);

export function validName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 1 && value.length <= 120;
}
export function validOrigins(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) return false;
  const normalized = value.map((entry) => {
    if (typeof entry !== 'string') return undefined;
    try {
      const url = new URL(entry);
      return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === entry
        ? entry
        : undefined;
    } catch {
      return undefined;
    }
  });
  return normalized.every(Boolean) && new Set(normalized).size === normalized.length;
}

export function isDynamicConfigV1(value: unknown): value is DynamicConfigV1 {
  if (!value || typeof value !== 'object') return false;
  const config = value as Partial<DynamicConfigV1>;
  return (
    config.version === 1 &&
    typeof config.src === 'string' &&
    typeof config['data-endpoint'] === 'string' &&
    typeof config['data-source'] === 'string' &&
    config['data-source'].length >= 1 &&
    config['data-source'].length <= 256 &&
    !/[\u0000-\u001f]/.test(config['data-source']) &&
    (config['data-project'] === undefined ||
      (typeof config['data-project'] === 'string' && isSafeId(config['data-project']))) &&
    (config['data-token-url'] === undefined || typeof config['data-token-url'] === 'string') &&
    (config['data-consent'] === undefined ||
      config['data-consent'] === 'analytics-granted' ||
      config['data-consent'] === 'analytics-denied' ||
      config['data-consent'] === 'unknown')
  );
}

export type AnalyticsOverview = WorkerAnalyticsOverview;
export type ActionsReport = WorkerActionsReport;

export type Theme = 'light' | 'dark';
export type ThemePreferenceResponse = { theme: Theme | null; updatedAt?: string };
export type SavedThemePreference = { theme: Theme; updatedAt: string };
