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
