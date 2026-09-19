import {
  isDynamicConfigV1,
  validOrigins,
  type CloudflareGuidance,
  type DynamicConfigV1,
  type InstallationGuidance
} from '../contracts.js';

function attribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const WORKFLOW_REF = 'ehud-am/vizoalica/.github/workflows/deploy-vizoalica-pages.yml@v0.5.3';

function cloudflareGuidance(
  config: DynamicConfigV1,
  sourceId: string,
  siteOrigins: string[]
): CloudflareGuidance {
  const repoVariables: Record<string, string> = {
    VIZOALICA_SDK_SRC: config.src,
    VIZOALICA_INGEST_ENDPOINT: config['data-endpoint'],
    VIZOALICA_PUBLIC_SOURCE_KEY: config['data-source'],
    VIZOALICA_PROJECT_ID: config['data-project'],
    VIZOALICA_TOKEN_URL: config['data-token-url'],
    VIZOALICA_CONSENT: config['data-consent'],
    VIZOALICA_SOURCE_ID: sourceId,
    VIZOALICA_SITE_ORIGINS: siteOrigins.join(',')
  };
  const accountSpecificVariables = ['CF_ACCOUNT_ID', 'CF_PAGES_PROJECT'];
  const repoSecretNames = ['CF_API_TOKEN', 'VIZOALICA_TOKEN_SECRET'];
  const starterWorkflowYaml = [
    'name: Deploy website',
    'on:',
    '  push:',
    '    branches: [main]',
    '    paths: ["YOUR_SITE_DIRECTORY/**"]',
    '',
    'jobs:',
    '  deploy:',
    `    uses: ${WORKFLOW_REF}`,
    '    with:',
    '      site-directory: YOUR_SITE_DIRECTORY',
    '    secrets: inherit'
  ].join('\n');
  const setupCommands = [
    ...Object.entries(repoVariables).map(
      ([name, value]) => `gh variable set ${name} --body ${JSON.stringify(value)}`
    ),
    ...accountSpecificVariables.map((name) => `gh variable set ${name} --body YOUR_${name}`),
    ...repoSecretNames.map((name) => `gh secret set ${name}`)
  ];
  return {
    workflowRef: WORKFLOW_REF,
    repoVariables,
    accountSpecificVariables,
    repoSecretNames,
    starterWorkflowYaml,
    setupCommands,
    warnings: [
      'The listed repository variables are public browser configuration, not secrets.',
      'CF_API_TOKEN and VIZOALICA_TOKEN_SECRET are secrets: generate them yourself and set them with gh secret set (or the GitHub UI), never paste a real value into this console.',
      'Scope CF_API_TOKEN to Cloudflare Pages: Edit on this account only.',
      'Enable only one installation mode so Vizoalica initializes once.'
    ]
  };
}

export function integrationSnippet(
  metadata: unknown,
  remoteUrl: string,
  projectId: string,
  sourceId: string
): InstallationGuidance {
  const item = metadata as { publicSourceKey?: unknown; allowedOrigins?: unknown } | null;
  if (!item || typeof item.publicSourceKey !== 'string' || !validOrigins(item.allowedOrigins))
    throw new Error('remote_unavailable');
  const origin = new URL(item.allowedOrigins[0]!);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== item.allowedOrigins[0])
    throw new Error('remote_unavailable');
  const html = `<script\n  async\n  src="${attribute(origin.origin)}/vizoalica.js"\n  data-endpoint="${attribute(new URL('/v1/events:batch', remoteUrl).href)}"\n  data-source="${attribute(item.publicSourceKey)}"\n  data-project="${attribute(projectId)}"\n  data-token-url="/vizoalica/ingest-token"\n  data-consent="unknown"\n></script>`;
  const config: DynamicConfigV1 = {
    version: 1,
    src: `${origin.origin}/vizoalica.js`,
    'data-endpoint': new URL('/v1/events:batch', remoteUrl).href,
    'data-source': item.publicSourceKey,
    'data-project': projectId,
    'data-token-url': '/vizoalica/ingest-token',
    'data-consent': 'unknown'
  };
  if (!isDynamicConfigV1(config)) throw new Error('remote_unavailable');
  const dynamicSnippet = '<script async src="/vizoalica-loader.js"></script>';
  return {
    publicSourceKey: item.publicSourceKey,
    allowedOrigins: item.allowedOrigins,
    modes: [
      { id: 'static', snippet: html },
      {
        id: 'dynamic',
        snippet: dynamicSnippet,
        configUrl: '/vizoalica/config.json',
        config,
        cloudflare: cloudflareGuidance(config, sourceId, item.allowedOrigins)
      }
    ],
    privateSetup: { tokenIssuer: 'website-owned', tokenSecretRequired: true },
    projectId,
    sourceId,
    html
  };
}
