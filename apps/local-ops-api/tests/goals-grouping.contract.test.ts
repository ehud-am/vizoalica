import { afterEach, describe, expect, it } from 'vitest';
import { startApi } from './support.js';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

async function start(remote: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  const seen: Array<{ path: string; method: string; body: unknown }> = [];
  const api = await startApi((url, init) => {
    seen.push({
      path: url.pathname + url.search,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined
    });
    return remote(url, init);
  });
  closers.push(api.close);
  return { api, seen, cookie: await api.session() };
}

const website = { id: 's1', projectId: 'p1', name: 'Docs', status: 'active' };

describe('page grouping rules in the local API', () => {
  it('sends trimmed rules to the Worker', async () => {
    const { api, seen, cookie } = await start(() => Response.json(website));
    await api.call('/api/projects/p1/websites/s1', {
      method: 'PATCH',
      cookie,
      body: { groupingRules: [{ pattern: ' /blog/* ', key: '/blog/:post' }] }
    });
    expect(seen[0]?.body).toEqual({ groupingRules: [{ pattern: '/blog/*', key: '/blog/:post' }] });
  });

  it('refuses a bad rule before the Worker, naming its position', async () => {
    const { api, seen, cookie } = await start(() => Response.json(website));
    const response = await api.call('/api/projects/p1/websites/s1', {
      method: 'PATCH',
      cookie,
      body: {
        groupingRules: [
          { pattern: '/ok', key: '/ok' },
          { pattern: 'bad', key: '/x' }
        ]
      }
    });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: 'invalid_request',
      field: 'groupingRules',
      reason: 'invalid_rule',
      index: 1
    });
    expect(seen).toEqual([]);
  });
});

describe('goals in the local API', () => {
  it('lists, creates, reports and deletes goals through the Worker', async () => {
    const { api, seen, cookie } = await start((url, init) =>
      url.pathname.endsWith('/goals/report')
        ? Response.json({ goals: [] })
        : init?.method === 'POST'
          ? Response.json({ id: 'g1' }, { status: 201 })
          : Response.json([])
    );
    const base = '/api/projects/p1/websites/s1/goals';
    expect((await api.call(base, { cookie })).status).toBe(200);
    const created = await api.call(base, {
      method: 'POST',
      cookie,
      body: { name: 'Signed up', kind: 'event', target: 'signup', extra: 'dropped' }
    });
    expect(created.status).toBe(201);
    expect(
      (
        await api.call(
          `${base}/report?start=2026-01-01T00:00:00.000Z&end=2026-01-02T00:00:00.000Z`,
          { cookie }
        )
      ).status
    ).toBe(200);
    expect((await api.call(`${base}/g1`, { method: 'DELETE', cookie })).status).toBe(200);
    expect(seen.map((call) => `${call.method} ${call.path.split('?')[0]}`)).toEqual([
      'GET /v1/admin/projects/p1/sources/s1/goals',
      'POST /v1/admin/projects/p1/sources/s1/goals',
      'GET /v1/admin/projects/p1/sources/s1/goals/report',
      'DELETE /v1/admin/projects/p1/sources/s1/goals/g1'
    ]);
    expect(seen[1]?.body).toEqual({ name: 'Signed up', kind: 'event', target: 'signup' });
  });

  it('refuses a bad range and an unsafe id before the Worker', async () => {
    const { api, seen, cookie } = await start(() => Response.json({}));
    const range = await api.call('/api/projects/p1/websites/s1/goals/report?start=x&end=y', {
      cookie
    });
    expect(range.status).toBe(400);
    const unsafe = await api.call('/api/projects/p1/websites/s1/goals/..%2Fx', {
      method: 'DELETE',
      cookie
    });
    expect(unsafe.status).toBe(400);
    expect(seen).toEqual([]);
  });
});
