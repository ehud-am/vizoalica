import { describe, expect, it } from 'vitest';
import { startApi } from './support.js';

describe('project deletion', () => {
  it('deletes a project and returns an audit-safe outcome', async () => {
    const api = await startApi((_url, init) =>
      Response.json(init?.method === 'DELETE' ? { status: 'deleted' } : { error: 'not_found' })
    );
    const cookie = await api.session();
    const response = await api.call('/api/projects/p1', { method: 'DELETE', cookie });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'deleted', audit: 'recorded' });
  });

  it('reports not_found without recording a false audit outcome', async () => {
    const api = await startApi(() => Response.json({ error: 'not_found' }, { status: 404 }));
    const cookie = await api.session();
    const response = await api.call('/api/projects/missing', { method: 'DELETE', cookie });
    expect(response.status).toBe(404);
  });

  it('rejects an unsafe project id before contacting the Worker', async () => {
    const api = await startApi(() => {
      throw new Error('should not be called');
    });
    const cookie = await api.session();
    const response = await api.call('/api/projects/..%2Fetc', { method: 'DELETE', cookie });
    expect(response.status).toBe(400);
  });
});
