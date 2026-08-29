import { createValidator, schemas, type TokenClaims } from '@vizoalica/event-contracts';
import type { TokenVerificationResult } from '../../../ingest-api/src/auth/token-verifier.js';

const claimValidator = createValidator().compile(schemas.tokenClaims);
const decoder = new TextDecoder();
const encoder = new TextEncoder();

function decodeBase64Url(input: string): Uint8Array {
  const normalized =
    input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function createWorkerTokenVerifier(secret: string) {
  return async (header: string | null | undefined): Promise<TokenVerificationResult> => {
    if (!header?.startsWith('Bearer ')) return { ok: false, reason: 'missing_token' };
    const token = header.slice(7);
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((part) => !part))
      return { ok: false, reason: 'malformed_token' };
    const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
    try {
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );
      const valid = await crypto.subtle.verify(
        'HMAC',
        key,
        decodeBase64Url(signaturePart) as BufferSource,
        encoder.encode(`${headerPart}.${payloadPart}`) as BufferSource
      );
      if (!valid) return { ok: false, reason: 'invalid_signature' };
      const claims = JSON.parse(decoder.decode(decodeBase64Url(payloadPart))) as unknown;
      if (!claimValidator(claims)) return { ok: false, reason: 'invalid_claims' };
      return { ok: true, verified: { claims: claims as TokenClaims, token } };
    } catch {
      return { ok: false, reason: 'malformed_token' };
    }
  };
}
