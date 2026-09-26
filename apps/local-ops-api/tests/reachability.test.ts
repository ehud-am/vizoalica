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
    expect((await checkInstall([site], 'snippet', false, fetchImpl)).code).toBe('ok');
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
    const result = await checkInstall([site], 'snippet', false, fetchImpl);
    expect(result.code).toBe(code);
    expect(result.nextAction).toMatch(action);
  });

  it('says the site cannot be reached', async () => {
    const result = await checkInstall([site], 'snippet', false, (async () => {
      throw new Error('down');
    }) as unknown as typeof fetch);
    expect(result.code).toBe('site-unreachable');
    expect(result.nextAction).toMatch(/Could not reach https:\/\/site\.test/);
  });

  it('checks the configuration file only on the GitHub path', async () => {
    const { fetchImpl } = siteAnswering({
      '/vizoalica.js': js,
      '/vizoalica/ingest-token': () => token()
    });
    expect((await checkInstall([site], 'github', false, fetchImpl)).code).toBe(
      'config-file-missing'
    );
    expect((await checkInstall([site], 'github', true, fetchImpl)).code).toBe('ok');
    expect((await checkInstall([site], 'snippet', false, fetchImpl)).code).toBe('ok');
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
    const result = await checkInstall([site], 'snippet', false, (async (target: URL) =>
      answer(
        target.pathname === '/vizoalica.js' ? 'text/javascript' : 'text/plain'
      )) as unknown as typeof fetch);
    expect(result.code).toBe('ok');
    expect(read).toBe(false);
  });
});

describe('install check across addresses and redirects', () => {
  const redirect = (to: string) => new Response(null, { status: 301, headers: { location: to } });
  const js = () => new Response('/* sdk */', { headers: { 'content-type': 'text/javascript' } });
  const token = () => new Response('a.b.c', { headers: { 'content-type': 'text/plain' } });
  const bare = 'https://a.test';
  const www = 'https://www.a.test';

  /** Each address answers by its own routes; anything not listed is a 404. */
  function sites(routes: Record<string, Record<string, () => Response>>) {
    const seen: Array<{ redirect: string | undefined }> = [];
    const fetchImpl = (async (target: URL, init?: RequestInit) => {
      seen.push({ redirect: init?.redirect });
      const answer = routes[target.origin]?.[target.pathname];
      return answer ? answer() : new Response('nope', { status: 404 });
    }) as unknown as typeof fetch;
    return { fetchImpl, seen };
  }

  it('never follows a redirect itself', async () => {
    const { fetchImpl, seen } = sites({
      [bare]: { '/vizoalica.js': js, '/vizoalica/ingest-token': token }
    });
    await checkInstall([bare], 'snippet', false, fetchImpl);
    expect(seen.every((item) => item.redirect === 'manual')).toBe(true);
  });

  it('is fine when one address redirects to another that is allowed and works', async () => {
    const { fetchImpl } = sites({
      [bare]: { '/vizoalica.js': () => redirect(`${www}/vizoalica.js`) },
      [www]: { '/vizoalica.js': js, '/vizoalica/ingest-token': token }
    });
    expect((await checkInstall([bare, www], 'snippet', false, fetchImpl)).code).toBe('ok');
  });

  it('names the address a site redirects to when it is not allowed', async () => {
    const { fetchImpl } = sites({
      [bare]: { '/vizoalica.js': () => redirect(`${www}/vizoalica.js`) }
    });
    const result = await checkInstall([bare], 'snippet', false, fetchImpl);
    expect(result.code).toBe('site-redirects');
    expect(result.nextAction).toContain(www);
    expect(result.nextAction).toMatch(/allowed origins/);
  });

  it('says so when every allowed address only redirects to another allowed one', async () => {
    const { fetchImpl } = sites({
      [bare]: { '/vizoalica.js': () => redirect(`${www}/`) },
      [www]: { '/vizoalica.js': () => redirect(`${bare}/`) }
    });
    const result = await checkInstall([bare, www], 'snippet', false, fetchImpl);
    expect(result.code).toBe('site-redirects');
    expect(result.nextAction).toMatch(/Every allowed address redirects/);
  });

  it('checks every allowed address, and names the one that is wrong', async () => {
    // The bare domain is right; the www address has no token endpoint.
    const { fetchImpl } = sites({
      [bare]: { '/vizoalica.js': js, '/vizoalica/ingest-token': token },
      [www]: { '/vizoalica.js': js }
    });
    const result = await checkInstall([bare, www], 'snippet', false, fetchImpl);
    expect(result.code).toBe('token-endpoint-missing');
    expect(result.nextAction).toContain(www);
    // The first failing address in the website's own order wins.
    const both = sites({});
    expect(
      (await checkInstall([bare, www], 'snippet', false, both.fetchImpl)).nextAction
    ).toContain(bare);
  });

  it('a token endpoint that redirects counts as missing, not as followed', async () => {
    const { fetchImpl } = sites({
      [bare]: { '/vizoalica.js': js, '/vizoalica/ingest-token': () => redirect('https://x.test/') }
    });
    expect((await checkInstall([bare], 'snippet', false, fetchImpl)).code).toBe(
      'token-endpoint-missing'
    );
  });

  it('probes at most ten addresses, and ignores one that is not an address', async () => {
    const many = Array.from({ length: 14 }, (_, index) => `https://s${index}.test`);
    const { fetchImpl, seen } = sites({});
    await checkInstall(many, 'snippet', false, fetchImpl);
    expect(seen.length).toBe(10);
    expect((await checkInstall(['not a url'], 'snippet', false, fetchImpl)).code).toBe(
      'site-unreachable'
    );
    const { fetchImpl: ok } = sites({
      [bare]: { '/vizoalica.js': js, '/vizoalica/ingest-token': token }
    });
    expect((await checkInstall(['not a url', bare], 'snippet', false, ok)).code).toBe('ok');
  });
});
