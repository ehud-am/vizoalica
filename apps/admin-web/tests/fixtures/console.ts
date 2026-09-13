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
        publicVariables: {
          VIZOALICA_SDK_SRC: 'https://docs.example.com/vizoalica.js',
          VIZOALICA_INGEST_ENDPOINT: 'https://worker.test/v1/events:batch',
          VIZOALICA_PUBLIC_SOURCE_KEY: 'public-key',
          VIZOALICA_PROJECT_ID: primaryProject.id,
          VIZOALICA_TOKEN_URL: '/vizoalica/ingest-token',
          VIZOALICA_CONSENT: 'unknown'
        },
        targetInputs: {
          pagesProject: 'YOUR_PAGES_PROJECT',
          environment: 'production',
          productionBranch: 'main',
          siteDirectory: 'YOUR_SITE_DIRECTORY',
          outputDirectory: 'public'
        },
        steps: [
          { id: 'inspect', title: 'Inspect target', commands: ['wrangler whoami'] },
          { id: 'configure', title: 'Configure public values', commands: ['merge vars'] },
          { id: 'review', title: 'Review changes', commands: ['git diff'] },
          { id: 'exercise', title: 'Exercise locally', commands: ['wrangler pages dev public'] },
          { id: 'deploy', title: 'Deploy approved changes', commands: ['wrangler pages deploy'] },
          { id: 'verify', title: 'Verify deployment', commands: ['pnpm website:verify'] }
        ],
        warnings: ['Public values are not secrets.', 'Enable only one installation mode.']
      }
    }
  ],
  privateSetup: { tokenIssuer: 'website-owned', tokenSecretRequired: true }
};
