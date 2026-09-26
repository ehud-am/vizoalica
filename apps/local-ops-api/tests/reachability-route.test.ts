import { describe, expect, it } from 'vitest';
import { startApi } from './support.js';

/**
 * The deployed Worker answers a website's metadata only on its `/snippet` route; a bare source has
 * no GET. The stub behaves the same, so a route that asks for the bare source fails here as it does live.
 */
const workerMetadata = (origins: string[]) => (url: URL) =>
  url.pathname.endsWith('/snippet')
    ? Response.json({ publicSourceKey: 'key', allowedOrigins: origins })
    : new Response('{"error":"not_found"}', { status: 404 });

describe('website reachability route', () => {
  it('reports reachable when the website origin serves a valid configuration', async () => {
    const api = await startApi((url) =>
      url.origin === 'https://site.test'
        ? Response.json({ version: 1, src: 'https://site.test/vizoalica.js' })
        : workerMetadata(['https://site.test'])(url)
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
        : workerMetadata(['https://site.test'])(url)
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
    const api = await startApi(workerMetadata([]));
    const response = await api.call('/api/projects/p1/websites/s1/reachability', {
      cookie: await api.session()
    });
    expect(response.status).toBe(503);
  });
});

describe('install check on the reachability route', () => {
  const metadata = (url: URL) => workerMetadata(['https://site.test'])(url);

  it('adds the install result only when the page says which path it checks', async () => {
    const api = await startApi((url) =>
      url.origin === 'https://site.test'
        ? url.pathname === '/vizoalica.js'
          ? new Response('/* sdk */', { headers: { 'content-type': 'text/javascript' } })
          : url.pathname === '/vizoalica/ingest-token'
            ? new Response('a.b.c', { headers: { 'content-type': 'text/plain' } })
            : Response.json({ version: 1, src: '/vizoalica.js' })
        : metadata(url)
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
        : metadata(url)
    );
    const response = await api.call('/api/projects/p1/websites/s1/reachability?path=snippet', {
      cookie: await api.session()
    });
    expect(response.body.install.code).toBe('token-endpoint-missing');
  });
});
