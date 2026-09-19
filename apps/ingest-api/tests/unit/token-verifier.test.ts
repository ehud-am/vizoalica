import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TokenVerifier, createSignedDemoToken } from '../../src/auth/token-verifier.js';
import { nowSeconds, project, secret, source } from '../test-helpers.js';

describe('TokenVerifier', () => {
  it('verifies a valid signed ingest token', () => {
    const token = createSignedDemoToken(
      {
        iss: 'test',
        aud: 'vizoalica-ingest',
        sub: 'session/sess_1',
        project_id: project.id,
        source_id: source.id,
        origin: 'https://example.com',
        scope: 'events:write',
        iat: nowSeconds,
        nbf: nowSeconds,
        exp: nowSeconds + 60,
        jti: 'jti_1'
      },
      secret
    );
    const result = new TokenVerifier(secret).verify(token);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.verified.claims.project_id).toBe(project.id);
  });

  it('rejects tokens signed with another secret', () => {
    const token = createSignedDemoToken(
      {
        iss: 'test',
        aud: 'vizoalica-ingest',
        sub: 'session/sess_1',
        project_id: project.id,
        source_id: source.id,
        origin: 'https://example.com',
        scope: 'events:write',
        iat: nowSeconds,
        nbf: nowSeconds,
        exp: nowSeconds + 60,
        jti: 'jti_1'
      },
      'wrong'
    );
    expect(new TokenVerifier(secret).verify(token)).toEqual({
      ok: false,
      reason: 'invalid_signature'
    });
  });

  it('rejects a correctly signed token whose header names another algorithm, or none', () => {
    const claims = {
      iss: 'test',
      aud: 'vizoalica-ingest',
      sub: 'session/sess_1',
      project_id: project.id,
      source_id: source.id,
      origin: 'https://example.com',
      scope: 'events:write',
      iat: nowSeconds,
      nbf: nowSeconds,
      exp: nowSeconds + 60,
      jti: 'jti_1'
    };
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    for (const header of [{ alg: 'HS512', typ: 'JWT' }, { alg: 'none' }, { typ: 'JWT' }]) {
      const input = `${encode(header)}.${encode(claims)}`;
      const signed = `${input}.${createHmac('sha256', secret).update(input).digest('base64url')}`;
      expect(new TokenVerifier(secret).verify(signed), JSON.stringify(header)).toEqual({
        ok: false,
        reason: 'malformed_token'
      });
    }
  });
});
