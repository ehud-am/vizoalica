import { describe, expect, it } from 'vitest';
import { hasValidAdminAuthorization } from '../src/auth/admin-verifier.js';

describe('administrator authorization', () => {
  it('accepts only the exact bearer credential', () => {
    expect(hasValidAdminAuthorization('Bearer correct-secret', 'correct-secret')).toBe(true);
    expect(hasValidAdminAuthorization('Bearer wrong-secret', 'correct-secret')).toBe(false);
    expect(hasValidAdminAuthorization(null, 'correct-secret')).toBe(false);
    expect(hasValidAdminAuthorization('Basic correct-secret', 'correct-secret')).toBe(false);
  });
});
