import { afterEach, describe, expect, it } from 'vitest';
import { writePrivate } from './support.js';
import { defaultBackends, harness, SECRETS, type Harness } from './mcp-support.js';

let open: Harness | undefined;
afterEach(async () => {
  if (open) {
    // No answer may ever carry a credential, whatever the tool or the failure.
    for (const text of open.texts)
      for (const secret of Object.values(SECRETS)) expect(text).not.toContain(secret);
    await open.client.close();
  }
  open = undefined;
});

async function start(options: Parameters<typeof harness>[0] = {}) {
  open = await harness(options);
  return open;
}

describe('the vizoalica MCP server', () => {
  it('offers only read-only tools and the three prompts', async () => {
    const { client } = await start();
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'compare_periods',
      'get_actions',
      'get_environment_status',
      'get_traffic_overview',
      'get_website_status',
      'list_environments',
      'list_websites',
      'use_environment'
    ]);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
      expect(tool.annotations?.destructiveHint, tool.name).toBe(false);
    }
    const { prompts } = await client.listPrompts();
    expect(prompts.map((prompt) => prompt.name).sort()).toEqual([
      'compare_weeks',
      'page_actions',
      'weekly_report'
    ]);
    expect(client.getInstructions()).toMatch(/Environment:/);
  });

  it('lists every environment, whether it works, and which one is current', async () => {
    const h = await start({
      environments: {
        prod: { url: 'https://prod.workers.test', role: 'admin', secret: SECRETS.prod },
        stage: { url: 'https://stage.workers.test', role: 'analyst', secret: SECRETS.stage },
        broken: { url: 'https://down.workers.test', role: 'admin', secret: 'x' },
        bad: { url: 'not a url', role: 'admin', secret: 'x' }
      }
    });
    const first = await h.call('list_environments');
    expect(first.text).toContain('4 environment(s); 2 working');
    expect(first.text).toContain('not chosen yet');
    const list = first.data!.environments as Array<{
      name: string;
      works: boolean;
      problems: string[];
    }>;
    expect(list.find((item) => item.name === 'broken')).toMatchObject({ works: false });
    expect(list.find((item) => item.name === 'bad')!.problems[0]).toMatch(/not valid/);
    await h.call('get_traffic_overview', { project: 'Acme' });
    const after = await h.call('list_environments');
    expect(after.data!.current).toBe('prod');
  });

  it('explains an empty or unreadable environments file', async () => {
    const empty = await start({ environments: {} });
    expect((await empty.call('list_environments')).text).toMatch(/vizoalica env add/);
    const none = await empty.call('list_websites');
    expect(none.isError).toBe(true);
    expect(none.text).toMatch(/No environments are defined/);
    await empty.client.close();
    open = undefined;
    const broken = await start();
    writePrivate(broken.home, 'environments.json', { version: 1 }, 0o644);
    expect((await broken.call('list_environments')).text).toMatch(/cannot be used/);
    expect((await broken.call('list_websites')).text).toMatch(/cannot be used/);
  });

  it('starts on the environment the console used last, and says so on every answer', async () => {
    const h = await start({ preference: 'stage' });
    const result = await h.call('list_websites');
    expect(result.text.split('\n')[0]).toBe(
      'Environment: stage (analyst, https://stage.workers.test; default: the one last used in the console). Other environments: prod; pass "environment" or call use_environment to switch.'
    );
    expect(result.data!.environment).toEqual({
      name: 'stage',
      role: 'analyst',
      url: 'https://stage.workers.test'
    });
    const explicit = await h.call('list_websites', { environment: 'prod' });
    expect(explicit.text.split('\n')[0]).toBe(
      'Environment: prod (admin, https://prod.workers.test; as requested)'
    );
    // Asking for one environment by name does not change the session's default.
    expect((await h.call('list_websites')).text).toMatch(/^Environment: stage/);
  });

  it('falls back to the first working environment, or the only one', async () => {
    const backends = defaultBackends();
    backends.prod!.fail = 'network';
    const h = await start({ backends, preference: 'prod' });
    expect((await h.call('list_websites')).text).toMatch(
      /^Environment: stage .*default: the first working environment/
    );
    await h.client.close();
    open = undefined;
    const only = await start({
      environments: {
        prod: { url: 'https://prod.workers.test', role: 'admin', secret: SECRETS.prod }
      }
    });
    const text = (await only.call('list_websites')).text;
    expect(text).toMatch(/^Environment: prod .*the only environment on this computer\)$/m);
    expect(text).not.toMatch(/Other environments/);
  });

  it('says so when no environment works', async () => {
    const backends = defaultBackends();
    backends.prod!.fail = 401;
    backends.stage!.fail = 'network';
    const h = await start({ backends });
    const result = await h.call('get_traffic_overview');
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/None of the environments .* works right now \(prod, stage\)/);
  });

  it('switches environments for the session only, and refuses unknown or broken ones', async () => {
    const backends = defaultBackends();
    const h = await start({ backends });
    const switched = await h.call('use_environment', { environment: 'stage' });
    expect(switched.text).toMatch(/^Environment: stage \(analyst, .*this session's environment\)/m);
    expect(switched.text).toContain('Now using environment "stage"');
    expect((await h.call('list_websites')).text).toMatch(
      /^Environment: stage .*session's environment\)$/m
    );
    const unknown = await h.call('use_environment', { environment: 'qa' });
    expect(unknown.isError).toBe(true);
    expect(unknown.text).toContain(
      'There is no environment named "qa". Environments on this computer: prod, stage.'
    );
    expect((await h.call('list_websites', { environment: 'qa' })).text).toMatch(
      /no environment named "qa"/
    );
    backends.prod!.fail = 401;
    const broken = await h.call('use_environment', { environment: 'prod' });
    expect(broken.text).toMatch(
      /does not work right now: The Worker rejected this administrator secret.*vizoalica env check prod/
    );
    expect((await h.call('list_websites')).text).toMatch(/^Environment: stage/);
  });

  it('lists projects and websites without keys or deleted items', async () => {
    const h = await start();
    const result = await h.call('list_websites', { environment: 'prod' });
    expect(result.text).toContain('2 project(s), 2 website(s).');
    expect(result.data!.projects).toEqual([
      {
        id: 'p1',
        name: 'Acme',
        websites: [
          { id: 's1', name: 'Shop', allowedOrigins: ['https://shop.test'], status: 'active' },
          { id: 's2', name: 'Blog', allowedOrigins: [], status: 'active' }
        ]
      },
      { id: 'p2', name: 'Other', websites: [] }
    ]);
    expect(result.text).not.toContain('pk_public');
  });

  it('reports backend health and whether an update is needed', async () => {
    const backends = defaultBackends();
    const h = await start({ backends });
    const good = await h.call('get_environment_status', { environment: 'prod' });
    expect(good.text).toContain('Role admin. Worker 9.9.0: The Worker matches this console.');
    expect(good.text).toContain('Database ok, storage ok.');
    const scoped = await h.call('get_environment_status', { environment: 'stage' });
    expect(scoped.text).toContain('Role analyst, limited to project p1.');
    backends.stage!.scope = { projectId: 'p1', sourceId: 's1' };
    expect((await h.call('get_environment_status', { environment: 'stage' })).text).toContain(
      'limited to project p1 website s1'
    );
    backends.prod!.workerVersion = '9.7.0';
    backends.prod!.health = { database: 'ok', storage: 'unavailable' };
    const old = await h.call('get_environment_status', { environment: 'prod' });
    expect(old.text).toMatch(/older than this console .* Update the backend/);
    expect(old.text).toMatch(/look at the Health page/);
    backends.prod!.health = null;
    expect((await h.call('get_environment_status', { environment: 'prod' })).text).toContain(
      'This backend does not report health.'
    );
  });

  it('gives a traffic overview by project and website name, trimmed to the limit', async () => {
    const h = await start();
    const project = await h.call('get_traffic_overview', {
      environment: 'prod',
      project: 'acme',
      preset: 'last_7_days'
    });
    expect(project.text).toContain(
      'all websites of project Acme, 2026-09-20T12:00:00.000Z to 2026-09-27T12:00:00.000Z (UTC): 100 page views, 25 unique visitors. Top page: Shop / (50).'
    );
    const pages = (
      project.data!.rankings as { pagePaths: { items: unknown[]; otherCount: number } }
    ).pagePaths;
    expect(pages.items).toHaveLength(10);
    expect(pages.otherCount).toBe(3 + 4);
    const website = await h.call('get_traffic_overview', {
      environment: 'prod',
      project: 'p1',
      website: 'Blog',
      start: '2026-09-01',
      end: '2026-09-15',
      limit: 20
    });
    expect(website.text).toContain(
      'Blog (project Acme), 2026-09-01T00:00:00.000Z to 2026-09-15T00:00:00.000Z'
    );
    expect(website.text).toContain('Top page: / (50)');
    expect(h.requests.at(-1)!.query).toContain('source_id=s2');
  });

  it('asks for a project when there are several, and explains unknown or ambiguous names', async () => {
    const backends = defaultBackends();
    const h = await start({ backends });
    expect((await h.call('get_traffic_overview', { environment: 'prod' })).text).toContain(
      'Name a project: Acme (p1), Other (p2).'
    );
    expect(
      (await h.call('get_traffic_overview', { environment: 'prod', project: 'Nope' })).text
    ).toContain('No project "Nope" here. Available: Acme (p1), Other (p2).');
    expect(
      (
        await h.call('get_traffic_overview', {
          environment: 'prod',
          project: 'Other',
          website: 'x'
        })
      ).text
    ).toContain('No website "x" here. Available: none.');
    // The analyst sees one project, so it may be left out.
    expect((await h.call('get_traffic_overview', { environment: 'stage' })).text).toContain(
      '7 page views'
    );
    backends.prod!.projects = [
      { id: 'p1', name: 'Twin' },
      { id: 'p2', name: 'twin' }
    ];
    expect(
      (await h.call('get_traffic_overview', { environment: 'prod', project: 'Twin' })).text
    ).toContain('More than one project is named "Twin": p1, p2. Use the id.');
    backends.prod!.projects = [];
    expect((await h.call('get_traffic_overview', { environment: 'prod' })).text).toContain(
      'This environment has no projects yet.'
    );
    backends.prod!.projects = [{ id: 'bad id!', name: 'Unsafe' }];
    expect((await h.call('get_traffic_overview', { environment: 'prod' })).text).toContain(
      'The request was not valid'
    );
  });

  it('checks ranges before asking the Worker', async () => {
    const h = await start();
    const long = await h.call('get_traffic_overview', {
      environment: 'prod',
      project: 'Acme',
      start: '2026-07-01'
    });
    expect(long.isError).toBe(true);
    expect(long.text).toContain('Invalid range: A range can be at most 30 days.');
    const both = await h.call('get_traffic_overview', {
      environment: 'prod',
      project: 'Acme',
      preset: 'today',
      start: '2026-09-01'
    });
    expect(both.text).toContain('Give either a preset or start and end, not both.');
    expect(
      (
        await h.call('get_traffic_overview', {
          environment: 'prod',
          project: 'Acme',
          start: 'soon'
        })
      ).text
    ).toContain('start must be a date');
  });

  it('turns Worker failures into the next step for that environment', async () => {
    const backends = defaultBackends();
    const h = await start({ backends });
    await h.call('list_websites', { environment: 'prod' });
    backends.prod!.fail = 401;
    const rejected = await h.call('list_websites', { environment: 'prod' });
    expect(rejected.text).toBe(
      'Environment: prod\nThe Worker for "prod" rejected its credential (it may have been rotated or revoked). The user can check it with: vizoalica env check prod'
    );
    backends.prod!.fail = 500;
    expect((await h.call('list_websites', { environment: 'prod' })).text).toContain(
      'The Worker for "prod" did not answer (https://prod.workers.test).'
    );
    backends.prod!.fail = undefined;
    const hidden = await h.call('get_traffic_overview', {
      environment: 'stage',
      project: 'p1',
      website: 'Shop'
    });
    expect(hidden.isError).toBe(false);
    backends.stage!.projects = [{ id: 'p9', name: 'Elsewhere' }];
    const notFound = await h.call('get_traffic_overview', { environment: 'stage' });
    expect(notFound.text).toContain(
      'Not found in "stage", or not visible to the analyst role there.'
    );
  });

  it('compares a period with the one before it', async () => {
    const backends = defaultBackends();
    backends.prod!.pageViews = (start) => (start.startsWith('2026-09-20') ? 120 : 80);
    const h = await start({ backends });
    const result = await h.call('compare_periods', {
      environment: 'prod',
      project: 'Acme',
      preset: 'last_7_days',
      limit: 3
    });
    expect(result.text).toContain('120 page views vs 80 (+50%), 30 visitors vs 20 (+50%).');
    expect(result.text).toContain('previous 2026-09-13T12:00:00.000Z to 2026-09-20T12:00:00.000Z');
    expect(result.data!.pages).toEqual([
      { page: 'Shop /', current: 60, previous: 40, change: 20, percent: 50 },
      { page: 'Blog /pricing', current: 30, previous: 20, change: 10, percent: 50 },
      { page: 'Shop /p0', current: 1, previous: 1, change: 0, percent: 0 }
    ]);
    backends.prod!.pageViews = (start) => (start.startsWith('2026-09-01') ? 10 : 0);
    const custom = await h.call('compare_periods', {
      environment: 'prod',
      project: 'Acme',
      website: 'Shop',
      start: '2026-09-01',
      end: '2026-09-08',
      previous_start: '2026-08-01',
      previous_end: '2026-08-08'
    });
    expect(custom.text).toContain('Shop (project Acme): 10 page views vs 0 (n/a)');
  });

  it('reports clicks with filters, trimmed to the limit, and says when data is still processing', async () => {
    const h = await start();
    const result = await h.call('get_actions', {
      environment: 'prod',
      project: 'Acme',
      page: '/pricing',
      action: 'Button 0',
      limit: 5
    });
    expect(result.text).toContain(
      'all websites of project Acme, page /pricing, action "Button 0", 2026-09-20T12:00:00.000Z to 2026-09-27T12:00:00.000Z (UTC): 30 actions by 7 visitors. Most used: "Button 0" on /pricing (25). Data is processing: recent numbers may still grow.'
    );
    expect(result.data!.rows).toHaveLength(5);
    expect(result.data!.other).toEqual({ rows: 21, count: 2 + (20 * 21) / 2 });
    expect(result.data!.selection).toBeDefined();
    expect(h.requests.at(-1)!.query).toContain('page=%2Fpricing');
    const plain = await h.call('get_actions', {
      environment: 'prod',
      project: 'Acme',
      website: 'Shop'
    });
    expect(plain.data!.rows).toHaveLength(20);
    expect(plain.data!.selection).toBeUndefined();
  });

  it("reports a website's status and probes its address unless told not to", async () => {
    const probed: string[] = [];
    const h = await start({
      server: {
        probe: {
          reachability: async (origin) => {
            probed.push(origin);
            return {
              configEndpointReachable: false,
              configEndpointCheckedAt: 'now',
              configEndpointError: 'http_404'
            };
          },
          install: async () => ({
            code: 'sdk-file-missing',
            nextAction: 'Deploy /vizoalica.js with the site.'
          })
        }
      }
    });
    const result = await h.call('get_website_status', {
      environment: 'prod',
      project: 'Acme',
      website: 'Shop'
    });
    expect(result.text).toContain(
      'Shop: collection healthy, configuration healthy. Site check: sdk-file-missing. Deploy /vizoalica.js with the site.'
    );
    expect(probed).toEqual(['https://shop.test']);
    const quiet = await h.call('get_website_status', {
      environment: 'prod',
      project: 'Acme',
      website: 'Shop',
      check_site: false
    });
    expect(quiet.text).not.toContain('Site check');
    const noOrigins = await h.call('get_website_status', {
      environment: 'prod',
      project: 'Acme',
      website: 'Blog'
    });
    expect(noOrigins.data!.site).toBeUndefined();
    expect(probed).toHaveLength(1);
  });

  it('fills the prompts with the scope asked for', async () => {
    const { client } = await start();
    const weekly = await client.getPrompt({
      name: 'weekly_report',
      arguments: { environment: 'prod', project: 'Acme', website: 'Shop' }
    });
    expect(JSON.stringify(weekly.messages)).toContain(
      'environment \\"prod\\", project \\"Acme\\", website \\"Shop\\"'
    );
    const weeks = await client.getPrompt({ name: 'compare_weeks', arguments: {} });
    expect(JSON.stringify(weeks.messages)).toContain('the current environment');
    const page = await client.getPrompt({ name: 'page_actions', arguments: { page: '/pricing' } });
    expect(JSON.stringify(page.messages)).toContain('For page /pricing');
  });
});
