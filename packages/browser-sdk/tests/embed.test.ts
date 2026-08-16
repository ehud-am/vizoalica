import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configFromScript, initFromScript } from '../src/embed.js';

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
});
