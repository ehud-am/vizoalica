import { describe, expect, it } from 'vitest';
import { checkInstall, checkReachability } from '../src/routes/reachability.js';

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

  it('refuses to buffer an oversized response body', async () => {
    const result = await checkReachability(
      'https://site.test',
      fakeFetch(new Response(JSON.stringify({ version: 1, src: 'x'.repeat(20_000) })))
    );
    expect(result.configEndpointReachable).toBe(false);
    expect(result.configEndpointError).toBe('malformed_response');
  });

  it('reports a non-JSON body as malformed', async () => {
    const result = await checkReachability('https://site.test', fakeFetch(new Response('<html>')));
    expect(result.configEndpointError).toBe('malformed_response');
  });
});

describe('install check', () => {
  const site = 'https://site.test';
  const js = () => new Response('/* sdk */', { headers: { 'content-type': 'text/javascript' } });
  const token = (status = 200) =>
    new Response(status === 200 ? 'a.b.c' : 'no', {
      status,
      headers: { 'content-type': 'text/plain' }
    });
  /** A site whose answer depends on the path, and which records what it was asked. */
  function siteAnswering(routes: Record<string, () => Response>) {
    const asked: Array<{ path: string; origin: string | null }> = [];
    const fetchImpl = (async (target: URL, init?: RequestInit) => {
      asked.push({
        path: target.pathname,
        origin: new Headers(init?.headers).get('origin')
      });
      const answer = routes[target.pathname];
      return answer ? answer() : new Response('nope', { status: 404 });
    }) as unknown as typeof fetch;
    return { fetchImpl, asked };
  }

  it('is fine when the file and the token endpoint both answer', async () => {
    const { fetchImpl, asked } = siteAnswering({
      '/vizoalica.js': js,
      '/vizoalica/ingest-token': () => token()
    });
    expect((await checkInstall(site, 'snippet', false, fetchImpl)).code).toBe('ok');
    // The token endpoint is asked with the site's own origin, as its page would.
    expect(asked.find((item) => item.path === '/vizoalica/ingest-token')?.origin).toBe(site);
  });

  it.each([
    ['the SDK file is missing', {}, 'sdk-file-missing', /vizoalica\.js/],
    [
      'the host answers the SDK path with its home page',
      {
        '/vizoalica.js': () => new Response('<html>', { headers: { 'content-type': 'text/html' } })
      },
      'sdk-file-missing',
      /root folder/
    ],
    [
      'the token endpoint is missing',
      { '/vizoalica.js': js },
      'token-endpoint-missing',
      /token endpoint/
    ],
    [
      'the host answers the token path with its home page',
      {
        '/vizoalica.js': js,
        '/vizoalica/ingest-token': () =>
          new Response('<html>', { headers: { 'content-type': 'text/html' } })
      },
      'token-endpoint-missing',
      /token endpoint/
    ],
    [
      'the token endpoint refuses the origin',
      { '/vizoalica.js': js, '/vizoalica/ingest-token': () => token(403) },
      'origin-not-allowed',
      /site origins/
    ],
    [
      'the token endpoint is misconfigured',
      { '/vizoalica.js': js, '/vizoalica/ingest-token': () => token(503) },
      'token-endpoint-rejecting',
      /VIZOALICA_TOKEN_SECRET/
    ]
  ] as const)('names one action when %s', async (_name, routes, code, action) => {
    const { fetchImpl } = siteAnswering(routes as Record<string, () => Response>);
    const result = await checkInstall(site, 'snippet', false, fetchImpl);
    expect(result.code).toBe(code);
    expect(result.nextAction).toMatch(action);
  });

  it('says the site cannot be reached, and mentions a redirect', async () => {
    const result = await checkInstall(site, 'snippet', false, (async () => {
      throw new Error('down');
    }) as unknown as typeof fetch);
    expect(result.code).toBe('site-unreachable');
    expect(result.nextAction).toMatch(/redirects/);
  });

  it('checks the configuration file only on the GitHub path', async () => {
    const { fetchImpl } = siteAnswering({
      '/vizoalica.js': js,
      '/vizoalica/ingest-token': () => token()
    });
    expect((await checkInstall(site, 'github', false, fetchImpl)).code).toBe('config-file-missing');
    expect((await checkInstall(site, 'github', true, fetchImpl)).code).toBe('ok');
    expect((await checkInstall(site, 'snippet', false, fetchImpl)).code).toBe('ok');
  });

  it('never reads a site response body', async () => {
    let read = false;
    const answer = (type: string) =>
      new Response(
        // With no buffer, the stream is only pulled when something reads it.
        new ReadableStream(
          {
            pull() {
              read = true;
            }
          },
          { highWaterMark: 0 }
        ),
        { headers: { 'content-type': type } }
      );
    const result = await checkInstall(site, 'snippet', false, (async (target: URL) =>
      answer(
        target.pathname === '/vizoalica.js' ? 'text/javascript' : 'text/plain'
      )) as unknown as typeof fetch);
    expect(result.code).toBe('ok');
    expect(read).toBe(false);
  });
});
