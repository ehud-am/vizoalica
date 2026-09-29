import type {
  ActionData,
  CloudEvent,
  CustomEventData,
  PageViewData
} from '@vizoalica/event-contracts';
import { sanitizeProperties } from '@vizoalica/privacy';
import type { VizoalicaConfig } from './types.js';
import type { ActionObservation } from './actions.js';
import { currentPage, currentReferrer } from './privacy.js';

function randomId(prefix: string): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) return `${prefix}_${cryptoObj.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

/**
 * A random identifier for this page load only. Nothing is stored in the browser: the backend counts
 * unique visitors with its own daily-rotating identifier, so no cookie or storage is needed.
 */
export function resolveAnonymousId(config: VizoalicaConfig): string {
  return config.anonymousId ?? randomId('anon');
}

export function resolveSessionId(config: VizoalicaConfig): string {
  return config.sessionId ?? randomId('sess');
}

interface EventContext {
  anonymousId: string;
  sessionId: string;
}

function baseEvent<T>(
  config: VizoalicaConfig,
  context: EventContext,
  type: CloudEvent<T>['type'],
  data: T
): CloudEvent<T> {
  const event: CloudEvent<T> = {
    specversion: '1.0',
    id: randomId('evt'),
    type,
    source: globalThis.location?.origin ?? 'urn:vizoalica:unknown-source',
    subject: `source/${config.sourceKey}/session/${context.sessionId}`,
    time: new Date().toISOString(),
    datacontenttype: 'application/json',
    vizoalicasource: config.sourceKey,
    // The backend decides the trust level; a signed batch says so, an unsigned one leaves it out.
    ...(config.tokenProvider ? { vizoalicaauth: 'signed-session' as const } : {}),
    vizoalicaconsent: config.consentState ?? 'unknown',
    data
  };
  if (config.projectId) event.vizoalicaproject = config.projectId;
  return event;
}

export function buildPageViewEvent(
  config: VizoalicaConfig,
  context: EventContext
): CloudEvent<PageViewData> {
  const page = currentPage();
  const referrer = currentReferrer();
  return baseEvent(config, context, 'com.vizoalica.page_view.v1', {
    page: { ...page, title: globalThis.document?.title?.slice(0, 256) ?? null },
    visitor: { anonymous_id: context.anonymousId },
    session: { id: context.sessionId },
    ...(referrer ? { referrer } : {})
  });
}

export function buildCustomEvent(
  config: VizoalicaConfig,
  context: EventContext,
  name: string,
  properties: Record<string, unknown> = {}
): CloudEvent<CustomEventData> {
  return baseEvent(config, context, 'com.vizoalica.custom_event.v1', {
    name,
    properties: sanitizeProperties(properties),
    visitor: { anonymous_id: context.anonymousId },
    session: { id: context.sessionId }
  });
}

export function buildActionEvent(
  config: VizoalicaConfig,
  context: EventContext,
  observation: ActionObservation
): CloudEvent<ActionData> {
  return baseEvent(config, context, 'com.vizoalica.action.v1', {
    page: { url_origin: currentPage().url_origin, url_path: observation.page },
    action: {
      name: observation.name,
      kind: observation.kind,
      ...(observation.destination ? { destination: observation.destination } : {})
    },
    visitor: { anonymous_id: context.anonymousId },
    session: { id: context.sessionId }
  });
}
