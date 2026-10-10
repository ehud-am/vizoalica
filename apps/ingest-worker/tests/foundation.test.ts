import { describe, expect, it } from 'vitest';
import { loadWorkerConfig } from '../src/config.js';
import { handleWorkerRequest } from '../src/http/worker-adapter.js';

const STRONG = 'a-strong-secret-of-at-least-32-chars!';

describe('Worker configuration', () => {
  it('requires D1, R2, and token bindings', () => {
    expect(() => loadWorkerConfig({} as never)).toThrow('missing_required_cloudflare_binding');
  });
  it('rejects invalid request limits', () => {
    expect(() =>
      loadWorkerConfig({
        VIZOALICA_DB: {},
        VIZOALICA_EVENTS: {},
        VIZOALICA_TOKEN_SECRET: STRONG,
        VIZOALICA_ADMIN_SECRET: STRONG,
        VIZOALICA_ANALYTICS_DIGEST_SECRET: STRONG,
        VIZOALICA_MAX_REQUEST_BYTES: '0'
      } as never)
    ).toThrow('invalid_max_request_bytes');
  });
  it.each([
    ['too short', 'x'.repeat(31)],
    ['too long', 'x'.repeat(257)],
    ['containing whitespace', `${'x'.repeat(40)} y`],
    ['containing a control character', `${'x'.repeat(40)}\n`]
  ])('rejects a secret that is %s, naming the setting and never the value', (_label, weak) => {
    for (const name of [
      'VIZOALICA_TOKEN_SECRET',
      'VIZOALICA_ADMIN_SECRET',
      'VIZOALICA_ANALYTICS_DIGEST_SECRET'
    ]) {
      const env = {
        VIZOALICA_DB: {},
        VIZOALICA_EVENTS: {},
        VIZOALICA_TOKEN_SECRET: STRONG,
        VIZOALICA_ADMIN_SECRET: STRONG,
        VIZOALICA_ANALYTICS_DIGEST_SECRET: STRONG,
        [name]: weak
      };
      let message = '';
      try {
        loadWorkerConfig(env as never);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toBe(`weak_secret:${name}`);
      expect(message).not.toContain(weak.trim());
    }
  });
  it('accepts 32 to 256 printable characters, and the secrets the CLI generates', () => {
    for (const secret of [
      'x'.repeat(32),
      'y'.repeat(256),
      // 256 random bits as base64url, exactly what generateSecret() produces
      'Zk3_-9aQ1mN0pLx7VbT4uRw2YhCe8DsJfGiAoKqMnBt'
    ])
      expect(
        loadWorkerConfig({
          VIZOALICA_DB: {},
          VIZOALICA_EVENTS: {},
          VIZOALICA_TOKEN_SECRET: secret,
          VIZOALICA_ADMIN_SECRET: secret,
          VIZOALICA_ANALYTICS_DIGEST_SECRET: secret
        } as never)
      ).toEqual({ allowUnsignedDemo: false, maxRequestBytes: 131072 });
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
    // Preflights are cached, so a batch does not cost a second Worker invocation each time.
    expect(response.headers.get('access-control-max-age')).toBe('86400');
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

  const ingestRequest = () =>
    new Request('https://ingest.test/v1/events:batch', {
      method: 'POST',
      headers: { 'x-vizoalica-source': 'src_key', 'cf-connecting-ip': '203.0.113.9' },
      body: '{}'
    });

  it('throttles with 429 and retry-after when the rate limiter denies the request', async () => {
    const keys: string[] = [];
    const rateLimiter = {
      limit: async ({ key }: { key: string }) => {
        keys.push(key);
        return { success: false };
      }
    };
    const response = await handleWorkerRequest(ingestRequest(), { rateLimiter } as never, 64);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    await expect(response.json()).resolves.toEqual({ error: 'rate_limited' });
    expect(keys).toEqual(['203.0.113.9']);
  });

  it('keys the limiter on client address only, so a varied source header cannot evade it', async () => {
    const keys: string[] = [];
    const rateLimiter = {
      limit: async ({ key }: { key: string }) => {
        keys.push(key);
        return { success: true };
      }
    };
    for (const source of ['a', 'b', 'c'])
      await handleWorkerRequest(
        new Request('https://ingest.test/v1/events:batch', {
          method: 'POST',
          headers: { 'x-vizoalica-source': source, 'cf-connecting-ip': '203.0.113.9' },
          body: 'x'.repeat(65)
        }),
        { rateLimiter } as never,
        64
      );
    expect(new Set(keys)).toEqual(new Set(['203.0.113.9']));
  });

  it('fails open when the rate limiter itself errors', async () => {
    const rateLimiter = {
      limit: async () => {
        throw new Error('limiter unavailable');
      }
    };
    const response = await handleWorkerRequest(
      new Request('https://ingest.test/v1/events:batch', { method: 'POST', body: 'x'.repeat(65) }),
      { rateLimiter } as never,
      64
    );
    // Reached the body-size check, i.e. was not throttled.
    expect(response.status).toBe(413);
  });
});
