// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DYNAMIC_LOADER_STATE,
  initializeDynamicLoader,
  validateDynamicConfig
} from '../src/dynamic-config.js';
import {
  malformedDynamicConfig,
  mismatchedDynamicConfig,
  validDynamicConfig
} from './fixtures/dynamic-config.js';

afterEach(() => {
  document.head.replaceChildren();
  delete (window as unknown as Record<string, unknown>)[DYNAMIC_LOADER_STATE];
  delete (window as unknown as Record<string, unknown>).vizoalica;
  vi.restoreAllMocks();
});

describe('dynamic configuration loader', () => {
  it('validates the complete v1 contract and same-origin token URL', () => {
    expect(validateDynamicConfig(validDynamicConfig, 'https://site.example/page')).toMatchObject({
      src: 'https://site.example/vizoalica.js',
      'data-token-url': '/vizoalica/ingest-token'
    });
    for (const value of [
      null,
      malformedDynamicConfig,
      mismatchedDynamicConfig,
      { ...validDynamicConfig, src: 'javascript:alert(1)' },
      { ...validDynamicConfig, 'data-endpoint': 'http://remote.example/events' },
      { ...validDynamicConfig, 'data-source': 'source\nheader' },
      { ...validDynamicConfig, 'data-project': '' },
      { ...validDynamicConfig, 'data-consent': 'granted-ish' }
    ])
      expect(validateDynamicConfig(value, 'https://site.example/page')).toBeUndefined();
    expect(
      validateDynamicConfig(
        { ...validDynamicConfig, 'data-endpoint': 'http://localhost:8787/events' },
        'http://localhost:3000/'
      )
    ).toBeTruthy();
  });

  it('fetches without cache reuse and inserts one configured asynchronous SDK script', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(validDynamicConfig));
    await expect(initializeDynamicLoader(window, document, fetcher)).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledWith('/vizoalica/config.json', {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { accept: 'application/json' }
    });
    const script = document.head.querySelector('script')!;
    expect(script.async).toBe(true);
    expect(script.dataset).toMatchObject({
      endpoint: validDynamicConfig['data-endpoint'],
      source: validDynamicConfig['data-source'],
      project: validDynamicConfig['data-project'],
      tokenUrl: validDynamicConfig['data-token-url'],
      consent: validDynamicConfig['data-consent']
    });
    await expect(initializeDynamicLoader(window, document, fetcher)).resolves.toBe(false);
    expect(document.head.querySelectorAll('script')).toHaveLength(1);
  });

  it('contains fetch, response, JSON, validation, and existing-client failures', async () => {
    const failures = [
      vi.fn().mockRejectedValue(new Error('offline')),
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.reject(new Error('bad json')) }),
      vi.fn().mockResolvedValue(Response.json(mismatchedDynamicConfig))
    ];
    for (const fetcher of failures) {
      delete (window as unknown as Record<string, unknown>)[DYNAMIC_LOADER_STATE];
      await expect(initializeDynamicLoader(window, document, fetcher)).resolves.toBe(false);
      expect(document.head.querySelector('script')).toBeNull();
    }
    (window as unknown as Record<string, unknown>).vizoalica = {};
    const fetcher = vi.fn();
    await expect(initializeDynamicLoader(window, document, fetcher)).resolves.toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    delete (window as unknown as Record<string, unknown>).vizoalica;
    delete (window as unknown as Record<string, unknown>)[DYNAMIC_LOADER_STATE];
    const staticScript = document.createElement('script');
    staticScript.dataset.endpoint = 'https://worker.test/events';
    staticScript.dataset.source = 'public-key';
    document.head.append(staticScript);
    await expect(initializeDynamicLoader(window, document, fetcher)).resolves.toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
