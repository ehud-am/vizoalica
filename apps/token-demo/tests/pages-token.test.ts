import { describe, expect, it } from 'vitest';
import { onRequest } from '../../../examples/cloudflare-pages/functions/vizoalica/ingest-token.js';
import { createWorkerTokenVerifier } from '../../ingest-worker/src/auth/token-verifier.js';

const env = {
  VIZOALICA_TOKEN_SECRET: 'test-only-signing-secret-with-32-characters',
  VIZOALICA_PROJECT_ID: 'project-test-id',
  VIZOALICA_SOURCE_ID: 'source-test-id',
  VIZOALICA_SITE_ORIGIN: 'https://site.test'
};
const request = (headers: Record<string, string> = { referer: 'https://site.test/' }) =>
  new Request('https://site.test/vizoalica/ingest-token?project_id=attacker', { headers });

describe('Pages token issuer', () => {
  it('issues a noncached five-minute token accepted by the real Worker verifier', async () => {
    const response = await onRequest({ request: request(), env });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const token = await response.text();
    const result = await createWorkerTokenVerifier(env.VIZOALICA_TOKEN_SECRET)(`Bearer ${token}`);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('verification failed');
    const claims = result.verified.claims;
    expect(claims).toMatchObject({
      project_id: env.VIZOALICA_PROJECT_ID,
      source_id: env.VIZOALICA_SOURCE_ID,
      origin: env.VIZOALICA_SITE_ORIGIN,
      scope: 'events:write',
      max_events: 25
    });
    expect(claims.exp - claims.iat).toBe(300);
    expect(claims.nbf).toBe(claims.iat);
    expect(await createWorkerTokenVerifier('wrong-secret')(`Bearer ${token}`)).toMatchObject({
      ok: false
    });
    const second = await onRequest({ request: request(), env });
    expect(await second.text()).not.toBe(token);
  });
  it.each([
    {},
    { origin: 'https://evil.test', referer: 'https://site.test/' },
    { referer: 'invalid' },
    { referer: 'https://evil.test/' }
  ])('rejects absent or foreign provenance %j', async (headers) => {
    expect((await onRequest({ request: request(headers), env })).status).toBe(403);
  });
  it('accepts exact Origin and rejects preview origins', async () => {
    expect(
      (await onRequest({ request: request({ origin: env.VIZOALICA_SITE_ORIGIN }), env })).status
    ).toBe(200);
    expect(
      (
        await onRequest({
          request: new Request('https://preview.test/vizoalica/ingest-token', {
            headers: { origin: env.VIZOALICA_SITE_ORIGIN }
          }),
          env
        })
      ).status
    ).toBe(403);
  });
  it('rejects POST and missing or placeholder configuration', async () => {
    expect(
      (
        await onRequest({
          request: new Request('https://site.test/vizoalica/ingest-token', { method: 'POST' }),
          env
        })
      ).status
    ).toBe(405);
    for (const invalid of [
      { ...env, VIZOALICA_TOKEN_SECRET: '' },
      { ...env, VIZOALICA_PROJECT_ID: 'REPLACE_PROJECT_ID' },
      { ...env, VIZOALICA_SITE_ORIGIN: 'not-url' }
    ]) {
      const response = await onRequest({ request: request(), env: invalid });
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain(env.VIZOALICA_TOKEN_SECRET);
    }
  });
});
