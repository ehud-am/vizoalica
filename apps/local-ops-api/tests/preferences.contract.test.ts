import { afterEach, describe, expect, it } from 'vitest';
import { startApi } from './support.js';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

describe('preferences endpoint contract', () => {
  it('rejects a request without a valid session before touching preferences', async () => {
    const api = await startApi(() => Response.json({}));
    closers.push(api.close);
    const result = await api.call('/api/preferences/theme');
    expect(result.status).toBe(401);
  });

  it('rejects a cross-origin request even with a valid session', async () => {
    const api = await startApi(() => Response.json({}));
    closers.push(api.close);
    const cookie = await api.session();
    const result = await api.call('/api/preferences/theme', {
      cookie,
      origin: 'https://evil.test'
    });
    expect(result.status).toBe(403);
  });

  it('returns theme: null when no preference has been saved (follow the system)', async () => {
    const api = await startApi(() => Response.json({}));
    closers.push(api.close);
    const cookie = await api.session();
    const result = await api.call('/api/preferences/theme', { cookie });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ theme: null });
    expect(result.body.updatedAt).toBeUndefined();
  });

  it('saves and reads back an explicit light or dark preference', async () => {
    const api = await startApi(() => Response.json({}));
    closers.push(api.close);
    const cookie = await api.session();
    const put = await api.call('/api/preferences/theme', {
      cookie,
      method: 'PUT',
      body: { theme: 'dark' }
    });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ theme: 'dark' });
    expect(typeof put.body.updatedAt).toBe('string');

    const get = await api.call('/api/preferences/theme', { cookie });
    expect(get.body).toMatchObject({ theme: 'dark' });
  });

  it('rejects any PUT value other than "light" or "dark"', async () => {
    const api = await startApi(() => Response.json({}));
    closers.push(api.close);
    const cookie = await api.session();
    for (const theme of ['solarized', '', null, 1, undefined]) {
      const result = await api.call('/api/preferences/theme', {
        cookie,
        method: 'PUT',
        body: { theme }
      });
      expect(result.status).toBe(400);
    }
  });

  it('rejects an oversized PUT body', async () => {
    const api = await startApi(() => Response.json({}));
    closers.push(api.close);
    const cookie = await api.session();
    const result = await api.call('/api/preferences/theme', {
      cookie,
      method: 'PUT',
      rawBody: JSON.stringify({ theme: 'dark', filler: 'x'.repeat(100_000) })
    });
    expect(result.status).toBe(413);
  });

  it('responds with Cache-Control: no-store on both GET and PUT', async () => {
    const api = await startApi(() => Response.json({}));
    closers.push(api.close);
    const cookie = await api.session();
    const get = await api.call('/api/preferences/theme', { cookie });
    expect(get.headers['cache-control']).toBe('no-store');
    const put = await api.call('/api/preferences/theme', {
      cookie,
      method: 'PUT',
      body: { theme: 'light' }
    });
    expect(put.headers['cache-control']).toBe('no-store');
  });

  it('never discloses adminSecret or any credential in the preferences response', async () => {
    const api = await startApi(() => Response.json({}));
    closers.push(api.close);
    const cookie = await api.session();
    const result = await api.call('/api/preferences/theme', { cookie });
    expect(JSON.stringify(result.body)).not.toMatch(/secret|credential|token/i);
  });
});
