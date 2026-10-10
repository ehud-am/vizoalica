import { describe, expect, it } from 'vitest';
import { isIdentifierSegment, isTokenLike, normalizePagePath, redactLabel } from '../src/index.js';

// The fixed corpus behind success criterion SC-003. A rule change has to update it deliberately.
const MUST_GROUP = [
  '8841',
  '2',
  '0007',
  '1234567890123',
  '99999999999999999999',
  '3f2b8c1e-5d4a-4a37-9c1b-0e7d2a6f9b10',
  '3F2B8C1E-5D4A-4A37-9C1B-0E7D2A6F9B10',
  '00000000-0000-0000-0000-000000000000',
  '123e4567-e89b-12d3-a456-426614174000',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  '5f2b8c1e5d4a4a37',
  '5F2B8C1E5D4A4A37',
  '507f1f77bcf86cd799439011',
  'da39a3ee5e6b4b0d3255bfef95601890afd80709',
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  'abcdefabcdefabcdef',
  'V1StGXR8_Z5jdHi6B-myT',
  'V1StGXR8_Z5jdHi6B-myTx',
  'kX9fQ2mZp7Lw4RtY8bNc',
  'Ab3dEf6hIj9kLm2nOp5qRs8tUv',
  '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  'Zm9vYmFyMTIzNDU2Nzg5MEFCRA',
  'Qm9vayBpZDogMTIzNDU2Nzg5',
  'a1B2c3D4e5F6g7H8i9J0k',
  'jane@example.com',
  'JANE.DOE@Example.ORG',
  'a@b.c',
  'user+tag@example.co.uk',
  'x@y',
  '1',
  '42',
  '100',
  '31415',
  '2026',
  '19',
  '00',
  '7f3a9c1e5b2d4f68',
  '0123456789abcdef0123',
  'AAAAAAAAAAAAAAAAAAAa1',
  'zzzzzzzzzzzzzzzzzzZ9z',
  'Order-2026-Ab12-Cd34-Ef56'
];

const MUST_STAY = [
  'pricing',
  'docs',
  'about',
  'blog',
  'my-first-post',
  'blue-widget',
  'getting-started',
  'my-first-post-2026-review',
  'how-to-set-up-your-first-project-in-ten-minutes',
  'v2',
  'v1',
  'api-v3',
  'logo-1234.png',
  'favicon.ico',
  'report.pdf',
  'index.html',
  'deadbeef',
  'cafe',
  'facade',
  'decade',
  'abcdef123456789',
  'a1b2c3',
  '5f2b8c1e5d4a4a3',
  'unlimited-plan-for-teams',
  'Pricing',
  'Getting-Started',
  'terms-and-conditions',
  'privacy-policy',
  'x',
  'a',
  'ab',
  'q3-2026-results',
  'covid19',
  'html5',
  'mp3',
  'h264',
  'sha256',
  ':id',
  'orders_list',
  'my_long_snake_case_page_name_here',
  'lowercaseonlyletterssequencelongerthantwentychars',
  'UPPERCASEONLYLETTERSSEQUENCELONGERTHANTWENTY'
];

describe('page path identifier rules', () => {
  it.each(MUST_GROUP)('groups %s as an identifier', (segment) => {
    expect(isIdentifierSegment(segment)).toBe(true);
    expect(normalizePagePath(`/items/${segment}`)).toBe('/items/:id');
  });

  it.each(MUST_STAY)('keeps %s as written', (segment) => {
    expect(isIdentifierSegment(segment)).toBe(false);
    expect(normalizePagePath(`/items/${segment}`)).toBe(`/items/${segment}`);
  });

  it('has the corpus size the contract requires', () => {
    expect(MUST_GROUP.length).toBeGreaterThanOrEqual(40);
    expect(MUST_STAY.length).toBeGreaterThanOrEqual(40);
  });

  it('is idempotent over the whole corpus', () => {
    for (const segment of [...MUST_GROUP, ...MUST_STAY]) {
      const once = normalizePagePath(`/a/${segment}/b`);
      expect(normalizePagePath(once)).toBe(once);
    }
  });
});

describe('page path date runs', () => {
  it.each([
    ['/blog/2026/09/launch', '/blog/2026/09/launch'],
    ['/blog/2026/9/5/launch', '/blog/2026/9/5/launch'],
    ['/2026/12', '/2026/12'],
    ['/archive/1999/01/01', '/archive/1999/01/01']
  ])('keeps %s', (input, expected) => {
    expect(normalizePagePath(input)).toBe(expected);
  });

  it('groups a lone year, and a year not followed by a month', () => {
    expect(normalizePagePath('/orders/2026')).toBe('/orders/:id');
    expect(normalizePagePath('/orders/2026/item')).toBe('/orders/:id/item');
    expect(normalizePagePath('/orders/2026/13')).toBe('/orders/:id/:id');
  });

  it('keeps a date-shaped run that is really an order and item, the documented false negative', () => {
    expect(normalizePagePath('/orders/2026/12')).toBe('/orders/2026/12');
  });

  it('groups a day segment that is not part of a date run', () => {
    expect(normalizePagePath('/blog/2026/09/31/x')).toBe('/blog/2026/09/31/x');
    expect(normalizePagePath('/blog/2026/09/32/x')).toBe('/blog/2026/09/:id/x');
  });
});

