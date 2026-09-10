import type { CloudEvent, ConsentState, TrustLevel } from '@vizoalica/event-contracts';

export interface Project {
  id: string;
  name: string;
  mode: 'production' | 'demo';
  defaultRetentionDays: number;
  quotaPolicyId: string;
}

export interface Source {
  id: string;
  projectId: string;
  name: string;
  allowedOrigins: string[];
  publicSourceKey: string;
  status: 'active' | 'disabled' | 'deleted' | 'rotating';
  quotaPolicyId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminAuditEntry {
  operation: string;
  outcome: 'allowed' | 'denied';
  reasonCode: string;
  projectId?: string;
  sourceId?: string;
}

export interface PageViewCounts {
  total: number;
  byDateAndPath: Array<{ date: string; path: string; count: number }>;
}
export interface AnalyticsSummary {
  projectId: string;
  sourceId: string;
  window: '24h' | '7d' | '30d';
  startUtc: string;
  endUtc: string;
  pageViews?: number;
  uniqueUsers?: number;
  availability: 'complete' | 'processing' | 'unavailable';
  lastCompletedAggregateAt?: string;
}

export type AnalyticsIdentityKind = 'source-local' | 'project-supplied';
export type AnalyticsDimensionKind =
  'page_path' | 'country' | 'user_agent' | 'browser' | 'os' | 'device' | 'traffic' | 'referrer';

export interface RequestAnalyticsContext {
  country: string;
  browser: string;
  os: string;
  device: 'desktop' | 'mobile' | 'tablet' | 'other' | 'unknown';
  traffic: 'bot' | 'human' | 'unknown';
  userAgentFamily: string;
  taxonomyVersion: 1;
  projectVisitorId?: string;
}

export interface AnalyticsRange {
  startUtc: string;
  endUtc: string;
  interval: 'hour' | 'day';
  timezone: 'UTC';
}

export interface CountItem {
  label: string;
  count: number;
}

export interface RankedResult {
  items: CountItem[];
  otherCount: number;
  total: number;
}

export interface DistributionResult {
  items: CountItem[];
  total: number;
}

export interface AnalyticsOverview {
  scope: {
    projectId: string;
    sourceId: string | null;
    label: string;
    identityMode: AnalyticsIdentityKind | 'mixed';
  };
  range: AnalyticsRange;
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
}

export interface SigningKey {
  id: string;
  projectId: string;
  sourceId: string;
  algorithm: string;
  status: 'active' | 'retiring' | 'disabled';
  notBefore: Date;
  expiresAt?: Date;
}

export interface QuotaPolicy {
  id: string;
  maxRequestBytes: number;
  maxEventsPerBatch: number;
  maxEventsPerToken: number;
  maxEventsPerSecond: number;
  maxEventsPerDay: number;
  maxPropertyCount: number;
  maxPropertyValueLength: number;
  retentionDays: number;
}

export interface EventBatch {
  receivedAt: Date;
  origin?: string;
  events: CloudEvent[];
  batchSizeBytes: number;
  eventCount: number;
  authContext: TrustLevel | 'invalid';
}

export interface StoredEvent {
  projectId: string;
  sourceId: string;
  trustLevel: TrustLevel;
  consentState: ConsentState;
  event: CloudEvent;
  receivedAt: Date;
}

export interface IngestionDecision {
  decision: 'accepted' | 'partial' | 'rejected' | 'throttled';
  reasonCodes: string[];
  acceptedCount: number;
  rejectedCount: number;
  projectId?: string;
  sourceId?: string;
  receivedAt: Date;
}
