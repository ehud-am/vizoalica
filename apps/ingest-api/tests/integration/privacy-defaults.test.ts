import { describe, expect, it } from 'vitest';
import { ingestBatch } from '../../src/ingestion/pipeline.js';
import { createRepositories, now, pageViewEvent, secret, source, token } from '../test-helpers.js';

describe('privacy defaults integration', () => {
  it('rejects sensitive custom properties before storage', async () => {
    const repo = createRepositories();
    const event = {
      ...pageViewEvent('evt_sensitive_custom_123'),
      type: 'com.vizoalica.custom_event.v1' as const,
      data: {
        name: 'signup_click',
        visitor: { anonymous_id: 'anon_1' },
        session: { id: 'sess_1' },
        properties: { plan: 'pro', password: 'secret' }
      }
    };

    const result = await ingestBatch(
      {
        body: JSON.stringify([event]),
        publicSourceKey: source.publicSourceKey,
        origin: 'https://example.com',
        authorization: `Bearer ${token()}`,
        now
      },
      { repositories: repo, tokenSecret: secret }
    );

    expect(result.status).toBe(400);
    expect(result.decision.reasonCodes).toEqual(['sensitive_property_name']);
    await expect(repo.listAcceptedEvents()).resolves.toHaveLength(0);
  });

  it('stores redacted page-view URLs only', async () => {
    const repo = createRepositories();
    const event = pageViewEvent('evt_redacted_page_123');
    event.data.page = {
      url_origin: 'https://example.com',
      url_path: '/pricing',
      url_query_redacted: true,
      title: null
    };

    const result = await ingestBatch(
      {
        body: JSON.stringify([event]),
        publicSourceKey: source.publicSourceKey,
        origin: 'https://example.com',
        authorization: `Bearer ${token()}`,
        now
      },
      { repositories: repo, tokenSecret: secret }
    );

    expect(result.status).toBe(202);
    const stored = await repo.listAcceptedEvents();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.event.data).toMatchObject({
      page: { url_origin: 'https://example.com', url_path: '/pricing', url_query_redacted: true }
    });
    expect(JSON.stringify(stored[0]?.event)).not.toContain('token=');
  });
});
