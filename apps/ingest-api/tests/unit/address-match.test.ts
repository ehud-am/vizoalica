import { describe, expect, it } from 'vitest';
import {
  canonicalAddressEntry,
  isExcluded,
  MAX_EXCLUDED_ADDRESSES,
  parseAddressList
} from '../../src/ingestion/address-match.js';

describe('canonicalAddressEntry', () => {
  it.each([
    ['203.0.113.7', '203.0.113.7'],
    ['  203.0.113.7  ', '203.0.113.7'],
    ['203.0.113.7/32', '203.0.113.7'],
    ['203.0.113.9/24', '203.0.113.0/24'],
    ['0.0.0.0/0', '0.0.0.0/0'],
    ['255.255.255.255', '255.255.255.255'],
    ['10.1.2.3/8', '10.0.0.0/8'],
    ['2001:db8::1', '2001:db8::1'],
    ['2001:DB8:0:0:0:0:0:1', '2001:db8::1'],
    ['2001:db8::/48', '2001:db8::/48'],
    ['2001:db8::dead:beef/48', '2001:db8::/48'],
    ['2001:db8:0:1::1', '2001:db8:0:1::1'],
    ['2001:0:0:1:0:0:0:1', '2001:0:0:1::1'],
    ['2001:db8:0:0:1:0:0:1', '2001:db8::1:0:0:1'],
    ['1:0:0:2:0:0:0:3', '1:0:0:2::3'],
    ['::1', '::1'],
    ['::', '::'],
    ['::/0', '::/0'],
    ['fe80::1', 'fe80::1'],
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['::ffff:cb00:7107', '203.0.113.7'],
    ['::ffff:203.0.113.0/120', '203.0.113.0/24'],
    ['1:2:3:4:5:6:7:8', '1:2:3:4:5:6:7:8'],
    ['64:ff9b::192.0.2.33', '64:ff9b::c000:221']
  ])('spells %j as %j', (input, expected) => {
    expect(canonicalAddressEntry(input)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    'abc',
    'example.com',
    'localhost',
    'https://203.0.113.7',
    '203.0.113',
    '203.0.113.7.8',
    '203.0.113.256',
    '203.0.113.07',
    '203.0.113.-1',
    '203.0.113.7/33',
    '203.0.113.7/-1',
    '203.0.113.7/',
    '203.0.113.7/24/8',
    '203.0.113.7/024',
    '203.0.113.7 /24',
    '2001:db8::/129',
    '2001:db8:::1',
    '2001:db8::1::2',
    '2001:db8',
    '1:2:3:4:5:6:7:8:9',
    '1:2:3:4:5:6:7::8',
    'fe80::1%eth0',
    'g::1',
    '12345::1',
    '::ffff:203.0.113.7/64',
    '1.2.3.4,5.6.7.8',
    '*',
    '203.0.113.*',
    `1${'0'.repeat(60)}`
  ])('refuses %j', (input) => {
    expect(canonicalAddressEntry(input)).toBeUndefined();
  });

  it('refuses anything that is not text', () => {
    for (const value of [undefined, null, 5, {}, [], true])
      expect(canonicalAddressEntry(value)).toBeUndefined();
  });
});

describe('parseAddressList', () => {
  it('canonicalises, removes duplicates, and keeps the order', () => {
    expect(
      parseAddressList(['203.0.113.7', '203.0.113.7/32', '2001:DB8::1', '10.0.0.5/8'])
    ).toEqual({ ok: true, entries: ['203.0.113.7', '2001:db8::1', '10.0.0.0/8'] });
    expect(parseAddressList([])).toEqual({ ok: true, entries: [] });
  });

  it('refuses the whole list when one entry is bad, naming it', () => {
    expect(parseAddressList(['203.0.113.7', 'nope', '10.0.0.1'])).toEqual({
      ok: false,
      reason: 'invalid_entry',
      index: 1
    });
    expect(parseAddressList(['203.0.113.7', 5])).toEqual({
      ok: false,
      reason: 'invalid_entry',
      index: 1
    });
  });

  it('refuses a non-list and too many entries, and accepts exactly the limit', () => {
    for (const value of [undefined, null, 'a', {}, 5])
      expect(parseAddressList(value)).toEqual({ ok: false, reason: 'not_a_list' });
    const many = (count: number) => Array.from({ length: count }, (_, index) => `10.0.0.${index}`);
    expect(parseAddressList(many(MAX_EXCLUDED_ADDRESSES + 1))).toEqual({
      ok: false,
      reason: 'too_many'
    });
    expect(parseAddressList(many(MAX_EXCLUDED_ADDRESSES))).toMatchObject({ ok: true });
  });
});

describe('isExcluded', () => {
  it('matches single addresses exactly', () => {
    expect(isExcluded('203.0.113.7', ['203.0.113.7'])).toBe(true);
    expect(isExcluded('203.0.113.8', ['203.0.113.7'])).toBe(false);
    expect(isExcluded('2001:db8::1', ['2001:db8::1'])).toBe(true);
    expect(isExcluded('2001:db8::2', ['2001:db8::1'])).toBe(false);
  });

  it.each([
    // [range, inside, outside] at the boundaries of each prefix length
    ['0.0.0.0/0', '255.255.255.255', undefined],
    ['10.0.0.0/8', '10.255.255.255', '11.0.0.0'],
    ['10.0.0.0/8', '10.0.0.0', '9.255.255.255'],
    ['203.0.113.0/24', '203.0.113.255', '203.0.114.0'],
    ['203.0.113.0/24', '203.0.113.0', '203.0.112.255'],
    ['203.0.113.7/32', '203.0.113.7', '203.0.113.6'],
    ['2001:db8::/48', '2001:db8:0:ffff:ffff:ffff:ffff:ffff', '2001:db8:1::'],
    ['2001:db8::/48', '2001:db8::', '2001:db7:ffff:ffff:ffff:ffff:ffff:ffff'],
    ['2001:db8::/64', '2001:db8::ffff:ffff:ffff:ffff', '2001:db8:0:1::'],
    ['2001:db8::1/128', '2001:db8::1', '2001:db8::2'],
    ['::/0', 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', undefined],
    ['8000::/1', 'ffff::1', '7fff::1']
  ])('range %s contains %s and not %s', (range, inside, outside) => {
    expect(isExcluded(inside, [range])).toBe(true);
    if (outside) expect(isExcluded(outside, [range])).toBe(false);
  });

  it('keeps the two address families apart', () => {
    expect(isExcluded('203.0.113.7', ['2001:db8::/32'])).toBe(false);
    expect(isExcluded('2001:db8::1', ['0.0.0.0/0'])).toBe(false);
    expect(isExcluded('2001:db8::1', ['::/0'])).toBe(true);
  });

  it('treats an IPv4-mapped IPv6 client as the IPv4 address', () => {
    expect(isExcluded('::ffff:203.0.113.7', ['203.0.113.7'])).toBe(true);
    expect(isExcluded('::ffff:cb00:7107', ['203.0.113.0/24'])).toBe(true);
    expect(isExcluded('::ffff:203.0.114.7', ['203.0.113.0/24'])).toBe(false);
  });

  it('matches any entry of the list', () => {
    expect(isExcluded('10.0.0.5', ['203.0.113.7', '10.0.0.0/24'])).toBe(true);
  });

  it('never excludes on an empty list, a missing or unusable address, or a broken entry', () => {
    expect(isExcluded('203.0.113.7', [])).toBe(false);
    expect(isExcluded(undefined, ['0.0.0.0/0'])).toBe(false);
    expect(isExcluded(null, ['0.0.0.0/0'])).toBe(false);
    expect(isExcluded('', ['0.0.0.0/0'])).toBe(false);
    expect(isExcluded('unknown', ['0.0.0.0/0', '::/0'])).toBe(false);
    expect(isExcluded('203.0.113.7', ['garbage', 'also bad'])).toBe(false);
    expect(isExcluded('203.0.113.7', ['garbage', '203.0.113.7'])).toBe(true);
  });

  it('ignores case and surrounding spaces in the client address', () => {
    expect(isExcluded(' 2001:DB8::1 ', ['2001:db8::1'])).toBe(true);
  });
});
