import { describe, expect, it } from 'vitest';
import { checkReachability } from '../src/routes/reachability.js';

function fakeFetch(response: Response | (() => Promise<Response>)) {
  return async () => (typeof response === 'function' ? response() : response);
}

describe('config-endpoint reachability check', () => {
  it('reports reachable for a valid version-1 configuration', async () => {
    const result = await checkReachability(
      'https://site.test',
      fakeFetch(Response.json({ version: 1, src: 'https://site.test/vizoalica.js' }))
    );
    expect(result.configEndpointReachable).toBe(true);
    expect(result.configEndpointError).toBeNull();
    expect(new Date(result.configEndpointCheckedAt).toString()).not.toBe('Invalid Date');
  });

  it('reports unreachable on a non-2xx status', async () => {
    const result = await checkReachability(
      'https://site.test',
      fakeFetch(new Response('unavailable', { status: 503 }))
    );
    expect(result.configEndpointReachable).toBe(false);
    expect(result.configEndpointError).toBe('http_503');
  });

  it('reports unreachable for a malformed body', async () => {
    const result = await checkReachability(
      'https://site.test',
      fakeFetch(Response.json({ not: 'a config' }))
    );
    expect(result.configEndpointReachable).toBe(false);
    expect(result.configEndpointError).toBe('malformed_response');
  });

  it('reports unreachable on a network failure', async () => {
    const result = await checkReachability('https://site.test', async () => {
      throw new Error('boom');
    });
    expect(result.configEndpointReachable).toBe(false);
    expect(result.configEndpointError).toBe('network_error');
  });

  it('reports unreachable for an invalid origin without calling fetch', async () => {
    let called = false;
    const result = await checkReachability('not-a-url', async () => {
      called = true;
      throw new Error('should not be called');
    });
    expect(called).toBe(false);
    expect(result.configEndpointReachable).toBe(false);
    expect(result.configEndpointError).toBe('invalid_origin');
  });
});
