import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it, vi } from 'vitest';
import worker from '../../ingest-worker/src/index.js';
import type { Env, R2Bucket } from '../../ingest-worker/src/env.js';
import { d1, freshDatabase } from '../../ingest-worker/tests/support/sqlite-d1.js';
import { Vault } from '../../local-ops-api/src/environments/vault.js';
import { McpEnvironments } from '../src/mcp/environments.js';
import { createMcpServer } from '../src/mcp/server.js';
import { tempHome, writePrivate } from './support.js';

const ADMIN = 'admin-secret-0123456789abcdefghijklmn';

function backend(): Env {
  const sqlite = freshDatabase();
  sqlite.exec(`
    INSERT INTO quota_policies VALUES ('q1', 131072, 25, 25, 100, 100000, 25, 256, 7);
    INSERT INTO projects VALUES ('p1','Shop','demo',7,'q1','active');
    INSERT INTO sources VALUES ('s1','p1','Storefront','k1','["https://shop.test"]','active','q1','t','t');
    INSERT INTO sources VALUES ('s2','p1','Blog','k2','["https://blog.test"]','active','q1','t','t');
    INSERT INTO dashboard_minute_dimensions (project_id, source_id, minute_utc, dimension_kind, dimension_value, event_count) VALUES
      ('p1','s1','2026-01-01T12:00:00.000Z','page_path','/',5),
      ('p1','s2','2026-01-01T12:00:00.000Z','page_path','/',3),
      ('p1','s2','2026-01-01T12:00:00.000Z','page_path','/about',1);
  `);
  const bucket: R2Bucket = {
    async put() {},
    async list() {
      return { objects: [], truncated: false };
    },
    async delete() {}
  } as never;
  return {
    VIZOALICA_DB: d1(sqlite),
    VIZOALICA_EVENTS: bucket,
    VIZOALICA_TOKEN_SECRET: 'test-token-secret-0123456789abcdefgh',
    VIZOALICA_ADMIN_SECRET: ADMIN,
    VIZOALICA_ANALYTICS_DIGEST_SECRET: 'analytics-digest-secret-0123456789abcd'
  } as unknown as Env;
}

/** The MCP server against the real Worker code and schema, over an in-process fetch. */
describe('vizoalica mcp against the real Worker', () => {
  it('answers from each environment within its role, naming websites on page rows', async () => {
    const env = backend();
    const fetch = (input: URL | string, init?: RequestInit) =>
      worker.fetch(new Request(String(input), init), env);
    const created = await fetch('https://worker.test/v1/admin/access-keys', {
      method: 'POST',
      headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        label: 'Blog analyst',
        role: 'analyst',
        projectId: 'p1',
        sourceId: 's2'
      })
    });
    const key = ((await created.json()) as { key: string }).key;
    const home = tempHome();
    writePrivate(home, 'environments.json', {
      version: 1,
      environments: {
        prod: { url: 'https://worker.test', role: 'admin', secret: ADMIN },
        blog: { url: 'https://worker.test', role: 'analyst', secret: key }
      }
    });
    const server = createMcpServer({
      environments: new McpEnvironments({
        homeDir: `${home}/.config/vizoalica`,
        version: '0.7.5',
        expectedSchema: null,
        vault: new Vault(vi.fn() as never),
        fetch
      }),
      version: '0.7.5',
      expectedSchema: null,
      now: () => new Date('2026-01-01T13:00:30Z')
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1' });
    await Promise.all([server.connect(b), client.connect(a)]);
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = (await client.callTool({ name, arguments: args })) as {
        content: Array<{ text: string }>;
        structuredContent?: Record<string, unknown>;
      };
      return { text: result.content[0]!.text, data: result.structuredContent! };
    };

    const listed = await call('list_environments', {});
    expect(
      (listed.data.environments as Array<{ works: boolean }>).map((item) => item.works)
    ).toEqual([true, true]);

    const project = await call('get_traffic_overview', {
      environment: 'prod',
      project: 'Shop',
      preset: 'last_24_hours'
    });
    expect(project.text).toMatch(
      /^Environment: prod \(admin, https:\/\/worker\.test; as requested\)/
    );
    expect((project.data.rankings as { pagePaths: { items: unknown[] } }).pagePaths.items).toEqual([
      { label: '/', count: 5, website: 'Storefront' },
      { label: '/', count: 3, website: 'Blog' },
      { label: '/about', count: 1, website: 'Blog' }
    ]);

    const scoped = await call('get_traffic_overview', {
      environment: 'blog',
      preset: 'last_24_hours'
    });
    expect(scoped.text).toMatch(/^Environment: blog \(analyst/);
    expect((scoped.data.rankings as { pagePaths: { items: unknown[] } }).pagePaths.items).toEqual([
      { label: '/', count: 3 },
      { label: '/about', count: 1 }
    ]);
    const hidden = await call('get_traffic_overview', {
      environment: 'blog',
      website: 'Storefront'
    });
    expect(hidden.text).toContain('No website "Storefront" here. Available: Blog (s2).');

    const status = await call('get_environment_status', { environment: 'blog' });
    expect(status.text).toContain('Role analyst, limited to project p1 website s2.');
    const actions = await call('get_actions', {
      environment: 'prod',
      project: 'Shop',
      website: 'Blog',
      preset: 'last_24_hours'
    });
    expect(actions.text).toContain('0 actions by 0 visitors.');
    const website = await call('get_website_status', {
      environment: 'prod',
      website: 'Blog',
      check_site: false
    });
    expect(website.text).toContain('Blog: collection healthy, configuration healthy.');
    await client.close();
  });
});
