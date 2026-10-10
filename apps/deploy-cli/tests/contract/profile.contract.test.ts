import { describe, expect, it } from 'vitest';
import { canonicalJson, digest, validateProfile } from '../../src/config.js';
import { nativeProfile, onecliProfile } from '../support.js';

describe('deployment profile contract', () => {
  it('accepts explicit OneCLI and native profiles', () => {
    expect(validateProfile(onecliProfile)).toMatchObject({ provider: 'onecli' });
    expect(validateProfile(nativeProfile)).toMatchObject({ provider: 'cloudflare-native' });
    expect(
      validateProfile({ ...onecliProfile, auditRetentionDays: undefined }).auditRetentionDays
    ).toBe(90);
  });

  it.each([
    { ...onecliProfile, token: 'forbidden' },
    { ...nativeProfile, onecli: onecliProfile.onecli },
    { ...onecliProfile, provider: 'automatic' },
    { ...onecliProfile, auditRetentionDays: 30 },
    { ...onecliProfile, environment: 'Not Safe' },
    { ...onecliProfile, cloudflare: { accountId: 'short' } },
    {
      ...onecliProfile,
      cloudflare: { accountId: onecliProfile.cloudflare.accountId, extra: true }
    },
    { ...onecliProfile, onecli: { ...onecliProfile.onecli, extra: true } },
    { ...onecliProfile, unknown: true }
  ])('rejects malformed or credential-bearing input', (profile) => {
    expect(() => validateProfile(profile)).toThrow();
  });

  it('canonicalizes object keys for stable digests', () => {
    expect(canonicalJson({ b: 2, a: [1, { d: 4, c: 3 }] })).toBe('{"a":[1,{"c":3,"d":4}],"b":2}');
    expect(digest({ b: 2, a: 1 })).toBe(digest({ a: 1, b: 2 }));
  });
});
