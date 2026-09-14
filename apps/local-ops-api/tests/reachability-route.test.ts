import { describe, expect, it } from 'vitest';
import { startApi } from './support.js';

describe('website reachability route', () => {
  it('reports reachable when the website origin serves a valid configuration', async () => {
    const api = await startApi((url) =>
      url.origin === 'https://site.test'
        ? Response.json({ version: 1, src: 'https://site.test/vizoalica.js' })
        : Response.json({ publicSourceKey: 'key', allowedOrigins: ['https://site.test'] })
    );
    const response = await api.call('/api/projects/p1/websites/s1/reachability', {
      cookie: await api.session()
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      configEndpointReachable: true,
      configEndpointError: null
    });
    expect(typeof response.body.configEndpointCheckedAt).toBe('string');
  });

  it('reports unreachable when the website origin is down', async () => {
    const api = await startApi((url) =>
      url.origin === 'https://site.test'
        ? new Response('down', { status: 503 })
        : Response.json({ publicSourceKey: 'key', allowedOrigins: ['https://site.test'] })
    );
    const response = await api.call('/api/projects/p1/websites/s1/reachability', {
      cookie: await api.session()
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      configEndpointReachable: false,
      configEndpointError: 'http_503'
    });
  });

  it('fails safely when the website metadata itself is unavailable', async () => {
    const api = await startApi(() => Response.json({ publicSourceKey: 'key', allowedOrigins: [] }));
    const response = await api.call('/api/projects/p1/websites/s1/reachability', {
      cookie: await api.session()
    });
    expect(response.status).toBe(503);
  });
});
