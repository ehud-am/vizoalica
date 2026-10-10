import { describe, expect, it } from 'vitest';
import { ingestBatch } from '../../src/ingestion/pipeline.js';
import {
  createRepositories,
  pageViewEvent,
  quotaPolicy,
  secret,
  source,
  token,
  now
} from '../test-helpers.js';

describe('ingestion load smoke', () => {
  it('accepts 1,000 valid events across bounded batches', async () => {
    const repo = createRepositories({ quotaPolicy: { ...quotaPolicy, maxEventsPerDay: 2_000 } });
    let accepted = 0;
    for (let i = 0; i < 40; i += 1) {
      const events = Array.from({ length: 25 }, (_unused, index) =>
        pageViewEvent(`evt_${i}_${index}_123456`)
      );
      const result = await ingestBatch(
        {
          body: JSON.stringify(events),
          publicSourceKey: source.publicSourceKey,
          origin: 'https://example.com',
          authorization: `Bearer ${token({ jti: `jti_${i}`, max_events: 25 })}`,
          now
        },
        { repositories: repo, tokenSecret: secret }
      );
      expect(result.status).toBe(202);
      accepted += result.decision.acceptedCount;
    }
    expect(accepted).toBe(1_000);
    await expect(repo.listAcceptedEvents()).resolves.toHaveLength(1_000);
  });
});
