import { describe, expect, it } from 'vitest';
import { evaluateQuota } from '../../src/quotas/quota-policy.js';
import { quotaPolicy } from '../test-helpers.js';

describe('evaluateQuota', () => {
  it('allows requests within limits', () => {
    expect(evaluateQuota({ policy: quotaPolicy, requestBytes: 100, eventCount: 2 })).toEqual({
      ok: true
    });
  });

  it('rejects oversized requests before storage', () => {
    expect(
      evaluateQuota({
        policy: quotaPolicy,
        requestBytes: quotaPolicy.maxRequestBytes + 1,
        eventCount: 1
      })
    ).toEqual({ ok: false, reason: 'request_too_large' });
  });

  it('rejects batches over event limits', () => {
    expect(
      evaluateQuota({
        policy: quotaPolicy,
        requestBytes: 100,
        eventCount: quotaPolicy.maxEventsPerBatch + 1
      })
    ).toEqual({ ok: false, reason: 'too_many_events' });
  });
});
