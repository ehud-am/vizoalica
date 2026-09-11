import { describe, expect, it } from 'vitest';
import { loadWorkerConfig } from '../src/config.js';
import { handleWorkerRequest } from '../src/http/worker-adapter.js';

describe('Worker configuration', () => {
  it('requires D1, R2, and token bindings', () => {
    expect(() => loadWorkerConfig({} as never)).toThrow('missing_required_cloudflare_binding');
  });
  it('rejects invalid request limits', () => {
    expect(() =>
      loadWorkerConfig({
        VIZOALICA_DB: {},
        VIZOALICA_EVENTS: {},
        VIZOALICA_TOKEN_SECRET: 'x',
        VIZOALICA_ADMIN_SECRET: 'x',
        VIZOALICA_ANALYTICS_DIGEST_SECRET: 'x',
        VIZOALICA_MAX_REQUEST_BYTES: '0'
      } as never)
    ).toThrow('invalid_max_request_bytes');
  });
  it('requires a dedicated analytics digest secret', () => {
    expect(() =>
      loadWorkerConfig({
        VIZOALICA_DB: {},
        VIZOALICA_EVENTS: {},
        VIZOALICA_TOKEN_SECRET: 'x',
        VIZOALICA_ADMIN_SECRET: 'x'
      } as never)
    ).toThrow('missing_required_cloudflare_binding');
  });
});

describe('Worker HTTP adapter', () => {
  it('maps unsupported routes to a safe 404 response', async () => {
    const response = await handleWorkerRequest(
      new Request('https://ingest.test/nope'),
      {} as never,
      64
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'not_found' });
  });

  it('accepts browser preflight requests for the ingestion endpoint', async () => {
    const response = await handleWorkerRequest(
      new Request('https://ingest.test/v1/events:batch', {
        method: 'OPTIONS',
        headers: { origin: 'https://analytics.example' }
      }),
      {} as never,
      64
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://analytics.example');
    expect(response.headers.get('access-control-allow-headers')).toContain('x-vizoalica-source');
  });

  it('rejects an unadvertised oversized streamed request before ingestion', async () => {
    const response = await handleWorkerRequest(
      new Request('https://ingest.test/v1/events:batch', {
        method: 'POST',
        body: 'x'.repeat(65)
      }),
      {} as never,
      64
    );
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: 'request_too_large' });
  });
});
