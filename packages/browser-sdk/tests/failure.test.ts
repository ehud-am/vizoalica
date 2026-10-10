import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../src/index.js';
import { initializeDynamicLoader } from '../src/dynamic-config.js';

beforeEach(() => {
  vi.stubGlobal('location', { href: 'https://example.com/', origin: 'https://example.com' });
  vi.stubGlobal('document', { title: 'Home', referrer: '' });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('down');
    })
  );
});

describe('failure behavior', () => {
  it('does not throw when ingestion is unavailable', async () => {
    const client = init({
      endpoint: 'https://down.example/v1/events:batch',
      sourceKey: 'src_1',
      autoPageView: false,
      transportTimeoutMs: 10
    });
    expect(() => client.track('signup_click')).not.toThrow();
    await expect(client.flush()).resolves.toBeUndefined();
  });

  it('contains dynamic configuration failures without disrupting the host page', async () => {
    const hostDocument = {
      head: { append: vi.fn() },
      querySelector: vi.fn(() => null),
      createElement: vi.fn()
    } as unknown as Document;
    const hostWindow = { location: { href: 'https://example.com/' } } as unknown as Window;
    await expect(
      initializeDynamicLoader(
        hostWindow,
        hostDocument,
        vi.fn().mockRejectedValue(new Error('down'))
      )
    ).resolves.toBe(false);
    expect(hostDocument.head.append).not.toHaveBeenCalled();
  });
});
