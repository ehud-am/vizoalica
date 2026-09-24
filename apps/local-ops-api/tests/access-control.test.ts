import { afterEach, describe, expect, it } from 'vitest';
import { startApi } from './support.js';
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});
describe('local access lifecycle', () => {
  it('expires sessions and rejects follow-up access', async () => {
    const api = await startApi(() => Response.json([]), -1);
    closers.push(api.close);
    expect((await api.call('/api/projects', { cookie: await api.session() })).status).toBe(401);
  });
});
