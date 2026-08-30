import { describe, expect, it } from 'vitest';
import { R2EventBatchRepository } from '../src/storage/r2-event-batches.js';

describe('R2 event batches', () => {
  it('keeps visitor and token values out of keys and metadata', async () => {
    let key = '';
    let options: { customMetadata?: Record<string, string> } | undefined;
    const repository = new R2EventBatchRepository({
      put: async (nextKey, _value, nextOptions) => {
        key = nextKey;
        options = nextOptions;
      }
    });
    await repository.saveAcceptedEvents([
      {
        projectId: 'project-a',
        sourceId: 'source-a',
        trustLevel: 'signed-session',
        consentState: 'unknown',
        receivedAt: new Date('2026-08-29T00:00:00.000Z'),
        event: {
          id: 'evt',
          specversion: '1.0',
          type: 'com.vizoalica.page_view.v1',
          source: 'https://example.test',
          subject: 'session/private-session',
          time: '2026-08-29T00:00:00.000Z',
          datacontenttype: 'application/json',
          data: { secret: 'never-a-key' }
        }
      } as never
    ]);
    expect(key).toMatch(/^events\/project-a\/source-a\/2026-08-29\//);
    expect(key).not.toContain('private-session');
    expect(JSON.stringify(options)).not.toContain('never-a-key');
    expect(options?.customMetadata).toMatchObject({
      trust: 'signed-session',
      consent: 'unknown',
      schema_version: '1.0'
    });
  });
});
