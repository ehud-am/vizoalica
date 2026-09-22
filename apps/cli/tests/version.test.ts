import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/version.js';

describe('VERSION', () => {
  it('is a plain marker when run from source, and replaced with the release version in the package', () => {
    expect(VERSION).toBe('0.0.0-dev');
  });
});
