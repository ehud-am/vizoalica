import type { TokenClaims } from '@vizoalica/event-contracts';

export type TokenConstraintResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'token_not_yet_valid'
        | 'token_expired'
        | 'token_scope_invalid'
        | 'token_origin_mismatch'
        | 'token_event_limit_exceeded';
    };

export function validateTokenConstraints(input: {
  claims: TokenClaims;
  now?: Date;
  origin?: string | null;
  eventCount: number;
}): TokenConstraintResult {
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (input.claims.nbf > nowSeconds) return { ok: false, reason: 'token_not_yet_valid' };
  if (input.claims.exp <= nowSeconds) return { ok: false, reason: 'token_expired' };
  if (input.claims.scope !== 'events:write') return { ok: false, reason: 'token_scope_invalid' };
  if (input.origin && input.claims.origin !== input.origin)
    return { ok: false, reason: 'token_origin_mismatch' };
  if (input.claims.max_events && input.eventCount > input.claims.max_events) {
    return { ok: false, reason: 'token_event_limit_exceeded' };
  }
  return { ok: true };
}

export function isEventTimeAcceptable(
  time: string,
  now = new Date(),
  maxAgeMs = 86_400_000,
  maxFutureSkewMs = 300_000
): boolean {
  const eventTime = Date.parse(time);
  if (!Number.isFinite(eventTime)) return false;
  const current = now.getTime();
  return eventTime >= current - maxAgeMs && eventTime <= current + maxFutureSkewMs;
}
