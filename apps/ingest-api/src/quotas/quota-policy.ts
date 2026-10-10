import type { QuotaPolicy } from '../domain/types.js';

export type QuotaDecision =
  | { ok: true }
  | { ok: false; reason: 'request_too_large' | 'too_many_events' | 'token_event_limit_exceeded' };

export function evaluateQuota(input: {
  policy: QuotaPolicy;
  requestBytes: number;
  eventCount: number;
  tokenMaxEvents?: number;
}): QuotaDecision {
  if (input.requestBytes > input.policy.maxRequestBytes)
    return { ok: false, reason: 'request_too_large' };
  if (input.eventCount > input.policy.maxEventsPerBatch)
    return { ok: false, reason: 'too_many_events' };
  if (input.tokenMaxEvents && input.eventCount > input.tokenMaxEvents)
    return { ok: false, reason: 'token_event_limit_exceeded' };
  return { ok: true };
}
