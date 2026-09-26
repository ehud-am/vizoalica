import { describe, expect, it } from 'vitest';
import {
  isInsecureRemote,
  nameFromOrigin,
  normalizeOrigin,
  wwwCounterpart
} from '../src/components/origins.js';

describe('normalizeOrigin', () => {
  // The common ways people paste an address: every one should land on the same origin.
  const common: Array<[string, string]> = [
    ['https://example.com', 'https://example.com'],
    ['https://example.com/', 'https://example.com'],
    ['https://example.com/pricing', 'https://example.com'],
    ['https://example.com/pricing?x=1&y=2#top', 'https://example.com'],
    ['https://example.com//', 'https://example.com'],
    ['example.com', 'https://example.com'],
    ['Example.COM', 'https://example.com'],
    ['  example.com  ', 'https://example.com'],
    ['example.com/pricing', 'https://example.com'],
    ['www.example.com', 'https://www.example.com'],
    ['HTTPS://WWW.Example.com/Blog', 'https://www.example.com'],
    ['example.com:8443', 'https://example.com:8443'],
    ['https://example.com:443/', 'https://example.com'],
    ['http://localhost:3000/app', 'http://localhost:3000'],
    ['localhost:3000', 'https://localhost:3000'],
    ['http://127.0.0.1:8080', 'http://127.0.0.1:8080'],
    ['https://sub.example.co.uk/path', 'https://sub.example.co.uk'],
    ['https://münchen.example/straße', 'https://xn--mnchen-3ya.example'],
    ['https://192.168.1.10/admin', 'https://192.168.1.10'],
    ['http://example.com', 'http://example.com']
  ];
  it.each(common)('turns %j into %j', (input, origin) => {
    expect(normalizeOrigin(input)).toEqual({ origin });
  });

  it('normalises at least 90% of a mixed set of common forms', () => {
    const ok = common.filter(([input, origin]) => normalizeOrigin(input).origin === origin);
    expect(ok.length / common.length).toBeGreaterThanOrEqual(0.9);
  });

  it.each([
    '',
    '   ',
    'ftp://example.com',
    'javascript://x',
    'file:///etc/passwd',
    'ht!tp://x',
    'a b'
  ])('says what to type instead of accepting %j', (input) => {
    const result = normalizeOrigin(input);
    expect(result.origin).toBeUndefined();
    expect(result.error).toMatch(/example\.com|browser/);
  });

  it('does not accept credentials in an address', () => {
    expect(normalizeOrigin('https://user:pass@example.com').origin).toBeUndefined();
  });

  it('names a non-local http address as insecure, and only that', () => {
    expect(isInsecureRemote('http://example.com')).toBe(true);
    expect(isInsecureRemote('http://localhost:3000')).toBe(false);
    expect(isInsecureRemote('https://example.com')).toBe(false);
    expect(isInsecureRemote('nonsense')).toBe(false);
  });
});

describe('wwwCounterpart', () => {
  it.each([
    ['https://example.com', 'https://www.example.com'],
    ['https://www.example.com', 'https://example.com'],
    ['https://example.co.uk', 'https://www.example.co.uk'],
    ['https://example.com:8443', 'https://www.example.com:8443']
  ])('offers %j ↔ %j', (origin, other) => {
    expect(wwwCounterpart(origin)).toBe(other);
  });

  it.each([
    'https://blog.example.com',
    'https://app.docs.example.com',
    'http://localhost:3000',
    'https://192.168.1.10',
    'https://[::1]:3000',
    'https://intranet',
    'nonsense'
  ])('offers nothing for %j', (origin) => {
    expect(wwwCounterpart(origin)).toBeUndefined();
  });
});

describe('nameFromOrigin', () => {
  it('uses the host without www, keeping a port', () => {
    expect(nameFromOrigin('https://www.example.com')).toBe('example.com');
    expect(nameFromOrigin('http://localhost:3000')).toBe('localhost:3000');
    expect(nameFromOrigin('garbage')).toBe('garbage');
  });
});
