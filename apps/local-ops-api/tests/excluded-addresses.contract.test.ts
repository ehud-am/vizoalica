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
      path: url.pathname,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined
    });
    return remote(url, init);
  });
  closers.push(api.close);
  return { api, seen, cookie: await api.session() };
}

const website = {
  id: 's1',
  projectId: 'p1',
  name: 'Docs',
  publicSourceKey: 'public',
  allowedOrigins: ['https://docs.test'],
  status: 'active'
};

describe('excluded addresses in the local API', () => {
  it('sends the canonical list to the Worker on create and update', async () => {
    const { api, seen, cookie } = await start(() => Response.json(website));
    await api.call('/api/projects/p1/websites', {
      method: 'POST',
      cookie,
      body: {
        name: 'Docs',
        allowedOrigins: ['https://docs.test'],
        excludedAddresses: ['203.0.113.9/24', '203.0.113.0/24']
      }
    });
    await api.call('/api/projects/p1/websites/s1', {
      method: 'PATCH',
      cookie,
      body: { excludedAddresses: ['2001:DB8::1'] }
    });
    expect(seen.map((call) => call.body)).toEqual([
      {
        name: 'Docs',
        allowedOrigins: ['https://docs.test'],
        excludedAddresses: ['203.0.113.0/24']
      },
      { excludedAddresses: ['2001:db8::1'] }
    ]);
  });

  it('accepts an update that only clears the list', async () => {
    const { api, seen, cookie } = await start(() => Response.json(website));
    const response = await api.call('/api/projects/p1/websites/s1', {
      method: 'PATCH',
      cookie,
      body: { excludedAddresses: [] }
    });
    expect(response.status).toBe(200);
    expect(seen[0]?.body).toEqual({ excludedAddresses: [] });
  });

  it('refuses a bad entry before the Worker, naming its position and not repeating it', async () => {
    const { api, seen, cookie } = await start(() => Response.json(website));
    const response = await api.call('/api/projects/p1/websites/s1', {
      method: 'PATCH',
      cookie,
      body: { excludedAddresses: ['203.0.113.7', 'office.example.com'] }
    });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: 'invalid_request',
      field: 'excludedAddresses',
      reason: 'invalid_entry',
      index: 1
    });
    expect(JSON.stringify(response.body)).not.toContain('office');
    expect(seen).toEqual([]);
  });

  it('refuses a list that is too long or not a list', async () => {
    const { api, seen, cookie } = await start(() => Response.json(website));
    const tooMany = await api.call('/api/projects/p1/websites/s1', {
      method: 'PATCH',
      cookie,
      body: { excludedAddresses: Array.from({ length: 26 }, (_, index) => `10.0.0.${index}`) }
    });
    expect(tooMany.body).toMatchObject({ reason: 'too_many' });
    const notAList = await api.call('/api/projects/p1/websites', {
      method: 'POST',
      cookie,
      body: { name: 'Docs', allowedOrigins: ['https://docs.test'], excludedAddresses: '1.2.3.4' }
    });
    expect(notAList.body).toMatchObject({ reason: 'not_a_list' });
    expect(seen).toEqual([]);
  });

  it('passes through the Worker’s excluded-hits report and its failures', async () => {
    const report = { total: 5, days: [{ day: '2026-01-01', count: 5 }], windowDays: 30 };
    const { api, seen, cookie } = await start(() => Response.json(report));
    const result = await api.call('/api/projects/p1/websites/s1/excluded-hits', { cookie });
    expect(result).toMatchObject({ status: 200, body: report });
    expect(seen[0]?.path).toBe('/v1/admin/projects/p1/sources/s1/excluded-hits');

    const missing = await start(() => Response.json({ error: 'not_found' }, { status: 404 }));
    const old = await missing.api.call('/api/projects/p1/websites/s1/excluded-hits', {
      cookie: missing.cookie
    });
    expect(old.status).toBe(404);
    const unsafe = await api.call('/api/projects/p%201/websites/s1/excluded-hits', { cookie });
    expect(unsafe.status).toBe(400);
  });
});
