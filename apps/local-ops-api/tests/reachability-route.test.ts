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

describe('install check on the reachability route', () => {
  const metadata = () =>
    Response.json({ publicSourceKey: 'key', allowedOrigins: ['https://site.test'] });

  it('adds the install result only when the page says which path it checks', async () => {
    const api = await startApi((url) =>
      url.origin === 'https://site.test'
        ? url.pathname === '/vizoalica.js'
          ? new Response('/* sdk */', { headers: { 'content-type': 'text/javascript' } })
          : url.pathname === '/vizoalica/ingest-token'
            ? new Response('a.b.c', { headers: { 'content-type': 'text/plain' } })
            : Response.json({ version: 1, src: '/vizoalica.js' })
        : metadata()
    );
    const cookie = await api.session();
    const plain = await api.call('/api/projects/p1/websites/s1/reachability', { cookie });
    expect(plain.body.install).toBeUndefined();
    const checked = await api.call('/api/projects/p1/websites/s1/reachability?path=snippet', {
      cookie
    });
    expect(checked.body.install).toEqual({ code: 'ok', nextAction: 'No action needed.' });
    // Anything else is ignored, never passed on.
    const odd = await api.call('/api/projects/p1/websites/s1/reachability?path=../x', { cookie });
    expect(odd.body.install).toBeUndefined();
  });

  it('names the token endpoint when the site lacks it', async () => {
    const api = await startApi((url) =>
      url.origin === 'https://site.test'
        ? url.pathname === '/vizoalica.js'
          ? new Response('/* sdk */', { headers: { 'content-type': 'text/javascript' } })
          : new Response('nope', { status: 404 })
        : metadata()
    );
    const response = await api.call('/api/projects/p1/websites/s1/reachability?path=snippet', {
      cookie: await api.session()
    });
    expect(response.body.install.code).toBe('token-endpoint-missing');
  });
});
