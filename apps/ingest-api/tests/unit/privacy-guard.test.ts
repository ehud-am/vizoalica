import { describe, expect, it } from 'vitest';
import { applyPrivacyGuard, validateEventPrivacy } from '../../src/ingestion/privacy-guard.js';
import { pageViewEvent } from '../test-helpers.js';

describe('privacy guard', () => {
  it('rejects custom events with forbidden property names', () => {
    const event = {
      ...pageViewEvent('evt_privacy_custom_1'),
      type: 'com.vizoalica.custom_event.v1' as const,
      data: {
        name: 'signup_click',
        visitor: { anonymous_id: 'anon_1' },
        session: { id: 'sess_1' },
        properties: { plan: 'pro', accessToken: 'secret' }
      }
    };
    expect(validateEventPrivacy(event)).toEqual({ ok: false, reason: 'sensitive_property_name' });
  });

  it('rejects page views that contain unredacted query values', () => {
    const event = pageViewEvent('evt_privacy_page_1');
    event.data.page.url_path = '/pricing?token=secret';
    expect(validateEventPrivacy(event)).toEqual({ ok: false, reason: 'unredacted_url_query' });
  });

  it('keeps safe events and returns sanitized copies', () => {
    const event = pageViewEvent('evt_privacy_safe_1');
    const result = applyPrivacyGuard([event]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.events).toHaveLength(1);
  });
});
