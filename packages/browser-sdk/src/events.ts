import type { CloudEvent, CustomEventData, PageViewData } from '@vizoalica/event-contracts';
import { sanitizeProperties } from '@vizoalica/privacy';
import type { VizoalicaConfig } from './types.js';
import { currentPage, currentReferrer } from './privacy.js';

function randomId(prefix: string): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) return `${prefix}_${cryptoObj.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export function resolveAnonymousId(config: VizoalicaConfig): string {
  if (config.anonymousId) return config.anonymousId;
  const generated = randomId('anon');
  if (config.consentState !== 'analytics-granted') return generated;
  try {
    const storage = globalThis.localStorage;
    const key = `vizoalica:anonymous:${config.sourceKey}`;
    const saved = storage?.getItem(key);
    if (saved && /^anon_[A-Za-z0-9-]{1,96}$/.test(saved)) return saved;
    storage?.setItem(key, generated);
  } catch {
    // Storage can be unavailable in private modes; analytics must remain non-blocking.
  }
  return generated;
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
    vizoalicaauth: config.tokenProvider ? 'signed-session' : 'unsigned-demo',
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
