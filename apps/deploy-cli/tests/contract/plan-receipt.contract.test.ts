import { describe, expect, it } from 'vitest';
import { createPlan, createReceipt, validateReceipt } from '../../src/plan.js';
import { onecliProfile, target, wranglerToml } from '../support.js';

describe('plan and receipt contract', () => {
  const now = new Date('2026-09-07T12:00:00Z');
  const plan = createPlan(onecliProfile, target, wranglerToml, now);
  const receipt = createReceipt(onecliProfile, plan, 'operator', now);

  it('binds approval to actor, provider, account, connection, and current digests', () => {
    expect(receipt.expiresAt).toBe('2026-09-07T12:15:00.000Z');
    expect(() => validateReceipt(receipt, onecliProfile, plan, 'operator', now)).not.toThrow();
    for (const changed of [
      { ...receipt, planId: 'changed' },
      { ...receipt, actorId: 'other' },
      { ...receipt, accountId: 'f'.repeat(32) },
      { ...receipt, connectionId: 'other' }
    ]) {
      expect(() => validateReceipt(changed, onecliProfile, plan, 'operator', now)).toThrow();
    }
  });

  it('expires after fifteen minutes', () => {
    expect(() =>
      validateReceipt(receipt, onecliProfile, plan, 'operator', new Date('2026-09-07T12:15:00Z'))
    ).toThrow(/expired/i);
  });
});
