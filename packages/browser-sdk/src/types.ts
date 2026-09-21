import type {
  ActionData,
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
  /**
   * Reports in-page navigation (pushState, back and forward, fragment routes) as page views.
   * Defaults to the value of `autoPageView`.
   */
  autoNavigation?: boolean;
  /**
   * Records clicks on buttons and links as actions. Always on for the embed script, which has no
   * setting for it; this switch exists only for programmatic use and tests.
   */
  autoActions?: boolean;
  maxQueueSize?: number;
  flushIntervalMs?: number;
  transportTimeoutMs?: number;
}

export interface TrackOptions {
  properties?: Record<string, unknown>;
}

export type VizoalicaEvent = CloudEvent<PageViewData | CustomEventData | ActionData>;
