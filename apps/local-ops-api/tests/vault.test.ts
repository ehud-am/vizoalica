import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SecretVault } from '../src/deploy/vault.js';

describe('SecretVault', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reveals a stored secret exactly once', () => {
    const vault = new SecretVault();
    vault.store('r1', { A: '1' });
    expect(vault.has('r1')).toBe(true);
    expect(vault.reveal('r1')).toEqual({ A: '1' });
    expect(vault.reveal('r1')).toBeUndefined();
    expect(vault.has('r1')).toBe(false);
  });

  it('stores nothing when there are no secrets to keep', () => {
    const vault = new SecretVault();
    vault.store('r1', {});
    expect(vault.has('r1')).toBe(false);
    expect(vault.reveal('r1')).toBeUndefined();
  });

  it('reports nothing to reveal for a run that never stored anything', () => {
    const vault = new SecretVault();
    expect(vault.reveal('missing')).toBeUndefined();
    expect(vault.has('missing')).toBe(false);
  });

  it('expires an unrevealed secret after ten minutes', () => {
    const vault = new SecretVault();
    vault.store('r1', { A: '1' });
    vi.advanceTimersByTime(10 * 60_000 + 1);
    expect(vault.has('r1')).toBe(false);
    expect(vault.reveal('r1')).toBeUndefined();
  });
});
