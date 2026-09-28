import { describe, expect, it } from 'vitest';
import { OpsCoreError, assertEnvironmentName, defaultNames } from '../src/index.js';

describe('assertEnvironmentName', () => {
  it('accepts lowercase letters, digits, and dashes starting with a letter', () => {
    for (const name of ['dev', 'stage', 'prod', 'prod-eu', 'env2', 'a'])
      expect(() => assertEnvironmentName(name)).not.toThrow();
  });

  it('rejects a name that is not a safe resource-name prefix', () => {
    for (const bad of [
      '',
      'Dev',
      'DEV',
      '1prod',
      '-prod',
      'has space',
      'has_underscore',
      'préfixe'
    ])
      expect(() => assertEnvironmentName(bad)).toThrow(OpsCoreError);
  });

  it('rejects a name too long for its default resource names to fit Cloudflare limits', () => {
    const tooLong = 'a'.repeat(50);
    expect(() => assertEnvironmentName(tooLong)).toThrow(OpsCoreError);
    // 63 - '-vizoalica-worker'.length (17) = 46 characters is exactly the boundary.
    expect(() => assertEnvironmentName('a'.repeat(46))).not.toThrow();
    expect(() => assertEnvironmentName('a'.repeat(47))).toThrow(OpsCoreError);
  });
});

describe('defaultNames', () => {
  it('prefixes every default resource name with the environment', () => {
    expect(defaultNames('stage')).toEqual({
      worker: 'stage-vizoalica-worker',
      database: 'stage-vizoalica-db',
      bucket: 'stage-vizoalica-bucket'
    });
  });

  it('validates the environment name first', () => {
    expect(() => defaultNames('Bad Name')).toThrow(OpsCoreError);
  });
});
