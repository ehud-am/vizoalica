import type {
  CloudEvent,
  ConsentState,
  CustomEventData,
  PageViewData
} from '@vizoalica/event-contracts';

export type TokenProvider = () => Promise<string | undefined> | string | undefined;

export interface VizoalicaConfig {
  endpoint: string;
  sourceKey: string;
  projectId?: string;
  tokenProvider?: TokenProvider;
  anonymousId?: string;
  sessionId?: string;
  consentState?: ConsentState;
  autoPageView?: boolean;
  maxQueueSize?: number;
  flushIntervalMs?: number;
  transportTimeoutMs?: number;
}

export interface TrackOptions {
  properties?: Record<string, unknown>;
}

export type VizoalicaEvent = CloudEvent<PageViewData | CustomEventData>;
