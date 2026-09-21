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
    expect(response.body.modes).toHaveLength(2);
    expect(response.body.modes[0]).toEqual({ id: 'static', snippet: response.body.html });
    expect(response.body.modes[1]).toMatchObject({
      id: 'dynamic',
      snippet: '<script async src="/vizoalica-loader.js"></script>',
      configUrl: '/vizoalica/config.json',
      config: {
        version: 1,
        src: 'https://site.test/vizoalica.js',
        'data-endpoint': 'https://worker.test/v1/events:batch',
        'data-source': 'public-key',
        'data-project': 'project-1',
        'data-token-url': '/vizoalica/ingest-token',
        'data-consent': 'unknown'
      }
    });
    expect(response.body.modes[1].cloudflare.workflowRef).toBe(
      'ehud-am/vizoalica/.github/workflows/deploy-vizoalica-pages.yml@v0.6.0'
    );
    expect(response.body.modes[1].cloudflare.repoVariables).toMatchObject({
      VIZOALICA_SOURCE_ID: 'source-1',
      VIZOALICA_SITE_ORIGINS: 'https://site.test'
    });
    expect(response.body.modes[1].cloudflare.accountSpecificVariables).toEqual([
      'CF_ACCOUNT_ID',
      'CF_PAGES_PROJECT'
    ]);
    expect(response.body.modes[1].cloudflare.repoSecretNames).toEqual([
      'CF_API_TOKEN',
      'VIZOALICA_TOKEN_SECRET'
    ]);
    expect(response.body.modes[1].cloudflare.starterWorkflowYaml).toContain(
      'uses: ehud-am/vizoalica/.github/workflows/deploy-vizoalica-pages.yml@v0.6.0'
    );
    expect(response.body.modes[1].cloudflare.setupCommands.join('\n')).not.toMatch(
      /gh secret set (CF_API_TOKEN|VIZOALICA_TOKEN_SECRET) --body/
    );
    expect(response.body.privateSetup).toEqual({
      tokenIssuer: 'website-owned',
      tokenSecretRequired: true
    });
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

  it('keeps the generic snippet identical while scoping all six public values', async () => {
    const first = await startApi(() =>
      Response.json({ publicSourceKey: 'source-one', allowedOrigins: ['https://one.test'] })
    );
    const second = await startApi(() =>
      Response.json({ publicSourceKey: 'source-two', allowedOrigins: ['https://two.test'] })
    );
    const one = (
      await first.call('/api/projects/project-1/websites/source-1/snippet', {
        cookie: await first.session()
      })
    ).body.modes[1];
    const two = (
      await second.call('/api/projects/project-2/websites/source-2/snippet', {
        cookie: await second.session()
      })
    ).body.modes[1];
    expect(one.snippet).toBe(two.snippet);
    expect(one.config).not.toEqual(two.config);
    expect(Object.keys(one.cloudflare.repoVariables)).toHaveLength(8);
    const serialized = JSON.stringify([one, two]);
    expect(serialized).not.toMatch(/ADMIN_SECRET|authorization|Bearer|top-secret|must-not-leak/i);
  });
});
