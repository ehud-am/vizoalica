import type { CloudEvent, CustomEventData, PageViewData } from '@vizoalica/event-contracts';
import { isForbiddenPropertyName, sanitizeProperties } from '@vizoalica/privacy';

export type PrivacyGuardResult =
  | { ok: true; events: CloudEvent[] }
  | {
      ok: false;
      reason: 'sensitive_property_name' | 'unredacted_url_query' | 'forbidden_page_content';
    };

function isPageView(event: CloudEvent): event is CloudEvent<PageViewData> {
  return event.type === 'com.vizoalica.page_view.v1';
}

function isCustomEvent(event: CloudEvent): event is CloudEvent<CustomEventData> {
  return event.type === 'com.vizoalica.custom_event.v1';
}

export function validateEventPrivacy(event: CloudEvent): PrivacyGuardResult {
  if (isPageView(event)) {
    const page = event.data.page;
    if (
      page.url_path.includes('?') ||
      page.url_path.includes('token=') ||
      page.url_path.includes('email=')
    ) {
      return { ok: false, reason: 'unredacted_url_query' };
    }
    const serialized = JSON.stringify(event.data).toLowerCase();
    if (
      serialized.includes('password=') ||
      serialized.includes('credit_card') ||
      serialized.includes('card_number')
    ) {
      return { ok: false, reason: 'forbidden_page_content' };
    }
  }

  if (isCustomEvent(event)) {
    for (const key of Object.keys(event.data.properties ?? {})) {
      if (isForbiddenPropertyName(key)) return { ok: false, reason: 'sensitive_property_name' };
    }
  }

  return { ok: true, events: [event] };
}

export function applyPrivacyGuard(events: CloudEvent[]): PrivacyGuardResult {
  const sanitized: CloudEvent[] = [];
  for (const event of events) {
    const result = validateEventPrivacy(event);
    if (!result.ok) return result;
    if (isCustomEvent(event)) {
      sanitized.push({
        ...event,
        data: {
          ...event.data,
          properties: sanitizeProperties(event.data.properties)
        }
      });
    } else {
      sanitized.push(event);
    }
  }
  return { ok: true, events: sanitized };
}
