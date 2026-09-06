import { beforeEach, describe, expect, it, vi } from 'vitest';
import { autoInit, configFromScript, initFromScript } from '../src/embed.js';

beforeEach(() => {
  vi.stubGlobal('location', {
    href: 'https://example.com/pricing?token=secret',
    origin: 'https://example.com'
  });
  vi.stubGlobal('document', { title: 'Pricing', referrer: '', currentScript: null });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('signed-token', { status: 200 }))
  );
});

describe('embed script', () => {
  it('reads configuration from script data attributes', () => {
    expect(
      configFromScript({
        dataset: {
          endpoint: 'https://analytics.example.com/v1/events:batch',
          source: 'public_src',
          project: 'proj_1',
          tokenUrl: '/vizoalica/ingest-token',
          consent: 'analytics-granted'
        }
      } as HTMLScriptElement)
    ).toEqual({
      endpoint: 'https://analytics.example.com/v1/events:batch',
      sourceKey: 'public_src',
      projectId: 'proj_1',
      tokenUrl: '/vizoalica/ingest-token',
      consentState: 'analytics-granted',
      autoPageView: true
    });
  });

  it('auto-initializes a client from a single script tag', async () => {
    const client = initFromScript({
      dataset: {
        endpoint: 'https://analytics.example.com/v1/events:batch',
        source: 'public_src',
        tokenUrl: '/vizoalica/ingest-token',
        consent: 'analytics-granted'
      }
    } as HTMLScriptElement);

    await client.flush();
    expect(fetch).toHaveBeenCalledWith('/vizoalica/ingest-token', { credentials: 'same-origin' });
  });

  it('requires endpoint and source attributes', () => {
    expect(() =>
      configFromScript({ dataset: { source: 'public_src' } } as HTMLScriptElement)
    ).toThrow(/data-endpoint/);
    expect(() =>
      configFromScript({
        dataset: { endpoint: 'https://analytics.example.com' }
      } as HTMLScriptElement)
    ).toThrow(/data-source/);
  });

  it('supports minimal configuration and explicit automatic page-view disabling', () => {
    expect(
      configFromScript({
        dataset: { endpoint: 'https://a.test', source: 'public', autoPageView: 'false' }
      } as HTMLScriptElement)
    ).toEqual({
      endpoint: 'https://a.test',
      sourceKey: 'public',
      consentState: 'unknown',
      autoPageView: false
    });
    expect(
      configFromScript({
        dataset: { endpoint: 'https://a.test', source: 'public', autoPageView: 'yes' }
      } as HTMLScriptElement).autoPageView
    ).toBe(true);
    expect(
      initFromScript({
        dataset: { endpoint: 'https://a.test', source: 'public' }
      } as HTMLScriptElement)
    ).toBeTruthy();
  });

  it('returns no automatic client without a current script and installs one when present', () => {
    expect(autoInit()).toBeUndefined();
    vi.stubGlobal('document', {
      title: 'Page',
      referrer: '',
      currentScript: {
        dataset: {
          endpoint: 'https://a.test',
          source: 'public',
          project: 'p1',
          consent: 'analytics-denied'
        }
      }
    });
    expect(autoInit()).toBeTruthy();
    expect((globalThis as { vizoalica?: unknown }).vizoalica).toBeTruthy();
  });

  it('treats token endpoint failures as absent tokens', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no', { status: 503 }))
    );
    const client = initFromScript({
      dataset: {
        endpoint: 'https://a.test',
        source: 'public',
        tokenUrl: '/token',
        autoPageView: 'false'
      }
    } as HTMLScriptElement);
    client.track('custom', {});
    await client.flush();
    expect(fetch).toHaveBeenCalled();
  });
});
