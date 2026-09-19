/**
 * Denied admin and MCP requests are audited, but never once per request: an unauthenticated caller
 * must not be able to make the Worker write to D1 as often as they like. A gate lets one denial
 * through per interval per Worker instance; the rest are still refused, just not recorded, so a
 * flood costs the caller a rejected request and costs the operator no database writes.
 */
const DENIAL_AUDIT_INTERVAL_MS = 60_000;

export type DenialAuditGate = () => boolean;

export function createDenialAuditGate(
  intervalMs = DENIAL_AUDIT_INTERVAL_MS,
  now: () => number = Date.now
): DenialAuditGate {
  let last = Number.NEGATIVE_INFINITY;
  return () => {
    const current = now();
    if (current - last < intervalMs) return false;
    last = current;
    return true;
  };
}

/** Shared by the admin and MCP adapters, so together they stay within one write per interval. */
export const shouldAuditDenial: DenialAuditGate = createDenialAuditGate();
