import { describe, expect, it } from 'vitest';
import { startApi } from './support.js';

describe('complete installation snippet', () => {
  it('uses configured Worker and route project with public metadata only', async () => {
    const api = await startApi(() =>
      Response.json({
        publicSourceKey: 'public-key',
        allowedOrigins: ['https://site.test'],
        tokenIssuer: 'website-owned'
      })
    );
    const response = await api.call('/api/projects/project-1/websites/source-1/snippet', {
      cookie: await api.session()
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ projectId: 'project-1', sourceId: 'source-1' });
    expect(response.body.html).toContain('src="https://site.test/vizoalica.js"');
    expect(response.body.html).toContain('data-endpoint="https://worker.test/v1/events:batch"');
    expect(response.body.html).toContain('data-project="project-1"');
    expect(response.body.html).toContain('data-source="public-key"');
    expect(response.body.html).toContain('data-consent="unknown"');
    expect(response.body.html).toContain('data-token-url="/vizoalica/ingest-token"');
    expect(JSON.stringify(response)).not.toContain('top-secret');
  });
  it('escapes attributes and fails safely when metadata is missing', async () => {
    const api = await startApi(() =>
      Response.json({ publicSourceKey: 'key" onload="evil', allowedOrigins: ['https://site.test'] })
    );
    expect(
      (await api.call('/api/projects/p1/websites/s1/snippet', { cookie: await api.session() })).body
        .html
    ).toContain('key&quot; onload=&quot;evil');
    const broken = await startApi(() =>
      Response.json({ publicSourceKey: 'key', allowedOrigins: [] })
    );
    expect(
      (
        await broken.call('/api/projects/p1/websites/s1/snippet', {
          cookie: await broken.session()
        })
      ).status
    ).toBe(503);
  });
});
