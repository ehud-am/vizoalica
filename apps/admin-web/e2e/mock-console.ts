import type { Page } from '@playwright/test';

const project = { id: 'project-1', name: 'Developer Tools', websiteCount: 1 };
export const secondProject = { id: 'project-2', name: 'Developer Tools', websiteCount: 0 };
const website = {
  id: 'site-1',
  projectId: project.id,
  name: 'Docs',
  publicSourceKey: 'public-key',
  allowedOrigins: ['https://docs.example.com'],
  status: 'active'
};

// 25 countries plus Tor and unknown traffic, so the complete list, the map, and the special
// labels can all be exercised.
export const COUNTRY_CODES = [
  'US',
  'DE',
  'GB',
  'FR',
  'IN',
  'BR',
  'CA',
  'AU',
  'JP',
  'NL',
  'ES',
  'IT',
  'SE',
  'PL',
  'MX',
  'KR',
  'ZA',
  'NG',
  'AR',
  'TR',
  'ID',
  'NZ',
  'NO',
  'CH',
  'EG'
];

const geographyItems = [
  ...COUNTRY_CODES.map((label, index) => ({ label, count: 1000 - index * 30 })),
  { label: 'T1', count: 40 },
  { label: 'Unknown', count: 20 }
];

function overview(startUtc: string, endUtc: string) {
  const total = geographyItems.reduce((sum, item) => sum + item.count, 0);
  return {
    scope: {
      projectId: project.id,
      sourceId: null,
      label: 'All websites',
      identityMode: 'project-supplied'
    },
    range: { startUtc, endUtc, interval: 'hour', timezone: 'UTC' },
    totals: { pageViews: total, uniqueUsers: 3941 },
    trend: [
      { startUtc: '2026-09-10T00:00:00.000Z', pageViews: 500, uniqueUsers: 210 },
      { startUtc: '2026-09-10T01:00:00.000Z', pageViews: 740, uniqueUsers: 310 }
    ],
    rankings: {
      pagePaths: {
        items: [{ label: '/docs/getting-started/a-very-long-route', count: 820 }],
        otherCount: 20,
        total: 840
      },
      countries: { items: geographyItems, otherCount: 0, total },
      userAgents: { items: [{ label: 'Chrome 120', count: 500 }], otherCount: 0, total: 500 },
      referrers: { items: [{ label: 'Direct', count: 700 }], otherCount: 0, total: 700 }
    },
    distributions: {
      operatingSystems: { items: [{ label: 'macOS', count: 500 }], total: 500 },
      browsers: { items: [{ label: 'Chrome', count: 500 }], total: 500 },
      devices: { items: [{ label: 'Desktop', count: 500 }], total: 500 },
      traffic: { items: [{ label: 'Human', count: 500 }], total: 500 }
    },
    availability: { state: 'complete', taxonomyVersions: [1] }
  };
}

const actionRows = [
  {
    page: '/#/pricing',
    action: 'Start free trial',
    kind: 'link',
    destination: 'https://app.example.com/signup',
    count: 120,
    visitors: 80,
    pageViews: 400
  },
  {
    page: '/#/orders/:id',
    action: 'Download invoice',
    kind: 'button',
    count: 80,
    visitors: 30,
    pageViews: 40
  },
  {
    page: '/#/pricing',
    action: 'Contact sales',
    kind: 'button',
    count: 40,
    visitors: 39,
    pageViews: 400
  },
  {
    page: '/#/orders/:id',
    action: 'Contact sales',
    kind: 'button',
    count: 10,
    visitors: 9,
    pageViews: 40
  }
];

/** The actions report, narrowed by the same exact-match filters the Worker applies. */
function actionsReport(url: URL) {
  const page = url.searchParams.get('page') ?? undefined;
  const action = url.searchParams.get('action') ?? undefined;
  const rows = actionRows.filter(
    (row) => (!page || row.page === page) && (!action || row.action === action)
  );
  const totals = new Map<
    string,
    { action: string; kind: string; count: number; visitors: number; pages: number }
  >();
  for (const row of actionRows.filter((entry) => !action || entry.action === action)) {
    const current = totals.get(row.action) ?? {
      action: row.action,
      kind: row.kind,
      count: 0,
      visitors: 0,
      pages: 0
    };
    current.count += row.count;
    current.visitors += row.visitors;
    current.pages += 1;
    totals.set(row.action, current);
  }
  const selectedRows = page ? actionRows.filter((row) => row.page === page) : [];
  return {
    scope: {
      projectId: project.id,
      sourceId: null,
      label: 'All websites',
      identityMode: 'source-local'
    },
    range: {
      startUtc: url.searchParams.get('start') ?? '2026-09-10T00:00:00.000Z',
      endUtc: url.searchParams.get('end') ?? '2026-09-11T00:00:00.000Z',
      interval: 'hour',
      timezone: 'UTC'
    },
    totals: { actions: rows.reduce((sum, row) => sum + row.count, 0), uniqueUsers: 120 },
    rows,
    other: { rows: 0, count: 0 },
    actions: [...totals.values()].sort((a, b) => b.count - a.count),
    ...(page
      ? {
          selection: {
            page: {
              path: page,
              views: selectedRows[0]?.pageViews ?? 0,
              actions: selectedRows.reduce((sum, row) => sum + row.count, 0)
            }
          }
        }
      : {}),
    availability: { state: 'complete', taxonomyVersions: [1] }
  };
}

