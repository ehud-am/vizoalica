import type { CloudEvent, ConsentState, TrustLevel } from '@vizoalica/event-contracts';

export interface Project {
  id: string;
  name: string;
  mode: 'production' | 'demo';
  defaultRetentionDays: number;
  quotaPolicyId: string;
  status: 'active' | 'deleted';
}

export interface Source {
  id: string;
  projectId: string;
  name: string;
  allowedOrigins: string[];
  publicSourceKey: string;
  status: 'active' | 'disabled' | 'deleted' | 'rotating';
  quotaPolicyId?: string;
  /**
   * Whether every batch needs a signed token from the website's token endpoint. False lets a
   * static website send unsigned batches from its allowed origins. Absent means true.
   */
  tokenRequired?: boolean;
  /**
   * IP addresses and ranges (canonical spelling, at most 25) whose events this website drops
   * instead of counting. Operator configuration: never logged, audited or returned to analysts.
   */
  excludedAddresses?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminAuditEntry {
  operation: string;
  outcome: 'allowed' | 'denied';
  reasonCode: string;
  projectId?: string;
  sourceId?: string;
  /** The access key id of an owner's write; absent for the admin. */
  actor?: string;
}

export type AccessKeyRole = 'analyst' | 'owner';
export interface AccessKeyScope {
  projectId: string | null;
  sourceId: string | null;
}
export interface AccessKeyRecord {
  id: string;
  label: string;
  role: AccessKeyRole;
  secretHash: string;
  scope: AccessKeyScope;
  createdAt: string;
  revokedAt: string | null;
}
export type AccessKeySummary = Omit<AccessKeyRecord, 'secretHash'>;

/** The admin, or an access key's holder with the role and scope the backend resolved. */
export type Principal =
  | { role: 'admin' }
  | { role: AccessKeyRole; keyId: string; keyLabel: string; scope: AccessKeyScope };

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
  /**
   * The Worker's identifier for this visitor on this UTC day, from a salt that is deleted once the
   * day is over. Counts unique visitors with nothing stored in the browser.
   */
  dailyVisitorId?: string;
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
  /** Website name, set on page paths when the scope is all websites of a project. */
  website?: string;
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

export type ActionKindName = 'button' | 'link' | 'other';

/** One page-and-action row of the actions report. */
export interface ActionReportRow {
  page: string;
  action: string;
  kind: ActionKindName;
  /** Links only: origin plus path, never a query. */
  destination?: string;
  count: number;
  visitors: number;
  /** Views of `page` in the same range and scope; 0 when the page key has no views. */
  pageViews: number;
}

export interface ActionTotal {
  action: string;
  kind: ActionKindName;
  count: number;
  visitors: number;
  pages: number;
}

export interface ActionsFilters {
  /** Exact page key. */
  page?: string;
  /** Exact action name. */
  action?: string;
}

export interface ActionsReport {
  scope: AnalyticsOverview['scope'];
  range: AnalyticsRange;
  totals: { actions: number; uniqueUsers: number };
  /** At most 100 rows, most used first. */
  rows: ActionReportRow[];
  /** What is beyond `rows`, so `sum(rows.count) + other.count` is exactly `totals.actions`. */
  other: { rows: number; count: number };
  /** Per-action totals across pages, at most 50. */
  actions: ActionTotal[];
  selection?: { page?: { path: string; views: number; actions: number } };
  availability: AnalyticsOverview['availability'];
}

/** One control of the rage clicks report. */
export interface RageClickRow {
  page: string;
  action: string;
  kind: ActionKindName;
  /** Links only: origin plus path, never a query. */
  destination?: string;
  /** Bursts of rapid clicks on this control. */
  count: number;
  /** All clicks on the same control, page and range, so a rate can be shown. */
  clicks: number;
}

export interface RageClicksReport {
  scope: AnalyticsOverview['scope'];
  range: AnalyticsRange;
  /** `clicks` is every click in the range and selection, bursts included. */
  totals: { bursts: number; clicks: number };
  trend: Array<{ startUtc: string; bursts: number }>;
  /** At most 50 controls, most bursts first. */
  rows: RageClickRow[];
  /** What is beyond `rows`, so `sum(rows.count) + other.count` is exactly `totals.bursts`. */
  other: { rows: number; count: number };
  availability: AnalyticsOverview['availability'];
}

export interface CustomEventsFilters {
  /** Exact event name. */
  event?: string;
  /** Exact page key. */
  page?: string;
}

export interface CustomEventTotal {
  event: string;
  count: number;
  visitors: number;
  /** Distinct pages the event was sent from; events sent without a page are not counted. */
  pages: number;
}

export interface CustomEventPage {
  page: string;
  count: number;
  visitors: number;
}

export interface CustomEventPropertyValue {
  value: string;
  count: number;
}

export interface CustomEventProperty {
  key: string;
  /** Most frequent values first, at most 10. */
  values: CustomEventPropertyValue[];
}

export interface CustomEventsReport {
  scope: AnalyticsOverview['scope'];
  range: AnalyticsRange;
  totals: { events: number; uniqueUsers: number };
  /** Per-event totals, most frequent first, at most 50. */
  events: CustomEventTotal[];
  /** What is beyond `events`, so `sum(events.count) + other.count` is exactly `totals.events`. */
  other: { events: number; count: number };
  /** Events per interval for the current selection. */
  trend: Array<{ startUtc: string; count: number }>;
  /** Pages the selected events came from, at most 20. */
  pages: CustomEventPage[];
  /** Events sent without a page, such as from an older SDK. */
  withoutPage: number;
  /** Property values, only when one event is selected. At most 10 keys. */
  properties: CustomEventProperty[];
  availability: AnalyticsOverview['availability'];
}

export interface CampaignsFilters {
  /** Exact label; each filter is optional. */
  source?: string;
  medium?: string;
  campaign?: string;
}

export interface CampaignRankingItem {
  /** '' means the link did not set this label. */
  label: string;
  /** Page views that carried a campaign. */
  count: number;
  visitors: number;
}

export interface CampaignRanking {
  /** At most 20, most page views first. */
  items: CampaignRankingItem[];
  /** What is beyond `items`, so `sum(items.count) + otherCount` covers the ranking's selection. */
  otherCount: number;
}

export interface CampaignRow {
  source: string;
  medium: string;
  campaign: string;
  count: number;
  visitors: number;
}

export interface CampaignsReport {
  scope: AnalyticsOverview['scope'];
  range: AnalyticsRange;
  /** `allPageViews` is every page view in the range and scope, so a share can be shown. */
  totals: { pageViews: number; uniqueUsers: number; allPageViews: number };
  trend: Array<{ startUtc: string; pageViews: number }>;
  /** Each ranking is narrowed by the other two filters, so choosing a source still lists all sources. */
  sources: CampaignRanking;
  mediums: CampaignRanking;
  campaigns: CampaignRanking;
  /** Source, medium and campaign combinations, at most 50, most page views first. */
  rows: CampaignRow[];
  /** What is beyond `rows`, so `sum(rows.count) + other.count` is exactly `totals.pageViews`. */
  other: { rows: number; count: number };
  availability: AnalyticsOverview['availability'];
}

export interface ExcludedHitsReport {
  /** Events dropped in the window. */
  total: number;
  /** Only days with hits, newest first. */
  days: Array<{ day: string; count: number }>;
  windowDays: number;
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
  /** `excluded`: an authorized batch from an address the website excludes; nothing was stored. */
  decision: 'accepted' | 'partial' | 'rejected' | 'throttled' | 'excluded';
  reasonCodes: string[];
  acceptedCount: number;
  rejectedCount: number;
  projectId?: string;
  sourceId?: string;
  receivedAt: Date;
}
