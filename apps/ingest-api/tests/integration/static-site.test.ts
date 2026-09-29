import { describe, expect, it } from 'vitest';
import { ingestBatch } from '../../src/ingestion/pipeline.js';
import { createRepositories, now, pageViewEvent, secret, source, token } from '../test-helpers.js';

const staticSource = { ...source, tokenRequired: false };

function request(overrides: { origin?: string | null; authorization?: string | null } = {}) {
  return {
    body: JSON.stringify([pageViewEvent('evt_static_12345')]),
    publicSourceKey: source.publicSourceKey,
    origin: 'https://example.com',
    authorization: null,
    now,
    ...overrides
  };
}

describe('a static website (no token required)', () => {
  it('accepts an unsigned batch from an allowed origin and marks it origin-checked', async () => {
    const repositories = createRepositories({ source: staticSource });
    const result = await ingestBatch(request(), { repositories, tokenSecret: secret });
    expect(result.status).toBe(202);
    const [stored] = await repositories.listAcceptedEvents();
    expect(stored?.trustLevel).toBe('origin-checked');
    expect(stored?.event.vizoalicaauth).toBe('origin-checked');
  });

  it('refuses an unsigned batch from an origin that is not allowed', async () => {
    const repositories = createRepositories({ source: staticSource });
    const result = await ingestBatch(request({ origin: 'https://evil.example' }), {
      repositories,
      tokenSecret: secret
    });
    expect(result.status).toBe(403);
    expect(result.decision.reasonCodes).toEqual(['origin_not_allowed']);
  });

  it('refuses an unsigned batch with no origin (not from a browser page)', async () => {
    const repositories = createRepositories({ source: staticSource });
    const result = await ingestBatch(request({ origin: null }), {
      repositories,
      tokenSecret: secret
    });
    expect(result.status).toBe(401);
  });

  it('never downgrades an invalid token to an unsigned batch', async () => {
    const repositories = createRepositories({ source: staticSource });
    const result = await ingestBatch(request({ authorization: 'Bearer not-a-token' }), {
      repositories,
      tokenSecret: secret
    });
    expect(result.status).toBe(401);
    expect(result.decision.reasonCodes).toEqual(['malformed_token']);
  });

  it('still accepts a signed batch', async () => {
    const repositories = createRepositories({ source: staticSource });
    const result = await ingestBatch(request({ authorization: `Bearer ${token()}` }), {
      repositories,
      tokenSecret: secret
    });
    expect(result.status).toBe(202);
    const [stored] = await repositories.listAcceptedEvents();
    expect(stored?.trustLevel).toBe('signed-session');
  });

  it('keeps requiring a token for a website that has not opted in', async () => {
    const repositories = createRepositories();
    const result = await ingestBatch(request(), { repositories, tokenSecret: secret });
    expect(result.status).toBe(401);
    expect(await repositories.listAcceptedEvents()).toEqual([]);
  });
});
