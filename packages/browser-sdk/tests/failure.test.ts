import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../src/index.js';

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
});
