import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  verifyDynamicWebsiteResponses,
  verifyWebsiteResponses,
  verifyWebsite
} from '../../../scripts/verify-website.js';
import { createDemoIngestToken } from '../src/index.js';
const expected = { origin: 'https://site.test', projectId: 'p1', sourceId: 's1' };
const sdk = () =>
  new Response('/* Vizoalica browser SDK */ (()=>{window.vizoalica={}})();', {
    headers: { 'content-type': 'application/javascript' }
  });
const token = (changes = {}) =>
  new Response(
    createDemoIngestToken({ projectId: 'p1', sourceId: 's1', origin: expected.origin, ...changes }),
    { headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } }
  );
const loader = () =>
  new Response('/* vizoalica loader */ (()=>fetch("/vizoalica/config.json"))();', {
    headers: { 'content-type': 'application/javascript' }
  });
const dynamicConfig = () =>
  Response.json(
    {
      version: 1,
      src: '/vizoalica.js',
      'data-endpoint': 'https://analytics.test/v1/events:batch',
      'data-source': 'public-key',
      'data-project': 'p1',
      'data-token-url': '/vizoalica/ingest-token',
      'data-consent': 'analytics-granted'
    },
    { headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } }
  );
describe('website verification', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it('accepts executable SDK and scoped token without returning credentials', async () => {
    expect(await verifyWebsiteResponses(sdk(), token(), expected)).toBeUndefined();
  });
  it('accepts a scoped dynamic loader/config pair and rejects wrong projects', async () => {
    await expect(
      verifyDynamicWebsiteResponses(loader(), dynamicConfig(), token(), expected)
    ).resolves.toBeUndefined();
    const wrong = dynamicConfig();
    const body = await wrong.json();
    await expect(
      verifyDynamicWebsiteResponses(
        loader(),
        Response.json(
          { ...body, 'data-project': 'other' },
          {
            headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
          }
        ),
        token(),
        expected
      )
    ).rejects.toThrow(/expected project/);
  });
  it('rejects Pages HTML fallbacks even with status 200', async () => {
    await expect(
      verifyWebsiteResponses(
        new Response('<html>Fallback</html>', { headers: { 'content-type': 'text/html' } }),
        token(),
        expected
      )
    ).rejects.toThrow('JavaScript');
    await expect(
      verifyWebsiteResponses(
        sdk(),
        new Response('<html>Fallback</html>', {
          headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' }
        }),
        expected
      )
    ).rejects.toThrow('JWT');
  });
  it.each([
    { projectId: 'wrong' },
    { sourceId: 'wrong' },
    { origin: 'https://wrong.test' },
    { ttlSeconds: 3600 },
    { now: new Date(0) }
  ])('rejects scope/lifetime mismatch %j', async (changes) => {
    await expect(verifyWebsiteResponses(sdk(), token(changes), expected)).rejects.toThrow();
  });
  it('rejects wrong MIME, cacheable token and invalid JavaScript body', async () => {
    await expect(verifyWebsiteResponses(sdk(), new Response('token'), expected)).rejects.toThrow();
    await expect(
      verifyWebsiteResponses(
        new Response('<html>fallback</html>', {
          headers: { 'content-type': 'application/javascript' }
        }),
        token(),
        expected
      )
    ).rejects.toThrow();
    const cached = token();
    cached.headers.delete('cache-control');
    await expect(verifyWebsiteResponses(sdk(), cached, expected)).rejects.toThrow('no-store');
  });
  it('rejects empty, oversized, non-SDK and malformed token bodies', async () => {
    for (const body of [null, '/* another library */', 'vizoalica'.repeat(140_000)]) {
      await expect(
        verifyWebsiteResponses(
          new Response(body, { headers: { 'content-type': 'application/javascript' } }),
          token(),
          expected
        )
      ).rejects.toThrow();
    }
    for (const part of ['null', '{broken']) {
      const malformed = `${Buffer.from(part).toString('base64url')}.${Buffer.from('{}').toString('base64url')}.${'a'.repeat(43)}`;
      await expect(
        verifyWebsiteResponses(
          sdk(),
          new Response(malformed, {
            headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' }
          }),
          expected
        )
      ).rejects.toThrow('invalid JSON');
    }
    await expect(
      verifyWebsiteResponses(new Response('vizoalica('), token(), expected)
    ).rejects.toThrow();
    await expect(
      verifyWebsiteResponses(
        new Response('vizoalica(', { headers: { 'content-type': 'text/javascript' } }),
        token(),
        expected
      )
    ).rejects.toThrow('executable');
  });
  it('checks exact HTTPS origin before requests and never prints the returned token', async () => {
    const fetch = vi.fn(async (url: URL) => (url.pathname === '/vizoalica.js' ? sdk() : token()));
    vi.stubGlobal('fetch', fetch);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(verifyWebsite([])).rejects.toThrow('Usage:');
    await expect(verifyWebsite(['http://site.test', 'p1', 's1'])).rejects.toThrow('HTTPS');
    await expect(verifyWebsite(['https://site.test/', 'p1', 's1'])).rejects.toThrow('HTTPS');
    expect(fetch).not.toHaveBeenCalled();
    await verifyWebsite(['--', expected.origin, 'p1', 's1']);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[0].pathname).toBe('/vizoalica/ingest-token');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('claims passed'));
    expect(JSON.stringify(log.mock.calls)).not.toContain('eyJ');

    fetch.mockImplementation(async (url: URL) => {
      if (url.pathname === '/vizoalica-loader.js') return loader();
      if (url.pathname === '/vizoalica/config.json') return dynamicConfig();
      return token();
    });
    await verifyWebsite([expected.origin, 'p1', 's1', '--mode', 'dynamic']);
    expect(fetch.mock.calls.at(-1)?.[0].pathname).toBe('/vizoalica/config.json');
  });
});
