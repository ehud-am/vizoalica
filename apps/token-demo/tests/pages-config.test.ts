import { describe, expect, it } from 'vitest';
import { onRequest } from '../../../examples/cloudflare-pages/functions/vizoalica/config.json.js';

const env = {
  VIZOALICA_SDK_SRC: '/vizoalica.js',
  VIZOALICA_INGEST_ENDPOINT: 'https://analytics.example/v1/events:batch',
  VIZOALICA_PUBLIC_SOURCE_KEY: 'public-key',
  VIZOALICA_PROJECT_ID: 'project-1',
  VIZOALICA_TOKEN_URL: '/vizoalica/ingest-token',
  VIZOALICA_CONSENT: 'analytics-granted',
  VIZOALICA_TOKEN_SECRET: 'must-not-leak',
  VIZOALICA_SOURCE_ID: 'internal-source'
};

describe('Cloudflare Pages public configuration', () => {
  it('maps only public bindings and returns defensive headers', async () => {
    const response = await onRequest({
      request: new Request('https://site.example/vizoalica/config.json'),
      env
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({
      version: 1,
      src: '/vizoalica.js',
      'data-endpoint': 'https://analytics.example/v1/events:batch',
      'data-source': 'public-key',
      'data-project': 'project-1',
      'data-token-url': '/vizoalica/ingest-token',
      'data-consent': 'analytics-granted'
    });
    expect(body).not.toMatch(/must-not-leak|internal-source|secret/i);
  });

  it('rejects methods, placeholders, and incomplete configuration without partial output', async () => {
    const method = await onRequest({
      request: new Request('https://site.example/vizoalica/config.json', { method: 'POST' }),
      env
    });
    expect(method.status).toBe(405);
    expect(method.headers.get('allow')).toBe('GET');

    for (const invalid of [
      { ...env, VIZOALICA_PROJECT_ID: 'REPLACE_PROJECT' },
      { ...env, VIZOALICA_PUBLIC_SOURCE_KEY: '' },
      { ...env, VIZOALICA_TOKEN_URL: 'https://other.example/token' }
    ]) {
      const response = await onRequest({
        request: new Request('https://site.example/vizoalica/config.json'),
        env: invalid
      });
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain('data-project');
    }
  });
});
