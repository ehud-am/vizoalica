import { describe, expect, it, vi } from 'vitest';
import { createDemoIngestToken } from '../src/index.js';
describe('demo token generation', () => {
  it('uses explicit claim overrides and produces a signed JWT', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const token = createDemoIngestToken({
      projectId: 'p1',
      sourceId: 's1',
      origin: 'https://site.test',
      subject: 'operator',
      secret: 'secret',
      now: new Date('2026-01-01T00:00:00Z'),
      ttlSeconds: 60,
      maxEvents: 2
    });
    const [header, payload, signature] = token.split('.');
    expect(JSON.parse(Buffer.from(header!, 'base64url').toString())).toEqual({
      alg: 'HS256',
      typ: 'JWT'
    });
    expect(JSON.parse(Buffer.from(payload!, 'base64url').toString())).toMatchObject({
      sub: 'operator',
      exp: 1767225660,
      max_events: 2
    });
    expect(signature).toBeTruthy();
  });
  it('applies safe development defaults', () => {
    const token = createDemoIngestToken({
      projectId: 'p1',
      sourceId: 's1',
      origin: 'https://site.test'
    });
    const claims = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString());
    expect(claims).toMatchObject({ sub: 'source/s1', max_events: 25 });
    expect(claims.exp - claims.iat).toBe(300);
  });
});
