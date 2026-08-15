import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCustomEvent, buildPageViewEvent } from '../src/events.js';

beforeEach(() => {
  vi.stubGlobal('location', {
    href: 'https://example.com/pricing?email=a@example.com',
    origin: 'https://example.com'
  });
  vi.stubGlobal('document', { title: 'Pricing', referrer: 'https://google.com/search?q=secret' });
});

const config = {
  endpoint: 'https://ingest.example/v1/events:batch',
  sourceKey: 'src_1',
  projectId: 'proj_1',
  tokenProvider: () => 'token',
  consentState: 'analytics-granted' as const
};
const context = { anonymousId: 'anon_1', sessionId: 'sess_1' };

describe('event builders', () => {
  it('builds a privacy-minimized CloudEvents page view', () => {
    const event = buildPageViewEvent(config, context);
    expect(event.type).toBe('com.vizoalica.page_view.v1');
    expect(event.vizoalicaauth).toBe('signed-session');
    expect(event.data.page).toMatchObject({
      url_origin: 'https://example.com',
      url_path: '/pricing',
      url_query_redacted: true
    });
    expect(event.data.referrer).toEqual({ origin: 'https://google.com' });
  });

  it('builds custom events with sanitized properties', () => {
    const event = buildCustomEvent(config, context, 'signup_click', {
      plan: 'pro',
      password: 'secret'
    });
    expect(event.type).toBe('com.vizoalica.custom_event.v1');
    expect(event.data.properties).toEqual({ plan: 'pro' });
  });
});