const staticSnippet =
  '<script async src="/vizoalica.js" data-source="public-key" data-project="project-1"></script>';

export interface MockOptions {
  projects?: unknown[];
}

/** Answers every console API call locally; nothing reaches a real backend. */
export async function mockConsole(page: Page, options: MockOptions = {}) {
  // Websites created during a test are listed afterwards, so create-then-open flows work.
  const created: Array<Record<string, unknown>> = [];
  await page.route(/^http:\/\/127\.0\.0\.1:4173\/api\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    let body: unknown = {};
    if (path === '/api/session') return route.fulfill({ status: 204 });
    if (path.endsWith('/websites') && request.method() === 'POST') {
      const projectId = path.split('/')[3]!;
      const input = request.postDataJSON() as { name: string; allowedOrigins: string[] };
      const record = {
        id: 'site-created',
        projectId,
        name: input.name,
        publicSourceKey: 'created-public-key',
        allowedOrigins: input.allowedOrigins,
        status: 'active'
      };
      created.push(record);
      return route.fulfill({ status: 201, json: record });
    }
    if (request.method() === 'DELETE')
      return route.fulfill({ json: { status: 'deleted', audit: 'recorded' } });
    if (request.method() === 'PATCH') return route.fulfill({ json: website });
    if (path === '/api/projects') body = options.projects ?? [project, secondProject];
    else if (path === '/api/preferences/theme') body = { theme: null };
    else if (path.endsWith('/websites'))
      body = [website, ...created.filter((item) => item.projectId === path.split('/')[3])];
    else if (path.endsWith('/snippet'))
      body = {
        projectId: project.id,
        sourceId: website.id,
        publicSourceKey: 'public-key',
        allowedOrigins: website.allowedOrigins,
        tokenIssuer: 'website-owned',
        html: staticSnippet,
        modes: [
          { id: 'static', snippet: staticSnippet },
          {
            id: 'dynamic',
            snippet: '<script async src="/vizoalica-loader.js"></script>',
            configUrl: '/vizoalica/config.json',
            config: {
              version: 1,
              src: 'https://docs.example.com/vizoalica.js',
              'data-endpoint': 'https://worker.test/v1/events:batch',
              'data-source': 'public-key',
              'data-project': project.id,
              'data-token-url': '/vizoalica/ingest-token',
              'data-consent': 'unknown'
            },
            cloudflare: {
              workflowRef: 'ehud-am/vizoalica/.github/workflows/deploy-vizoalica-pages.yml@v0.5.3',
              repoVariables: {
                VIZOALICA_SDK_SRC: 'https://docs.example.com/vizoalica.js',
                VIZOALICA_INGEST_ENDPOINT: 'https://worker.test/v1/events:batch',
                VIZOALICA_PUBLIC_SOURCE_KEY: 'public-key',
                VIZOALICA_PROJECT_ID: project.id,
                VIZOALICA_TOKEN_URL: '/vizoalica/ingest-token',
                VIZOALICA_CONSENT: 'unknown',
                VIZOALICA_SOURCE_ID: website.id,
                VIZOALICA_SITE_ORIGINS: 'https://docs.example.com'
              },
              accountSpecificVariables: ['CF_ACCOUNT_ID', 'CF_PAGES_PROJECT'],
              repoSecretNames: ['CF_API_TOKEN', 'VIZOALICA_TOKEN_SECRET'],
              starterWorkflowYaml:
                'name: Deploy website\non:\n  push:\n    branches: [main]\n\njobs:\n  deploy:\n    uses: ehud-am/vizoalica/.github/workflows/deploy-vizoalica-pages.yml@v0.5.3\n    with:\n      site-directory: YOUR_SITE_DIRECTORY\n    secrets: inherit',
              setupCommands: [
                'gh variable set VIZOALICA_SDK_SRC --body "https://docs.example.com/vizoalica.js"',
                'gh secret set CF_API_TOKEN'
              ],
              warnings: [
                'The listed repository variables are public browser configuration, not secrets.',
                'Enable only one installation mode so Vizoalica initializes once.'
              ]
            }
          }
        ],
        privateSetup: { tokenIssuer: 'website-owned', tokenSecretRequired: true }
      };
    else if (path.endsWith('/status'))
      body = {
        collection: 'healthy',
        aggregation: 'available',
        configuration: 'healthy',
        dataAccess: 'available'
      };
    else if (path.endsWith('/reachability'))
      body = {
        configEndpointReachable: true,
        configEndpointCheckedAt: '2026-09-10T00:00:00.000Z',
        configEndpointError: null
      };
    else if (path.endsWith('/analytics/actions')) body = actionsReport(url);
    else if (path.endsWith('/analytics'))
      body = overview(
        url.searchParams.get('start') ?? '2026-09-10T00:00:00.000Z',
        url.searchParams.get('end') ?? '2026-09-11T00:00:00.000Z'
      );
    await route.fulfill({ json: body });
  });
}
