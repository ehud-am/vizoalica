import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configFromScript, initFromScript } from '../src/embed.js';

const script = (dataset: Record<string, string>) => ({ dataset }) as unknown as HTMLScriptElement;
const minimal = { endpoint: 'https://analytics.example.com/v1/events:batch', source: 'public_src' };

beforeEach(() => {
  vi.stubGlobal('location', { href: 'https://example.com/', origin: 'https://example.com' });
  vi.stubGlobal('document', { title: 'Home', referrer: '', currentScript: null });
});

describe('embed defaults', () => {
  it('needs only the endpoint and the source key', () => {
    expect(configFromScript(script(minimal))).toEqual({
      endpoint: minimal.endpoint,
      sourceKey: 'public_src',
      tokenUrl: '/vizoalica/ingest-token',
      consentState: 'unknown',
      autoPageView: true
    });
  });

  it('carries no project when none is given', () => {
    expect(configFromScript(script(minimal)).projectId).toBeUndefined();
  });

  it('asks the conventional token path when the attribute is absent', async () => {
    const fetcher = vi.fn(async () => new Response('signed-token', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    await initFromScript(script(minimal)).flush();
    expect(fetcher).toHaveBeenCalledWith('/vizoalica/ingest-token', { credentials: 'same-origin' });
  });

  it('sends unsigned, without asking for a token, when the attribute is "none"', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 202 }));
    vi.stubGlobal('fetch', fetcher);
    expect(configFromScript(script({ ...minimal, tokenUrl: 'none' })).tokenUrl).toBeUndefined();
    await initFromScript(script({ ...minimal, tokenUrl: 'none' })).flush();
    expect(fetcher.mock.calls.every(([url]) => url !== '/vizoalica/ingest-token')).toBe(true);
  });

  it('keeps an explicit token path and an explicit project exactly as given', () => {
    const config = configFromScript(
      script({
        ...minimal,
        tokenUrl: '/custom/token',
        project: 'proj_1',
        consent: 'analytics-granted'
      })
    );
    expect(config).toMatchObject({
      tokenUrl: '/custom/token',
      projectId: 'proj_1',
      consentState: 'analytics-granted'
    });
  });

  it('still sends events, without throwing, when the token endpoint is missing', async () => {
    const fetcher = vi.fn(async (url: string) =>
      url === '/vizoalica/ingest-token'
        ? new Response('missing', { status: 404 })
        : new Response('', { status: 202 })
    );
    vi.stubGlobal('fetch', fetcher);
    await expect(initFromScript(script(minimal)).flush()).resolves.not.toThrow();
    const ingest = fetcher.mock.calls.find(([url]) => url === minimal.endpoint);
    expect(ingest).toBeTruthy();
  });
});
