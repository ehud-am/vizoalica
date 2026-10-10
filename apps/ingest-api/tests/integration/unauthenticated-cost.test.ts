import { describe, expect, it } from 'vitest';
import { ingestBatch } from '../../src/ingestion/pipeline.js';
import { createRepositories, now, pageViewEvent, secret, source } from '../test-helpers.js';

function countingRepositories() {
  const repo = createRepositories();
  let lookups = 0;
  const original = repo.findSourceByPublicKey.bind(repo);
  repo.findSourceByPublicKey = async (key: string) => {
    lookups += 1;
    return original(key);
  };
  return { repo, lookups: () => lookups };
}

const request = (authorization: string | null, origin: string | null = 'https://example.com') => ({
  body: JSON.stringify([pageViewEvent('evt_unauth_12345')]),
  publicSourceKey: source.publicSourceKey,
  origin,
  authorization,
  now
});

describe('unauthenticated ingest requests', () => {
  it.each([
    ['no token and no origin', null, null, 'missing_token'],
    ['a malformed token', 'Bearer not-a-token', 'https://example.com', 'malformed_token']
  ])(
    'are rejected with 401 before any database lookup (%s)',
    async (_label, header, origin, reason) => {
      const { repo, lookups } = countingRepositories();
      const result = await ingestBatch(request(header, origin), {
        repositories: repo,
        tokenSecret: secret
      });
      expect(result.status).toBe(401);
      expect(result.decision.reasonCodes).toEqual([reason]);
      expect(lookups()).toBe(0);
    }
  );

  it('look the website up once when unsigned from a browser origin, then refuse a token-only website', async () => {
    const { repo, lookups } = countingRepositories();
    const result = await ingestBatch(request(null), { repositories: repo, tokenSecret: secret });
    expect(result.status).toBe(401);
    expect(result.decision.reasonCodes).toEqual(['missing_token']);
    expect(lookups()).toBe(1);
  });

  it('still reaches the source lookup when the unsigned-demo bypass is enabled', async () => {
    const { repo, lookups } = countingRepositories();
    await ingestBatch(request(null), {
      repositories: repo,
      tokenSecret: secret,
      allowUnsignedDemo: true
    });
    expect(lookups()).toBe(1);
  });
});
