import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createWorkerTokenVerifier } from '../src/auth/token-verifier.js';

const SECRET = 'test-token-secret-0123456789abcdefgh';
const now = Math.floor(Date.now() / 1000);
const claims = {
  iss: 'test',
  aud: 'vizoalica-ingest',
  sub: 'source/s1',
  project_id: 'p1',
  source_id: 's1',
  origin: 'https://example.com',
  scope: 'events:write',
  iat: now,
  nbf: now,
  exp: now + 60,
  jti: 'jti_1'
};

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
function token(header: unknown, secret = SECRET, payload: unknown = claims): string {
  const input = `${encode(header)}.${encode(payload)}`;
  return `${input}.${createHmac('sha256', secret).update(input).digest('base64url')}`;
}

describe('Worker token verifier', () => {
  const verify = createWorkerTokenVerifier(SECRET);

  it('accepts an HS256 token signed with the secret', async () => {
    const result = await verify(`Bearer ${token({ alg: 'HS256', typ: 'JWT' })}`);
    expect(result.ok).toBe(true);
  });

  it('rejects a correctly signed token whose header names another algorithm, or none', async () => {
    for (const header of [
      { alg: 'HS512', typ: 'JWT' },
      { alg: 'none', typ: 'JWT' },
      { typ: 'JWT' },
      { alg: ['HS256'] }
    ])
      expect(await verify(`Bearer ${token(header)}`), JSON.stringify(header)).toEqual({
        ok: false,
        reason: 'malformed_token'
      });
  });

  it('rejects a header that is not JSON', async () => {
    const input = `${Buffer.from('not json').toString('base64url')}.${encode(claims)}`;
    const signed = `${input}.${createHmac('sha256', SECRET).update(input).digest('base64url')}`;
    expect(await verify(`Bearer ${signed}`)).toEqual({ ok: false, reason: 'malformed_token' });
  });

  it('rejects other secrets, tampering, missing tokens, and malformed tokens', async () => {
    const good = token({ alg: 'HS256', typ: 'JWT' });
    expect(
      await verify(`Bearer ${token({ alg: 'HS256' }, 'another-secret-0123456789abcdefghijkl')}`)
    ).toEqual({
      ok: false,
      reason: 'invalid_signature'
    });
    const [head, , signature] = good.split('.');
    expect(
      await verify(`Bearer ${head}.${encode({ ...claims, project_id: 'other' })}.${signature}`)
    ).toEqual({ ok: false, reason: 'invalid_signature' });
    expect(await verify(null)).toEqual({ ok: false, reason: 'missing_token' });
    expect(await verify('Basic abc')).toEqual({ ok: false, reason: 'missing_token' });
    expect(await verify('Bearer a.b')).toEqual({ ok: false, reason: 'malformed_token' });
    expect(await verify('Bearer a..c')).toEqual({ ok: false, reason: 'malformed_token' });
  });

  it('rejects claims that do not match the contract', async () => {
    const result = await verify(
      `Bearer ${token({ alg: 'HS256' }, SECRET, { ...claims, scope: 'admin' })}`
    );
    expect(result).toEqual({ ok: false, reason: 'invalid_claims' });
  });
});
