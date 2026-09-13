import type { Integration, Project, Website } from '../../src/api/local-operations.js';

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

export const emptyProjects: Project[] = [];

export const primaryWebsite: Website = {
  id: 'site-1',
  projectId: primaryProject.id,
  name: 'Docs',
  publicSourceKey: 'public-key',
  allowedOrigins: ['https://docs.example.com'],
  status: 'active'
};

export const staticSnippet =
  '<script async src="https://docs.example.com/vizoalica.js" data-endpoint="https://worker.test/v1/events:batch" data-source="public-key" data-project="project-1" data-token-url="/vizoalica/ingest-token" data-consent="unknown"></script>';

export const primaryIntegration: Integration = {
  projectId: primaryProject.id,
  sourceId: primaryWebsite.id,
  publicSourceKey: primaryWebsite.publicSourceKey,
  allowedOrigins: primaryWebsite.allowedOrigins,
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
        'data-project': primaryProject.id,
        'data-token-url': '/vizoalica/ingest-token',
        'data-consent': 'unknown'
      },
      cloudflare: {
        workflowRef: 'ehud-am/vizoalica/.github/workflows/deploy-vizoalica-pages.yml@v0.5.2',
        repoVariables: {
          VIZOALICA_SDK_SRC: 'https://docs.example.com/vizoalica.js',
          VIZOALICA_INGEST_ENDPOINT: 'https://worker.test/v1/events:batch',
          VIZOALICA_PUBLIC_SOURCE_KEY: 'public-key',
          VIZOALICA_PROJECT_ID: primaryProject.id,
          VIZOALICA_TOKEN_URL: '/vizoalica/ingest-token',
          VIZOALICA_CONSENT: 'unknown',
          VIZOALICA_SOURCE_ID: primaryWebsite.id,
          VIZOALICA_SITE_ORIGIN: 'https://docs.example.com'
        },
        accountSpecificVariables: ['CF_ACCOUNT_ID', 'CF_PAGES_PROJECT'],
        repoSecretNames: ['CF_API_TOKEN', 'VIZOALICA_TOKEN_SECRET'],
        starterWorkflowYaml:
          'name: Deploy website\non:\n  push:\n    branches: [main]\n    paths: ["YOUR_SITE_DIRECTORY/**"]\n\njobs:\n  deploy:\n    uses: ehud-am/vizoalica/.github/workflows/deploy-vizoalica-pages.yml@v0.5.2\n    with:\n      site-directory: YOUR_SITE_DIRECTORY\n    secrets: inherit',
        setupCommands: [
          'gh variable set VIZOALICA_SDK_SRC --body "https://docs.example.com/vizoalica.js"',
          'gh secret set CF_API_TOKEN'
        ],
        warnings: ['Public values are not secrets.', 'Enable only one installation mode.']
      }
    }
  ],
  privateSetup: { tokenIssuer: 'website-owned', tokenSecretRequired: true }
};
