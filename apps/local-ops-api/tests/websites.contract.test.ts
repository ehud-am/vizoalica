import { afterEach, describe, expect, it } from 'vitest';
import { startApi } from './support.js';
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});
describe('website operations contract', () => {
  it('validates creation and returns audit-safe deletion outcomes', async () => {
    const api = await startApi((_url, init) =>
      Response.json(
        init?.method === 'DELETE'
          ? { status: 'deleted' }
          : {
              id: 's1',
              projectId: 'p1',
              name: 'Docs',
              allowedOrigins: ['https://docs.test'],
              status: 'active',
              publicSourceKey: 'public'
            },
        { status: init?.method === 'POST' ? 201 : 200 }
      )
    );
    closers.push(api.close);
    const cookie = await api.session();
    expect(
      (
        await api.call('/api/projects/p1/websites', {
          method: 'POST',
          cookie,
          body: { name: 'Docs', allowedOrigins: ['https://docs.test'] }
        })
      ).status
    ).toBe(201);
    expect(
      (
        await api.call('/api/projects/p1/websites', {
          method: 'POST',
          cookie,
          body: { name: 'Bad', allowedOrigins: ['https://docs.test/path'] }
        })
      ).status
    ).toBe(400);
    expect(
      (await api.call('/api/projects/p1/websites/s1', { method: 'DELETE', cookie })).body
    ).toEqual({ status: 'deleted', audit: 'recorded' });
  });
  it('provides safe retry guidance after interrupted maintenance', async () => {
    const api = await startApi(() => {
      throw new Error('offline');
    });
    closers.push(api.close);
    const response = await api.call('/api/projects/p1/websites/s1', {
      method: 'DELETE',
      cookie: await api.session()
    });
    expect(response).toMatchObject({ status: 503, body: { recovery: 'retry_safely' } });
  });

  it('uses the explicitly selected nested project and maps stale-project failure atomically', async () => {
    const calls: string[] = [];
    const api = await startApi((url) => {
      calls.push(url.pathname);
      return Response.json({ error: 'not_found' }, { status: 404 });
    });
    closers.push(api.close);
    const response = await api.call('/api/projects/project-2/websites', {
      method: 'POST',
      cookie: await api.session(),
      body: { name: 'Launch', allowedOrigins: ['https://launch.test'] }
    });
    expect(response.status).toBe(404);
    expect(calls).toEqual(['/v1/admin/projects/project-2/sources']);
    expect(response.body).toMatchObject({ error: 'not_found' });
  });

  it('proxies collection, details, patch, and null deletion responses', async () => {
    const api = await startApi((url, init) =>
      init?.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : url.pathname.endsWith('/snippet')
          ? Response.json({ publicSourceKey: 'public', allowedOrigins: ['https://site.test'] })
          : Response.json([])
    );
    closers.push(api.close);
    const cookie = await api.session();
    expect((await api.call('/api/projects/p1/websites', { cookie })).status).toBe(200);
    expect((await api.call('/api/projects/p1/websites/s1/snippet', { cookie })).status).toBe(200);
    expect((await api.call('/api/projects/p1/websites/s1/status', { cookie })).status).toBe(200);
    expect(
      (
        await api.call('/api/projects/p1/websites/s1', {
          method: 'PATCH',
          cookie,
          body: { status: 'disabled' }
        })
      ).status
    ).toBe(200);
    expect(
      (await api.call('/api/projects/p1/websites/s1', { method: 'DELETE', cookie })).body
    ).toEqual({ audit: 'recorded' });
    expect((await api.call('/api/projects/bad%2Fid/websites', { cookie })).status).toBe(400);
  });
});
