import { describe, expect, it } from 'vitest';
import { isSafeId, validName, validOrigins } from '../src/contracts.js';
import {
  assertSafeIds,
  jsonInit,
  validateProjectBody,
  validateWebsiteBody,
  workerJson
} from '../src/routes/websites.js';
import { analytics } from '../src/routes/analytics.js';

describe('local route validation branches', () => {
  it('validates names, IDs, and exact unique web origins', () => {
    expect(validName(' ok ')).toBe(true);
    expect(validName('')).toBe(false);
    expect(validName(3)).toBe(false);
    expect(isSafeId('abc_123-x')).toBe(true);
    expect(isSafeId('../x')).toBe(false);
    for (const value of [
      undefined,
      [],
      Array(11).fill('https://x.test'),
      ['bad'],
      ['ftp://x.test'],
      ['https://x.test/path'],
      ['https://x.test', 'https://x.test'],
      [3]
    ])
      expect(validOrigins(value)).toBe(false);
    expect(validOrigins(['http://localhost:3000', 'https://x.test'])).toBe(true);
    expect(() => assertSafeIds('ok', 'bad/id')).toThrow('invalid_request');
    expect(() => assertSafeIds('ok')).not.toThrow();
  });
  it('validates complete and partial project/website payloads', () => {
    expect(validateProjectBody({ name: ' Project ' })).toEqual({ name: 'Project' });
    expect(() => validateProjectBody({ name: '' })).toThrow();
    expect(validateWebsiteBody({ name: ' Site ', allowedOrigins: ['https://site.test'] })).toEqual({
      name: 'Site',
      allowedOrigins: ['https://site.test']
    });
    expect(validateWebsiteBody({ name: 'New' }, true)).toEqual({ name: 'New' });
    expect(validateWebsiteBody({ allowedOrigins: ['https://new.test'] }, true)).toEqual({
      allowedOrigins: ['https://new.test']
    });
    expect(validateWebsiteBody({ status: 'active' }, true)).toEqual({ status: 'active' });
    for (const [value, partial] of [
      [undefined, false],
      [{ name: 'x' }, false],
      [{}, true],
      [{ name: 4 }, true],
      [{ allowedOrigins: [] }, true],
      [{ status: 'deleted' }, true]
    ] as const)
      expect(() => validateWebsiteBody(value, partial)).toThrow('invalid_request');
    expect(jsonInit('DELETE')).toEqual({ method: 'DELETE' });
    expect(jsonInit('PATCH', { name: 'x' })).toMatchObject({
      method: 'PATCH',
      body: '{"name":"x"}'
    });
  });
  it('maps remote response classes and analytics response shapes', async () => {
    const client = (response: Response) => ({ request: async () => response });
    await expect(
      workerJson(client(Response.json({}, { status: 401 })) as never, '/')
    ).rejects.toThrow('access_revoked');
    await expect(
      workerJson(client(Response.json({}, { status: 400 })) as never, '/')
    ).rejects.toThrow('invalid_request');
    await expect(
      workerJson(client(Response.json({}, { status: 404 })) as never, '/')
    ).rejects.toThrow('not_found');
    await expect(
      workerJson(client(Response.json({}, { status: 500 })) as never, '/')
    ).rejects.toThrow('remote_unavailable');
    await expect(
      workerJson(client(new Response(null, { status: 204 })) as never, '/')
    ).resolves.toBeUndefined();
    for (const status of [400, 404, 401, 500])
      await expect(
        analytics(client(Response.json({}, { status })) as never, 'p1', 's1', '24h')
      ).rejects.toThrow();
    await expect(
      analytics(
        client(
          Response.json({
            startUtc: 'a',
            endUtc: 'b',
            availability: 'processing',
            pageViews: 1,
            uniqueUsers: 1,
            lastCompletedAggregateAt: 'c'
          })
        ) as never,
        'p1',
        's1',
        '7d'
      )
    ).resolves.toMatchObject({ websiteId: 's1', lastCompletedAggregateAt: 'c' });
    await expect(
      analytics(
        client(Response.json({ startUtc: 'a', endUtc: 'b', availability: 'unavailable' })) as never,
        'p1',
        's1',
        '30d'
      )
    ).resolves.not.toHaveProperty('pageViews');
    await expect(
      analytics(client(Response.json({})) as never, '../p', 's1', '24h')
    ).rejects.toThrow('invalid_request');
  });
});
