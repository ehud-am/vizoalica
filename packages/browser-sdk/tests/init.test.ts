import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../src/index.js';

beforeEach(() => {
  vi.stubGlobal('location', {
    href: 'https://example.com/pricing?token=secret',
    origin: 'https://example.com'
  });
  vi.stubGlobal('document', { title: 'Pricing', referrer: '' });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 202 }))
  );
});

describe('init', () => {
  it('creates a client and auto tracks a page view by default', async () => {
    const client = init({ endpoint: 'https://ingest.example/v1/events:batch', sourceKey: 'src_1' });
    await client.flush();
    expect(client.queuedEvents).toBe(0);
    expect(fetch).toHaveBeenCalled();
  });

  it('can disable automatic page view', () => {
    const client = init({
      endpoint: 'https://ingest.example/v1/events:batch',
      sourceKey: 'src_1',
      autoPageView: false
    });
    expect(client.queuedEvents).toBe(0);
  });
});