describe('page path page keys', () => {
  it.each([
    [{ pathname: '/', hash: '#/pricing' }, '/#/pricing'],
    [{ pathname: '/', hash: '#/orders/8841?tab=items' }, '/#/orders/:id'],
    [{ pathname: '/app', hash: '#/reset/V1StGXR8_Z5jdHi6B-myT' }, '/app#/reset/:id'],
    [{ pathname: '/docs', hash: '#section-2' }, '/docs'],
    [{ pathname: '/callback', hash: '#access_token=abc&state=x' }, '/callback'],
    [{ pathname: '/', hash: '#/' }, '/'],
    [{ pathname: '/', hash: '' }, '/'],
    [{ pathname: '/orders/8841/' }, '/orders/:id'],
    [{ pathname: '/pricing/' }, '/pricing'],
    [{ pathname: '/pricing' }, '/pricing'],
    [{ pathname: '/users/3f2b8c1e-5d4a-4a37-9c1b-0e7d2a6f9b10/settings' }, '/users/:id/settings'],
    [{ pathname: '/blog/my-first-post' }, '/blog/my-first-post'],
    [{ pathname: '/page/2' }, '/page/:id']
  ])('maps %j to %s', (input, expected) => {
    expect(normalizePagePath(input)).toBe(expected);
  });

  it('accepts a single url_path string that already carries one fragment', () => {
    expect(normalizePagePath('/#/orders/8841')).toBe('/#/orders/:id');
    expect(normalizePagePath('/orders/8842')).toBe('/orders/:id');
    expect(normalizePagePath('/pricing/')).toBe('/pricing');
    expect(normalizePagePath('/app#section')).toBe('/app');
  });

  it('discards anything after a second #', () => {
    expect(normalizePagePath('/#/a#/b')).toBe('/#/a');
  });

  it('drops empty segments and query strings and never returns a question mark', () => {
    expect(normalizePagePath('//a///b//')).toBe('/a/b');
    expect(normalizePagePath('/a?token=1')).toBe('/a');
    expect(normalizePagePath('/#/a?token=1&x=2')).toBe('/#/a');
    expect(normalizePagePath('/a/b?')).not.toContain('?');
  });

  it('truncates to 1,024 characters', () => {
    const long = `/${'z'.repeat(5000)}`;
    expect(normalizePagePath(long)).toHaveLength(1024);
  });

  it('never throws on odd input', () => {
    for (const odd of ['', '#', '?', '/', '#/', undefined, null, 42, {}, { pathname: undefined }]) {
      expect(() => normalizePagePath(odd as never)).not.toThrow();
      expect(normalizePagePath(odd as never)).toMatch(/^\//);
    }
  });

  it('collapses 1,000 distinct record pages to one key', () => {
    const keys = new Set(
      Array.from({ length: 1000 }, (_, index) => normalizePagePath(`/orders/${1000 + index}`))
    );
    expect([...keys]).toEqual(['/orders/:id']);
  });

  it('is idempotent for fragment routes', () => {
    const once = normalizePagePath({ pathname: '/app', hash: '#/orders/8841/items/22' });
    expect(once).toBe('/app#/orders/:id/items/:id');
    expect(normalizePagePath(once)).toBe(once);
  });
});

describe('token-like detection', () => {
  it('needs three character classes for non-hex tokens', () => {
    expect(isTokenLike('V1StGXR8_Z5jdHi6B-myT')).toBe(true);
    expect(isTokenLike('all-lowercase-and-hyphenated-1')).toBe(false);
    expect(isTokenLike('NoDigitsButMixedCaseLongEnough')).toBe(false);
  });
});

describe('label redaction', () => {
  it('collapses whitespace and trims', () => {
    expect(redactLabel('  Start   free\n trial  ')).toBe('Start free trial');
  });

  it('replaces emails, long digit runs, and tokens', () => {
    expect(redactLabel('Delete jane@example.com')).toBe('Delete [email]');
    expect(redactLabel('Call 555-123-4567 now')).toBe('Call [number] now');
    expect(redactLabel('Pay 4111 1111 1111 1111')).toBe('Pay [number]');
    expect(redactLabel('Order 1234567 shipped')).toBe('Order [number] shipped');
    expect(redactLabel('Reset V1StGXR8_Z5jdHi6B-myT')).toBe('Reset [token]');
  });

  it('keeps short numbers and ordinary words', () => {
    expect(redactLabel('Page 2 of 10')).toBe('Page 2 of 10');
    expect(redactLabel('Buy 12345')).toBe('Buy 12345');
  });

  it('cuts to 80 characters after redaction', () => {
    expect(redactLabel('x'.repeat(500))).toHaveLength(80);
  });

  it('handles empty and odd input without throwing', () => {
    expect(redactLabel('')).toBe('');
    expect(redactLabel(undefined)).toBe('');
    expect(redactLabel(null)).toBe('');
    expect(redactLabel({ toString: () => 'ok' })).toBe('ok');
    expect(
      redactLabel({
        toString() {
          throw new Error('boom');
        }
      })
    ).toBe('');
  });

  it('is idempotent', () => {
    const once = redactLabel('Delete jane@example.com 5551234567');
    expect(redactLabel(once)).toBe(once);
  });

  it('does not take long for a very large label', () => {
    const start = performance.now();
    redactLabel('word '.repeat(50000));
    expect(performance.now() - start).toBeLessThan(50);
  });
});
