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
});
