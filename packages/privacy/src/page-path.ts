import { privacyLimits } from './policy.js';

/**
 * A "page key" names a page in reports: the path, plus the route after `#` for sites that navigate
 * with fragment routes. Identifiers are replaced by `:id` so `/orders/8841` and `/orders/8842` are
 * one page, and the identifier itself is never stored. The same function runs in the browser
 * (identifiers never leave it) and at ingestion (older SDK files and other clients get the same
 * result). It is pure, idempotent, and never throws. See
 * specs/017-page-breakdown-and-actions/contracts/page-path-normalization.md.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Sixteen characters keeps short words made of a-f letters, and git short hashes, untouched.
const LONG_HEX = /^[0-9a-f]{16,}$/i;
// ULIDs are uppercase Crockford base32, so they have no lowercase letter for the token rule to see.
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const DIGITS = /^\d+$/;
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,}$/;
const YEAR = /^(19|20)\d{2}$/;
const MONTH = /^(0?[1-9]|1[0-2])$/;
const DAY = /^(0?[1-9]|[12]\d|3[01])$/;

/**
 * Random-looking tokens (nanoids, base64url ids). Requiring an uppercase letter, a lowercase
 * letter, and a digit keeps lowercase slugs such as `my-first-post-2026-review` from matching.
 */
export function isTokenLike(word: string): boolean {
  return (
    (TOKEN_SHAPE.test(word) && /[A-Z]/.test(word) && /[a-z]/.test(word) && /\d/.test(word)) ||
    (ULID.test(word) && /\d/.test(word)) ||
    LONG_HEX.test(word)
  );
}

export function isIdentifierSegment(segment: string): boolean {
  return (
    DIGITS.test(segment) || UUID.test(segment) || segment.includes('@') || isTokenLike(segment)
  );
}

/** Replaces identifier segments, except a year followed by a month (and optionally a day). */
function groupSegments(segments: string[]): string[] {
  const out: string[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    if (YEAR.test(segment) && MONTH.test(segments[index + 1] ?? '')) {
      const withDay = DAY.test(segments[index + 2] ?? '');
      out.push(...segments.slice(index, index + (withDay ? 3 : 2)));
      index += withDay ? 2 : 1;
    } else out.push(isIdentifierSegment(segment) ? ':id' : segment);
  }
  return out;
}

function toSegments(value: string): string[] {
  return groupSegments(value.split('/').filter(Boolean));
}

export type PageLocation = string | { pathname: string; hash?: string };

export function normalizePagePath(input: PageLocation): string {
  try {
    let path: string;
    let hash: string;
    if (typeof input === 'string') {
      const [beforeHash = '', afterHash = ''] = input.split('#');
      path = beforeHash;
      hash = afterHash;
    } else {
      path = String(input.pathname ?? '');
      hash = String(input.hash ?? '').replace(/^#/, '');
    }
    const routeSegments = hash.startsWith('/') ? toSegments(hash.split('?')[0]!) : [];
    const pathSegments = toSegments(path.split('?')[0]!);
    const key =
      `/${pathSegments.join('/')}` + (routeSegments.length ? `#/${routeSegments.join('/')}` : '');
    return key.slice(0, privacyLimits.maxUrlPathLength);
  } catch {
    return '/';
  }
}
