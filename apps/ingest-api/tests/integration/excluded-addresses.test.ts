import { describe, expect, it, vi } from 'vitest';
import { ingestBatch } from '../../src/ingestion/pipeline.js';
import { createRepositories, now, pageViewEvent, secret, source, token } from '../test-helpers.js';

const excludingSource = { ...source, excludedAddresses: ['203.0.113.7', '198.51.100.0/24'] };

function request(overrides: Record<string, unknown> = {}) {
  return {
    body: JSON.stringify([pageViewEvent('evt_excl_00001'), pageViewEvent('evt_excl_00002')]),
    publicSourceKey: source.publicSourceKey,
    origin: 'https://example.com',
    authorization: `Bearer ${token()}`,
    clientAddress: '203.0.113.7',
    now,
    ...overrides
  };
}

function repositoriesFor(excluded = excludingSource) {
  const repositories = createRepositories({ source: excluded });
  const recordExcludedHits = vi.fn(async () => undefined);
  const reserveQuota = vi.fn(async () => true);
  const recordDashboardRollups = vi.fn(async () => undefined);
  return Object.assign(repositories, { recordExcludedHits, reserveQuota, recordDashboardRollups });
}

describe('excluded addresses', () => {
  it('drops an authorized batch from an excluded address, counting it and storing nothing', async () => {
    const repositories = repositoriesFor();
    const result = await ingestBatch(request(), { repositories, tokenSecret: secret });
    expect(result.status).toBe(202);
    expect(result.decision).toMatchObject({
      decision: 'excluded',
      reasonCodes: ['excluded_address'],
      acceptedCount: 0,
      rejectedCount: 0
    });
    expect(await repositories.listAcceptedEvents()).toEqual([]);
    expect(await repositories.listDecisions()).toEqual([]);
    expect(repositories.reserveQuota).not.toHaveBeenCalled();
    expect(repositories.recordDashboardRollups).not.toHaveBeenCalled();
    expect(repositories.recordExcludedHits).toHaveBeenCalledWith({
      projectId: source.projectId,
      sourceId: source.id,
      eventCount: 2,
      now
    });
  });

  it('matches a range, and counts normally from any other address', async () => {
    const repositories = repositoriesFor();
    expect(
      (
        await ingestBatch(request({ clientAddress: '198.51.100.250' }), {
          repositories,
          tokenSecret: secret
        })
      ).decision.decision
    ).toBe('excluded');
    const outside = await ingestBatch(request({ clientAddress: '203.0.113.8' }), {
      repositories,
      tokenSecret: secret
    });
    expect(outside.decision.decision).toBe('accepted');
    expect(await repositories.listAcceptedEvents()).toHaveLength(2);
  });

  it('counts normally when no address is known, or the website excludes nothing', async () => {
    for (const clientAddress of [undefined, null, '']) {
      const repositories = repositoriesFor();
      const result = await ingestBatch(request({ clientAddress }), {
        repositories,
        tokenSecret: secret
      });
      expect(result.decision.decision).toBe('accepted');
      expect(repositories.recordExcludedHits).not.toHaveBeenCalled();
    }
    for (const excludedAddresses of [undefined, []]) {
      const repositories = repositoriesFor({
        ...source,
        ...(excludedAddresses ? { excludedAddresses } : {})
      });
      const result = await ingestBatch(request(), { repositories, tokenSecret: secret });
      expect(result.decision.decision).toBe('accepted');
    }
  });

  it('refuses a bad token or an unknown origin from an excluded address exactly as from any other (no oracle)', async () => {
    const repositories = repositoriesFor();
    const badToken = await ingestBatch(request({ authorization: 'Bearer not-a-token' }), {
      repositories,
      tokenSecret: secret
    });
    expect(badToken.status).toBe(401);
    const noToken = await ingestBatch(request({ authorization: null }), {
      repositories,
      tokenSecret: secret
    });
    expect(noToken.status).toBe(401);
    const wrongOrigin = await ingestBatch(request({ origin: 'https://evil.example' }), {
      repositories,
      tokenSecret: secret
    });
    expect(wrongOrigin.status).toBe(403);
    const malformed = await ingestBatch(request({ body: '{' }), {
      repositories,
      tokenSecret: secret
    });
    expect(malformed.status).toBe(400);
    expect(repositories.recordExcludedHits).not.toHaveBeenCalled();
  });

  it('applies to a static website (origin-checked, no token) too', async () => {
    const repositories = repositoriesFor({ ...excludingSource, tokenRequired: false });
    const result = await ingestBatch(request({ authorization: null }), {
      repositories,
      tokenSecret: secret
    });
    expect(result.decision.decision).toBe('excluded');
  });

  it('still drops the batch when the counter cannot be written', async () => {
    const repositories = repositoriesFor();
    repositories.recordExcludedHits.mockRejectedValueOnce(new Error('database unavailable'));
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const result = await ingestBatch(request(), { repositories, tokenSecret: secret, logger });
    expect(result.status).toBe(202);
    expect(result.decision.decision).toBe('excluded');
    expect(await repositories.listAcceptedEvents()).toEqual([]);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('203.0.113.7');
  });

  it('works for a repository that cannot count', async () => {
    const repositories = createRepositories({ source: excludingSource });
    const result = await ingestBatch(request(), { repositories, tokenSecret: secret });
    expect(result.decision.decision).toBe('excluded');
  });

  it('never logs or returns the address', async () => {
    const repositories = repositoriesFor();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const result = await ingestBatch(request(), { repositories, tokenSecret: secret, logger });
    const everything = JSON.stringify([result, logger.info.mock.calls, logger.warn.mock.calls]);
    expect(everything).not.toContain('203.0.113.7');
    expect(everything).not.toContain('198.51.100');
  });
});
