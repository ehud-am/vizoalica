import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { vi } from 'vitest';
import { Vault } from '../../local-ops-api/src/environments/vault.js';
import { McpEnvironments } from '../src/mcp/environments.js';
import { createMcpServer, type ServerDeps } from '../src/mcp/server.js';
import { tempHome, writePrivate } from './support.js';

export const SECRETS = {
  prod: 'prod-admin-secret-0123456789abcdefghijkl',
  stage: 'vzk_stage0000000_analystkeyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
};

export type FakeBackend = {
  role?: 'admin' | 'analyst' | 'owner';
  scope?: { projectId: string | null; sourceId: string | null };
  projects?: Array<{ id: string; name: string; status?: string }>;
  sources?: Record<
    string,
    Array<{
      id: string;
      name: string;
      allowedOrigins?: string[];
      status?: string;
      publicSourceKey?: string;
    }>
  >;
  pageViews?: (start: string) => number;
  /** Answer every request with this status, or throw like a network failure. */
  fail?: number | 'network';
  workerVersion?: string | null;
  schemaApplied?: number | null;
  health?: { database: 'ok' | 'unavailable'; storage: 'ok' | 'unavailable' } | null;
  availability?: string;
};

const json = (body: unknown, status = 200) => Response.json(body, { status });

function overview(backend: FakeBackend, url: URL, sourceId: string | null) {
  const start = url.searchParams.get('start')!;
  const views = backend.pageViews ? backend.pageViews(start) : 100;
  const page = (label: string, count: number, website?: string) => ({
    label,
    count,
    ...(website && !sourceId ? { website } : {})
  });
  return {
    scope: { projectId: 'p1', sourceId, label: 'x', identityMode: 'source-local' },
    range: {
      startUtc: start,
      endUtc: url.searchParams.get('end'),
      interval: 'day',
      timezone: 'UTC'
    },
    totals: { pageViews: views, uniqueUsers: Math.round(views / 4) },
    trend: [{ startUtc: start, pageViews: views, uniqueUsers: 1 }],
    rankings: {
      pagePaths: {
        items: [
          page('/', Math.round(views / 2), 'Shop'),
          page('/pricing', Math.round(views / 4), 'Blog'),
          ...Array.from({ length: 12 }, (_, index) => page(`/p${index}`, 1, 'Shop'))
        ],
        otherCount: 3,
        total: views
      },
      countries: { items: [{ label: 'DE', count: 5 }], otherCount: 0, total: 5 },
      userAgents: { items: [], otherCount: 0, total: 0 },
      referrers: { items: [], otherCount: 0, total: 0 }
    },
    distributions: {
      operatingSystems: { items: [], total: 0 },
      browsers: { items: [], total: 0 },
      devices: { items: [], total: 0 },
      traffic: { items: [], total: 0 }
    },
    availability: { state: backend.availability ?? 'complete', taxonomyVersions: [1] }
  };
}

/** A fetch that answers as one Worker per host, holding each environment's own data. */
export function fakeWorkers(backends: Record<string, FakeBackend>) {
  const requests: Array<{
    host: string;
    path: string;
    query: string;
    authorization: string | null;
  }> = [];
  const fetchMock = vi.fn(async (input: URL | string, init?: RequestInit) => {
    const url = new URL(String(input));
    const host = url.hostname.split('.')[0]!;
    const backend = backends[host];
    const authorization = new Headers(init?.headers).get('authorization');
    requests.push({ host, path: url.pathname, query: url.search, authorization });
    if (!backend) throw new TypeError('offline');
    if (backend.fail === 'network') throw new TypeError('offline');
    if (typeof backend.fail === 'number') return json({ error: 'failed' }, backend.fail);
    const path = url.pathname;
    const role = backend.role ?? 'admin';
    if (path === '/v1/admin/whoami')
      return json({
        role,
        scope: backend.scope ?? { projectId: null, sourceId: null },
        keyLabel: role === 'admin' ? null : 'Key',
        workerVersion: backend.workerVersion === undefined ? '9.9.0' : backend.workerVersion,
        features: { accessKeys: true, versions: true }
      });
    if (path === '/v1/admin/backend')
      return json({
        workerVersion: backend.workerVersion === undefined ? '9.9.0' : backend.workerVersion,
        schema: {
          applied: backend.schemaApplied === undefined ? 12 : backend.schemaApplied,
          expected: 12,
          appliedNames: [],
          status: 'current'
        },
        health: backend.health === undefined ? { database: 'ok', storage: 'ok' } : backend.health
      });
    if (path === '/v1/admin/projects') return json(backend.projects ?? []);
    const sources = /^\/v1\/admin\/projects\/([^/]+)\/sources$/.exec(path);
    if (sources) {
      const list = backend.sources?.[sources[1]!];
      return list ? json(list) : json({ error: 'not_found' }, 404);
    }
    const analytics = /^\/v1\/admin\/projects\/([^/]+)\/analytics$/.exec(path);
    if (analytics) {
      if (!backend.projects?.some((project) => project.id === analytics[1]))
        return json({ error: 'not_found' }, 404);
      return json(overview(backend, url, url.searchParams.get('source_id')));
    }
    if (/^\/v1\/admin\/projects\/[^/]+\/analytics\/actions$/.test(path))
      return json({
        scope: {},
        range: {},
        totals: { actions: 30, uniqueUsers: 7 },
        rows: Array.from({ length: 25 }, (_, index) => ({
          page: '/pricing',
          action: `Button ${index}`,
          kind: 'button',
          count: 25 - index,
          visitors: 1,
          pageViews: 40
        })),
        other: { rows: 1, count: 2 },
        actions: [{ action: 'Button 0', kind: 'button', count: 25, visitors: 1, pages: 1 }],
        ...(url.searchParams.get('page')
          ? { selection: { page: { path: url.searchParams.get('page'), views: 40, actions: 30 } } }
          : {}),
        availability: { state: 'processing', taxonomyVersions: [1] }
      });
    const status = /^\/v1\/admin\/projects\/[^/]+\/sources\/([^/]+)\/status$/.exec(path);
    if (status)
      return json({
        sourceId: status[1],
        collection: 'healthy',
        aggregation: 'available',
        configuration: 'healthy',
        dataAccess: 'available'
      });
    return json({ error: 'not_found' }, 404);
  });
  return { fetchMock, requests };
}

