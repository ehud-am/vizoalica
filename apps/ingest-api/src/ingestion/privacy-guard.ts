import type {
  ActionData,
  ActionKind,
  CloudEvent,
  CustomEventData,
  PageViewData
} from '@vizoalica/event-contracts';
import {
  cleanCampaign,
  type CampaignLabels,
  isForbiddenPropertyName,
  normalizePagePath,
  redactLabel,
  sanitizeProperties
} from '@vizoalica/privacy';

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

function isAction(event: CloudEvent): event is CloudEvent<ActionData> {
  return event.type === 'com.vizoalica.action.v1';
}

const FALLBACK_NAME: Record<ActionKind, string> = {
  button: 'Unlabeled button',
  link: 'Unlabeled link',
  other: 'Unlabeled control'
};

/**
 * Page keys and action names are normalized again here, whatever the sender did: older SDK files
 * do not group identifiers, and a hostile client could send anything. Both functions are
 * idempotent, so an updated SDK's output passes through unchanged.
 */
function normalizePageView(event: CloudEvent<PageViewData>): CloudEvent<PageViewData> {
  // Campaign labels are cleaned again here, and dropped when nothing is left, so a hostile client
  // cannot store anything the browser's own cleaner would have removed.
  const { campaign: sent, ...data } = event.data;
  const campaign = cleanCampaign(sent);
  return {
    ...event,
    data: {
      ...data,
      page: { ...data.page, url_path: normalizePagePath(data.page.url_path) },
      ...(campaign ? { campaign } : {})
    }
  };
}

function normalizeAction(event: CloudEvent<ActionData>): CloudEvent<ActionData> {
  const { action, page } = event.data;
  const { destination, ...rest } = action;
  return {
    ...event,
    data: {
      ...event.data,
      page: { ...page, url_path: normalizePagePath(page.url_path) },
      action: {
        ...rest,
        name: redactLabel(action.name) || FALLBACK_NAME[action.kind],
        ...(destination
          ? { destination: { ...destination, url_path: normalizePagePath(destination.url_path) } }
          : {})
      }
    }
  };
}

/** A property value as reports store it: redacted like an action name, and cut short. */
export function reportablePropertyValue(value: string, maxLength: number): string {
  return redactLabel(value).slice(0, maxLength).trim();
}

/** Campaign labels as reports store them: cleaned, and undefined when nothing is left. */
export function reportableCampaign(value: unknown): CampaignLabels | undefined {
  return cleanCampaign(value);
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

  if (isAction(event)) {
    // Rejected before normalizing: a query in either path means the sender did not redact.
    const paths = [event.data.page.url_path, event.data.action.destination?.url_path];
    if (paths.some((path) => path?.includes('?')))
      return { ok: false, reason: 'unredacted_url_query' };
  }

  if (isCustomEvent(event)) {
    if (event.data.page?.url_path.includes('?'))
      return { ok: false, reason: 'unredacted_url_query' };
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
          properties: sanitizeProperties(event.data.properties),
          ...(event.data.page
            ? { page: { url_path: normalizePagePath(event.data.page.url_path) } }
            : {})
        }
      });
    } else if (isPageView(event)) {
      sanitized.push(normalizePageView(event));
    } else if (isAction(event)) {
      sanitized.push(normalizeAction(event));
    } else {
      sanitized.push(event);
    }
  }
  return { ok: true, events: sanitized };
}
