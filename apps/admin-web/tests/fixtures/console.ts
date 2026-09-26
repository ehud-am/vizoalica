import type {
  ActionsReport,
  AnalyticsOverview,
  Integration,
  Project,
  Website
} from '../../src/api/local-operations.js';

export const primaryProject: Project = {
  id: 'project-1',
  name: 'Developer Tools',
  websiteCount: 1
};

export const duplicateNameProject: Project = {
  id: 'project-2',
  name: 'Developer Tools',
  websiteCount: 0
};

export const consoleProjects: Project[] = [primaryProject, duplicateNameProject];

const primaryWebsite: Website = {
  id: 'site-1',
  projectId: primaryProject.id,
  name: 'Docs',
  publicSourceKey: 'public-key',
  allowedOrigins: ['https://docs.example.com'],
  status: 'active'
};

const staticSnippet =
  '<script async src="/vizoalica.js" data-endpoint="https://worker.test/v1/events:batch" data-source="public-key"></script>';
const customizeSnippet =
  '<script async src="/vizoalica.js" data-endpoint="https://worker.test/v1/events:batch" data-source="public-key" data-project="project-1" data-token-url="/vizoalica/ingest-token" data-consent="unknown"></script>';

export const primaryIntegration: Integration = {
  projectId: primaryProject.id,
  sourceId: primaryWebsite.id,
  publicSourceKey: primaryWebsite.publicSourceKey,
  allowedOrigins: primaryWebsite.allowedOrigins,
  html: staticSnippet,
  modes: [
    {
      id: 'static',
      snippet: staticSnippet,
      customize: customizeSnippet,
      defaults: {
        'data-token-url': '/vizoalica/ingest-token',
        'data-consent': 'unknown',
        'data-project': 'taken from the source key'
      }
    },
    {
      id: 'dynamic',
      snippet: '<script async src="/vizoalica-loader.js"></script>',
      configUrl: '/vizoalica/config.json',
      config: {
        version: 1,
        src: '/vizoalica.js',
        'data-endpoint': 'https://worker.test/v1/events:batch',
        'data-source': 'public-key',
        'data-project': primaryProject.id,
        'data-token-url': '/vizoalica/ingest-token',
        'data-consent': 'unknown'
      },
      cloudflare: {
        workflowRef: 'ehud-am/vizoalica/.github/workflows/deploy-vizoalica-pages.yml@v0.7.3',
        repoVariables: {
          VIZOALICA_SITE:
            '{"endpoint":"https://worker.test/v1/events:batch","sourceKey":"public-key","projectId":"project-1","sourceId":"site-1","origins":["https://docs.example.com"]}'
        },
        expandedRepoVariables: {
          VIZOALICA_INGEST_ENDPOINT: 'https://worker.test/v1/events:batch',
          VIZOALICA_PUBLIC_SOURCE_KEY: 'public-key',
          VIZOALICA_PROJECT_ID: primaryProject.id,
          VIZOALICA_SOURCE_ID: primaryWebsite.id,
          VIZOALICA_SITE_ORIGINS: 'https://docs.example.com'
        },
        defaults: {
          VIZOALICA_SDK_SRC: '/vizoalica.js',
          VIZOALICA_TOKEN_URL: '/vizoalica/ingest-token',
          VIZOALICA_CONSENT: 'unknown'
        },
        summary: { publicValues: 3, secrets: 2 },
        accountLookupCommand: 'npx wrangler whoami && npx wrangler pages project list',
        accountSpecificVariables: ['CF_ACCOUNT_ID', 'CF_PAGES_PROJECT'],
        repoSecretNames: ['CF_API_TOKEN', 'VIZOALICA_TOKEN_SECRET'],
        starterWorkflowYaml:
          'name: Deploy website\non:\n  push:\n    branches: [main]\n\njobs:\n  deploy:\n    uses: ehud-am/vizoalica/.github/workflows/deploy-vizoalica-pages.yml@v0.7.3\n    secrets: inherit',
        setupCommands: [
          `gh variable set VIZOALICA_SITE --body '{"endpoint":"https://worker.test/v1/events:batch"}'`,
          'gh variable set CF_ACCOUNT_ID --body YOUR_CF_ACCOUNT_ID',
          'gh secret set CF_API_TOKEN'
        ],
        warnings: ['Public values are not secrets.', 'Enable only one installation mode.']
      }
    }
  ],
  privateSetup: { tokenIssuer: 'website-owned', tokenSecretRequired: true }
};

export function makeOverview(overrides: Partial<AnalyticsOverview> = {}): AnalyticsOverview {
  return {
    scope: {
      projectId: 'p1',
      sourceId: null,
      label: 'All websites',
      identityMode: 'project-supplied'
    },
    range: {
      startUtc: '2026-01-01T00:00:00.000Z',
      endUtc: '2026-01-02T00:00:00.000Z',
      interval: 'hour',
      timezone: 'UTC'
    },
    totals: { pageViews: 0, uniqueUsers: 0 },
    trend: [],
    rankings: {
      pagePaths: { items: [], otherCount: 0, total: 0 },
      countries: { items: [], otherCount: 0, total: 0 },
      userAgents: { items: [], otherCount: 0, total: 0 },
      referrers: { items: [], otherCount: 0, total: 0 }
    },
    distributions: {
      operatingSystems: { items: [], total: 0 },
      browsers: { items: [], total: 0 },
      devices: { items: [], total: 0 },
      traffic: { items: [], total: 0 }
    },
    availability: { state: 'complete', taxonomyVersions: [1] },
    ...overrides
  };
}

/** A small actions report: two pages, four actions, one link with a destination. */
export function makeActionsReport(overrides: Partial<ActionsReport> = {}): ActionsReport {
  return {
    scope: {
      projectId: 'p1',
      sourceId: null,
      label: 'All websites',
      identityMode: 'source-local'
    },
    range: {
      startUtc: '2026-01-01T00:00:00.000Z',
      endUtc: '2026-01-02T00:00:00.000Z',
      interval: 'hour',
      timezone: 'UTC'
    },
    totals: { actions: 30, uniqueUsers: 12 },
    rows: [
      {
        page: '/pricing',
        action: 'Start free trial',
        kind: 'link',
        destination: 'https://app.example.com/signup',
        count: 12,
        visitors: 8,
        pageViews: 40
      },
      {
        page: '/#/orders/:id',
        action: 'Download invoice',
        kind: 'button',
        count: 8,
        visitors: 3,
        pageViews: 4
      },
      {
        page: '/pricing',
        action: 'Contact sales',
        kind: 'button',
        count: 4,
        visitors: 4,
        pageViews: 40
      },
      { page: '/legacy', action: 'Go', kind: 'other', count: 2, visitors: 1, pageViews: 0 }
    ],
    other: { rows: 3, count: 4 },
    actions: [
      { action: 'Start free trial', kind: 'link', count: 12, visitors: 8, pages: 1 },
      { action: 'Download invoice', kind: 'button', count: 8, visitors: 3, pages: 1 },
      { action: 'Contact sales', kind: 'button', count: 5, visitors: 5, pages: 2 }
    ],
    availability: { state: 'complete', taxonomyVersions: [1] },
    ...overrides
  };
}
