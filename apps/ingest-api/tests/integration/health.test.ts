import { describe, expect, it } from 'vitest';
import { createRequestHandler } from '../../src/http/server.js';

describe('health endpoint', () => {
  it('returns healthy status', async () => {
    const response = await createRequestHandler()(new Request('http://localhost/healthz'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });
});