export const defaultBackends = (): Record<string, FakeBackend> => ({
  prod: {
    projects: [
      { id: 'p1', name: 'Acme' },
      { id: 'p2', name: 'Other' },
      { id: 'p3', name: 'Gone', status: 'deleted' }
    ],
    sources: {
      p1: [
        {
          id: 's1',
          name: 'Shop',
          allowedOrigins: ['https://shop.test'],
          status: 'active',
          publicSourceKey: 'pk_public'
        },
        { id: 's2', name: 'Blog', allowedOrigins: [], status: 'active' },
        { id: 's9', name: 'Old', status: 'deleted' }
      ],
      p2: []
    }
  },
  stage: {
    role: 'analyst',
    scope: { projectId: 'p1', sourceId: null },
    projects: [{ id: 'p1', name: 'Acme' }],
    sources: { p1: [{ id: 's1', name: 'Shop', allowedOrigins: ['https://shop.test'] }] },
    pageViews: () => 7
  }
});

export type Harness = {
  client: Client;
  home: string;
  environments: McpEnvironments;
  requests: ReturnType<typeof fakeWorkers>['requests'];
  call: (
    name: string,
    args?: Record<string, unknown>
  ) => Promise<{ text: string; isError: boolean; data: Record<string, unknown> | undefined }>;
  texts: string[];
};

/** A connected MCP client and server with two environments, prod (admin) and stage (analyst). */
export async function harness(
  options: {
    backends?: Record<string, FakeBackend>;
    environments?: Record<string, unknown>;
    preference?: string;
    server?: Partial<ServerDeps>;
    now?: Date;
  } = {}
): Promise<Harness> {
  const home = tempHome();
  writePrivate(home, 'environments.json', {
    version: 1,
    environments: options.environments ?? {
      prod: { url: 'https://prod.workers.test', role: 'admin', secret: SECRETS.prod },
      stage: { url: 'https://stage.workers.test', role: 'analyst', secret: SECRETS.stage }
    }
  });
  if (options.preference)
    writePrivate(home, 'preferences.json', { environment: options.preference });
  const { fetchMock, requests } = fakeWorkers(options.backends ?? defaultBackends());
  const environments = new McpEnvironments({
    homeDir: `${home}/.config/vizoalica`,
    version: '9.9.0',
    expectedSchema: 12,
    vault: new Vault(vi.fn() as never),
    fetch: fetchMock as never
  });
  const server = createMcpServer({
    environments,
    version: '9.9.0',
    expectedSchema: 12,
    now: () => options.now ?? new Date('2026-09-27T12:00:30Z'),
    ...options.server
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const texts: string[] = [];
  return {
    client,
    home,
    environments,
    requests,
    texts,
    call: async (name, args = {}) => {
      const result = (await client.callTool({ name, arguments: args })) as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
        structuredContent?: Record<string, unknown>;
      };
      const text = result.content.map((item) => item.text).join('\n');
      texts.push(text, JSON.stringify(result.structuredContent ?? {}));
      return { text, isError: result.isError === true, data: result.structuredContent };
    }
  };
}
