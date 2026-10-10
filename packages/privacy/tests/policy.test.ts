import { describe, expect, it } from 'vitest';
import { isForbiddenPropertyName, privacyLimits, sensitiveUrlKeys } from '../src/index.js';

describe('privacy policy', () => {
  it('marks common secret-like query keys as sensitive', () => {
    expect(sensitiveUrlKeys.has('token')).toBe(true);
    expect(sensitiveUrlKeys.has('email')).toBe(true);
  });

  it('detects forbidden custom property names', () => {
    expect(isForbiddenPropertyName('accessToken')).toBe(true);
    expect(isForbiddenPropertyName('plan')).toBe(false);
  });

  it('defines bounded property limits', () => {
    expect(privacyLimits.maxProperties).toBeLessThanOrEqual(25);
    expect(privacyLimits.maxPropertyValueLength).toBeLessThanOrEqual(256);
  });
});
