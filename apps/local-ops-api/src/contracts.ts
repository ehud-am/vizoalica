import type { AnalyticsOverview as WorkerAnalyticsOverview } from '../../ingest-api/src/domain/types.js';

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
  publicSourceKey: string;
  allowedOrigins: string[];
  tokenIssuer: 'website-owned';
  html?: string;
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
export const projectNameSchema = { type: 'string', minLength: 1, maxLength: 120 } as const;
export const allowedOriginsSchema = {
  type: 'array',
  minItems: 1,
  maxItems: 10,
  uniqueItems: true,
  items: { type: 'string', format: 'uri' }
} as const;

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

export type AnalyticsOverview = WorkerAnalyticsOverview;

export type Theme = 'light' | 'dark';
export type ThemePreferenceResponse = { theme: Theme | null; updatedAt?: string };
export type SavedThemePreference = { theme: Theme; updatedAt: string };
