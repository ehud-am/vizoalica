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
    // The recommended embed states only what is unique to the website.
    expect(response.body.html).toBe(
      '<script\n  async\n  src="/vizoalica.js"\n  data-endpoint="https://worker.test/v1/events:batch"\n  data-source="public-key"\n></script>'
    );
    expect(response.body.html).not.toMatch(/data-(project|token-url|consent)/);
    // "Customize" writes every default out, so an override starts from a working tag.
    expect(response.body.modes[0].customize).toContain('data-project="project-1"');
    expect(response.body.modes[0].customize).toContain('data-consent="unknown"');
    expect(response.body.modes[0].customize).toContain('data-token-url="/vizoalica/ingest-token"');
    expect(response.body.modes).toHaveLength(2);
    expect(response.body.modes[0]).toMatchObject({ id: 'static', snippet: response.body.html });
    expect(response.body.modes[1]).toMatchObject({
      id: 'dynamic',
      snippet: '<script async src="/vizoalica-loader.js"></script>',
      configUrl: '/vizoalica/config.json',
      config: {
        version: 1,
        src: '/vizoalica.js',
        'data-endpoint': 'https://worker.test/v1/events:batch',
        'data-source': 'public-key',
        'data-project': 'project-1',
        'data-token-url': '/vizoalica/ingest-token',
        'data-consent': 'unknown'
      }
    });
    const cloudflare = response.body.modes[1].cloudflare;
    expect(cloudflare.workflowRef).toBe(
      'ehud-am/vizoalica/.github/workflows/deploy-vizoalica-pages.yml@v0.7.3'
    );
    // One public value carries the website's settings; the rest follow a convention.
    expect(Object.keys(cloudflare.repoVariables)).toEqual(['VIZOALICA_SITE']);
    expect(JSON.parse(cloudflare.repoVariables.VIZOALICA_SITE)).toEqual({
      endpoint: 'https://worker.test/v1/events:batch',
      sourceKey: 'public-key',
      projectId: 'project-1',
      sourceId: 'source-1',
      origins: ['https://site.test']
    });
    expect(cloudflare.expandedRepoVariables).toMatchObject({
      VIZOALICA_SOURCE_ID: 'source-1',
      VIZOALICA_SITE_ORIGINS: 'https://site.test'
    });
    expect(cloudflare.defaults).toEqual({
      VIZOALICA_SDK_SRC: '/vizoalica.js',
      VIZOALICA_TOKEN_URL: '/vizoalica/ingest-token',
      VIZOALICA_CONSENT: 'unknown'
    });
    expect(cloudflare.summary).toEqual({ publicValues: 3, secrets: 2 });
    expect(cloudflare.accountLookupCommand).toContain('wrangler');
    expect(response.body.modes[1].cloudflare.accountSpecificVariables).toEqual([
      'CF_ACCOUNT_ID',
      'CF_PAGES_PROJECT'
    ]);
    expect(response.body.modes[1].cloudflare.repoSecretNames).toEqual([
      'CF_API_TOKEN',
      'VIZOALICA_TOKEN_SECRET'
    ]);
    // Works unedited for a site at the repository root: no folder placeholder.
    expect(response.body.modes[1].cloudflare.starterWorkflowYaml).toContain(
      'uses: ehud-am/vizoalica/.github/workflows/deploy-vizoalica-pages.yml@v0.7.3'
    );
    expect(response.body.modes[1].cloudflare.starterWorkflowYaml).not.toContain(
      'YOUR_SITE_DIRECTORY'
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
    // The quoted value also survives the shell command that sets the bundled variable.
    const quoted = await startApi(() =>
      Response.json({ publicSourceKey: "it's", allowedOrigins: ['https://site.test'] })
    );
    const command = (
      await quoted.call('/api/projects/p1/websites/s1/snippet', { cookie: await quoted.session() })
    ).body.modes[1].cloudflare.setupCommands[0] as string;
    expect(command.startsWith("gh variable set VIZOALICA_SITE --body '")).toBe(true);
    expect(command).toContain("it'\\''s");
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
    expect(Object.keys(one.cloudflare.repoVariables)).toHaveLength(1);
    expect(Object.keys(one.cloudflare.expandedRepoVariables)).toHaveLength(5);
    const serialized = JSON.stringify([one, two]);
    expect(serialized).not.toMatch(/ADMIN_SECRET|authorization|Bearer|top-secret|must-not-leak/i);
  });
});
