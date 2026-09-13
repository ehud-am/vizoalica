import { afterEach, describe, expect, it } from 'vitest';
import { startApi } from './support.js';
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});
describe('local API security boundary', () => {
  it('rejects missing sessions, disallowed origins, malformed bodies, and never exposes credentials', async () => {
    const api = await startApi(() => Response.json([]));
    closers.push(api.close);
    expect((await api.call('/api/projects')).status).toBe(401);
    expect(
      (await api.call('/api/session', { method: 'POST', origin: 'https://evil.test' })).status
    ).toBe(403);
    const cookie = await api.session();
    const invalid = await api.call('/api/projects', { method: 'POST', cookie, body: { name: '' } });
    expect(invalid.status).toBe(400);
    expect(JSON.stringify(invalid.body)).not.toContain('top-secret');
  });
  it('maps Worker authorization failures to revocation without credential leakage', async () => {
    const api = await startApi(() => Response.json({ error: 'unauthorized' }, { status: 401 }));
    closers.push(api.close);
    const response = await api.call('/api/projects', { cookie: await api.session() });
    expect(response).toMatchObject({
      status: 401,
      body: { error: 'access_revoked', recovery: 'reauthorize' }
    });
    expect(JSON.stringify(response)).not.toContain('top-secret');
  });

  it('accepts same-origin browser GETs that provide a referrer instead of Origin', async () => {
    const api = await startApi(() => Response.json([]));
    closers.push(api.close);
    const cookie = await api.session();
    expect(
      (
        await api.call('/api/projects', {
          cookie,
          origin: null,
          referer: 'http://127.0.0.1:5173/'
        })
      ).status
    ).toBe(200);
    expect(
      (
        await api.call('/api/projects', {
          cookie,
          origin: null,
          referer: 'https://evil.test/'
        })
      ).status
    ).toBe(403);
    expect((await api.call('/api/projects', { cookie, origin: null })).status).toBe(403);
  });

  it('prefers Origin over Referer and rejects malformed provenance', async () => {
    const api = await startApi(() => Response.json([]));
    closers.push(api.close);
    const cookie = await api.session();
    expect(
      (
        await api.call('/api/projects', {
          cookie,
          origin: 'https://evil.test',
          referer: 'http://127.0.0.1:5173/'
        })
      ).status
    ).toBe(403);
    expect(
      (await api.call('/api/projects', { cookie, origin: null, referer: 'not a URL' })).status
    ).toBe(403);
  });

  it('rejects unsafe hosts, non-API paths, malformed and oversized request bodies', async () => {
    const api = await startApi(() => Response.json({ id: 'p1' }));
    closers.push(api.close);
    expect((await api.call('/api/session', { method: 'POST', host: '0.0.0.0:4318' })).status).toBe(
      403
    );
    expect((await api.call('/not-api')).status).toBe(404);
    const cookie = await api.session();
    expect((await api.call('/api/projects', { method: 'POST', cookie, rawBody: '{' })).status).toBe(
      400
    );
    expect(
      (await api.call('/api/projects', { method: 'POST', cookie, rawBody: 'x'.repeat(33_000) }))
        .status
    ).toBe(413);
    expect((await api.call('/api/projects', { method: 'PUT', cookie })).status).toBe(404);
  });

  it('keeps installation guidance authenticated, project-scoped, and free of remote secrets', async () => {
    let requestedPath = '';
    const api = await startApi((url) => {
      requestedPath = url.pathname;
      return Response.json({
        publicSourceKey: 'public-key',
        allowedOrigins: ['https://site.test'],
        VIZOALICA_TOKEN_SECRET: 'private-sentinel',
        authorization: 'Bearer private-sentinel'
      });
    });
    closers.push(api.close);
    const path = '/api/projects/project-a/websites/source-b/snippet';
    expect((await api.call(path)).status).toBe(401);
    const response = await api.call(path, { cookie: await api.session() });
    expect(response.status).toBe(200);
    expect(requestedPath).toBe('/v1/admin/projects/project-a/sources/source-b/snippet');
    expect(JSON.stringify(response.body)).not.toMatch(/private-sentinel|Bearer/);
    expect(
      (
        await api.call('/api/projects/project-a/websites/source%2Fother/snippet', {
          cookie: await api.session()
        })
      ).status
    ).toBe(400);
  });
});
