import { createHmac, timingSafeEqual } from 'node:crypto';
import type { TokenClaims } from '@vizoalica/event-contracts';
import { createValidator, schemas } from '@vizoalica/event-contracts';

export interface VerifiedToken {
  claims: TokenClaims;
  token: string;
}

export type TokenVerificationResult =
  | { ok: true; verified: VerifiedToken }
  | {
      ok: false;
      reason: 'missing_token' | 'malformed_token' | 'invalid_signature' | 'invalid_claims';
    };

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('base64url');
}

export function createSignedDemoToken(claims: TokenClaims, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  return `${signingInput}.${sign(signingInput, secret)}`;
}

export class TokenVerifier {
  private readonly validateClaims = createValidator().compile(schemas.tokenClaims);

  constructor(private readonly secret: string) {}

  verifyAuthorizationHeader(header: string | null | undefined): TokenVerificationResult {
    if (!header?.startsWith('Bearer ')) return { ok: false, reason: 'missing_token' };
    return this.verify(header.slice('Bearer '.length));
  }

  verify(token: string): TokenVerificationResult {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2])
      return { ok: false, reason: 'malformed_token' };
    const signingInput = `${parts[0]}.${parts[1]}`;
    const expected = sign(signingInput, this.secret);
    const actual = parts[2];
    const expectedBytes = Buffer.from(expected);
    const actualBytes = Buffer.from(actual);
    if (
      expectedBytes.length !== actualBytes.length ||
      !timingSafeEqual(expectedBytes, actualBytes)
    ) {
      return { ok: false, reason: 'invalid_signature' };
    }
    let claims: unknown;
    try {
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as {
        alg?: unknown;
      };
      // Defence in depth: the signature above is always HMAC-SHA256.
      if (header.alg !== 'HS256') return { ok: false, reason: 'malformed_token' };
      claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch {
      return { ok: false, reason: 'malformed_token' };
    }
    if (!this.validateClaims(claims)) return { ok: false, reason: 'invalid_claims' };
    return { ok: true, verified: { claims: claims as unknown as TokenClaims, token } };
  }
}
