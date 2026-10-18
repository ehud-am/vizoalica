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

type GuardedAction = Extract<ReturnType<typeof applyPrivacyGuard>, { ok: true }>['events'][number];

function actionEvent(
  overrides: Record<string, unknown> = {},
  action: Record<string, unknown> = {}
) {
  return {
    ...pageViewEvent('evt_action_1'),
    type: 'com.vizoalica.action.v1' as const,
    data: {
      page: { url_origin: 'https://example.com', url_path: '/pricing' },
      action: { name: 'Start free trial', kind: 'button', ...action },
      visitor: { anonymous_id: 'anon_1' },
      session: { id: 'sess_1' },
      ...overrides
    }
  } as unknown as GuardedAction;
}

function guarded(event: GuardedAction) {
  const result = applyPrivacyGuard([event]);
  if (!result.ok) throw new Error(`rejected: ${result.reason}`);
  return result.events[0]!.data as any;
}

describe('privacy guard page keys', () => {
  it('accepts and keeps a fragment page key, and leaves the root path alone', () => {
    const event = pageViewEvent('evt_key_1');
    event.data.page.url_path = '/#/pricing';
    expect(guarded(event as never).page.url_path).toBe('/#/pricing');
    event.data.page.url_path = '/';
    expect(guarded(event as never).page.url_path).toBe('/');
  });

  it('still rejects a query, and re-normalizes a non-route fragment', () => {
    const event = pageViewEvent('evt_key_2');
    event.data.page.url_path = '/#/a?token=secret';
    expect(validateEventPrivacy(event)).toEqual({ ok: false, reason: 'unredacted_url_query' });
    event.data.page.url_path = '/docs#section-2';
    expect(guarded(event as never).page.url_path).toBe('/docs');
  });

  it('groups identifiers sent by an older SDK and never returns the original value', () => {
    const event = pageViewEvent('evt_key_3');
    event.data.page.url_path = '/orders/8841/';
    const out = guarded(event as never);
    expect(out.page.url_path).toBe('/orders/:id');
    expect(JSON.stringify(out)).not.toContain('8841');
    event.data.page.url_path = '/orders/:id';
    expect(guarded(event as never).page.url_path).toBe('/orders/:id');
    event.data.page.url_path = '/users/jane@example.com';
    expect(guarded(event as never).page.url_path).toBe('/users/:id');
  });
});

describe('privacy guard action events', () => {
  it('accepts a valid action and keeps its fields', () => {
    const out = guarded(actionEvent());
    expect(out.action).toEqual({ name: 'Start free trial', kind: 'button' });
    expect(out.page.url_path).toBe('/pricing');
  });

  it('re-normalizes the page and destination paths', () => {
    const out = guarded(
      actionEvent(
        { page: { url_origin: 'https://example.com', url_path: '/orders/8841/' } },
        {
          kind: 'link',
          destination: { url_origin: 'https://app.example.com', url_path: '/invoices/5551234/' }
        }
      )
    );
    expect(out.page.url_path).toBe('/orders/:id');
    expect(out.action.destination).toEqual({
      url_origin: 'https://app.example.com',
      url_path: '/invoices/:id'
    });
    expect(JSON.stringify(out)).not.toMatch(/8841|5551234/);
  });

  it('rejects a query in the page path or the destination path', () => {
    expect(
      validateEventPrivacy(
        actionEvent({ page: { url_origin: 'https://example.com', url_path: '/a?x=1' } })
      )
    ).toEqual({ ok: false, reason: 'unredacted_url_query' });
    expect(
      validateEventPrivacy(
        actionEvent(
          {},
          {
            kind: 'link',
            destination: { url_origin: 'https://x.example', url_path: '/go?email=a@b.co' }
          }
        )
      )
    ).toEqual({ ok: false, reason: 'unredacted_url_query' });
  });

  it('re-redacts the name and falls back by kind when nothing is left', () => {
    expect(guarded(actionEvent({}, { name: 'Delete jane@example.com' })).action.name).toBe(
      'Delete [email]'
    );
    expect(guarded(actionEvent({}, { name: 'x'.repeat(200) })).action.name).toHaveLength(80);
    expect(guarded(actionEvent({}, { name: '   ', kind: 'link' })).action.name).toBe(
      'Unlabeled link'
    );
    expect(guarded(actionEvent({}, { name: '   ', kind: 'other' })).action.name).toBe(
      'Unlabeled control'
    );
    expect(guarded(actionEvent({}, { name: '   ' })).action.name).toBe('Unlabeled button');
  });

  it('leaves custom events untouched by the new normalization', () => {
    const custom = {
      ...pageViewEvent('evt_c'),
      type: 'com.vizoalica.custom_event.v1' as const,
      data: {
        name: 'signup_click',
        visitor: { anonymous_id: 'a' },
        session: { id: 's' },
        properties: { plan: 'pro' }
      }
    };
    const result = applyPrivacyGuard([custom]);
    expect(result.ok && result.events[0]!.data).toEqual(custom.data);
  });

  it('groups identifiers in the page of a custom event and refuses one with a query', () => {
    const custom = {
      ...pageViewEvent('evt_c2'),
      type: 'com.vizoalica.custom_event.v1' as const,
      data: {
        name: 'signup',
        page: { url_path: '/orders/8841' },
        visitor: { anonymous_id: 'a' },
        session: { id: 's' }
      }
    };
    const result = applyPrivacyGuard([custom]);
    expect(result.ok && (result.events[0]!.data as { page: unknown }).page).toEqual({
      url_path: '/orders/:id'
    });
    const withQuery = { ...custom, data: { ...custom.data, page: { url_path: '/a?token=x' } } };
    expect(applyPrivacyGuard([withQuery])).toEqual({ ok: false, reason: 'unredacted_url_query' });
  });
});

describe('privacy guard campaign labels', () => {
  function withCampaign(campaign: unknown) {
    const event = pageViewEvent('evt_campaign_1');
    (event.data as Record<string, unknown>).campaign = campaign;
    return event as unknown as GuardedAction;
  }

  it('keeps clean labels unchanged (idempotent with the browser)', () => {
    const campaign = { source: 'newsletter', medium: 'email', campaign: 'spring-sale' };
    expect(guarded(withCampaign(campaign)).campaign).toEqual(campaign);
  });

  it.each([
    [{ source: 'Jane@Example.com' }, { source: '[email]' }],
    [{ medium: '4111111111111111' }, { medium: '[number]' }],
    [{ campaign: '<script>alert(1)</script>' }, { campaign: 'scriptalert1/script' }],
    [
      { source: 'Twitter ', medium: ' SOCIAL' },
      { source: 'twitter', medium: 'social' }
    ]
  ])('cleans %j again at ingestion', (sent, stored) => {
    expect(guarded(withCampaign(sent)).campaign).toEqual(stored);
  });

  it('cuts oversized values and drops labels that are empty after cleaning', () => {
    expect(guarded(withCampaign({ source: 'x'.repeat(500) })).campaign.source).toHaveLength(64);
    expect(guarded(withCampaign({ source: '<>"', medium: 'email' })).campaign).toEqual({
      medium: 'email'
    });
  });

  it('removes the campaign entirely when nothing is left, or when it is not an object', () => {
    expect(guarded(withCampaign({ source: '<>' }))).not.toHaveProperty('campaign');
    expect(guarded(withCampaign('utm_source=x'))).not.toHaveProperty('campaign');
  });

  it('ignores any other key a client adds', () => {
    expect(guarded(withCampaign({ source: 'a', term: 'secret' })).campaign).toEqual({
      source: 'a'
    });
  });

  it('leaves page views without a campaign unchanged', () => {
    expect(
      guarded(pageViewEvent('evt_campaign_none') as unknown as GuardedAction)
    ).not.toHaveProperty('campaign');
  });
});
