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

/**
 * The reusable workflow that understands the bundled `VIZOALICA_SITE` variable and the defaults.
 * It is the release that ships this change; the starter workflow must point at a tag that exists.
 */
const WORKFLOW_REF = 'ehud-am/vizoalica/.github/workflows/deploy-vizoalica-pages.yml@v0.7.3';

/** The settings that follow a convention, so a website only states them to change them. */
const DEFAULTS = {
  VIZOALICA_SDK_SRC: '/vizoalica.js',
  VIZOALICA_TOKEN_URL: '/vizoalica/ingest-token',
  VIZOALICA_CONSENT: 'unknown'
} as const;

const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

function cloudflareGuidance(
  config: DynamicConfigV1,
  sourceId: string,
  siteOrigins: string[]
): CloudflareGuidance {
  // Everything the workflow needs about this website in one public value; the workflow splits it.
  const site = JSON.stringify({
    endpoint: config['data-endpoint'],
    sourceKey: config['data-source'],
    projectId: config['data-project'],
    sourceId,
    origins: siteOrigins
  });
  const repoVariables: Record<string, string> = { VIZOALICA_SITE: site };
  const expandedRepoVariables: Record<string, string> = {
    VIZOALICA_INGEST_ENDPOINT: config['data-endpoint'],
    VIZOALICA_PUBLIC_SOURCE_KEY: config['data-source'],
    VIZOALICA_PROJECT_ID: config['data-project']!,
    VIZOALICA_SOURCE_ID: sourceId,
    VIZOALICA_SITE_ORIGINS: siteOrigins.join(',')
  };
  const accountSpecificVariables = ['CF_ACCOUNT_ID', 'CF_PAGES_PROJECT'];
  const repoSecretNames = ['CF_API_TOKEN', 'VIZOALICA_TOKEN_SECRET'];
  // A site at the repository root needs no folder; a subfolder needs the one edit the console names.
  const starterWorkflowYaml = [
    'name: Deploy website',
    'on:',
    '  push:',
    '    branches: [main]',
    '',
    'jobs:',
    '  deploy:',
    `    uses: ${WORKFLOW_REF}`,
    '    secrets: inherit'
  ].join('\n');
  const setupCommands = [
    ...Object.entries(repoVariables).map(
      ([name, value]) => `gh variable set ${name} --body ${shellQuote(value)}`
    ),
    ...accountSpecificVariables.map((name) => `gh variable set ${name} --body YOUR_${name}`),
    ...repoSecretNames.map((name) => `gh secret set ${name}`)
  ];
  return {
    workflowRef: WORKFLOW_REF,
    repoVariables,
    expandedRepoVariables,
    defaults: { ...DEFAULTS },
    summary: {
      publicValues: Object.keys(repoVariables).length + accountSpecificVariables.length,
      secrets: repoSecretNames.length
    },
    accountLookupCommand: 'npx wrangler whoami && npx wrangler pages project list',
    accountSpecificVariables,
    repoSecretNames,
    starterWorkflowYaml,
    setupCommands,
    warnings: [
      'The listed repository variables are public browser configuration, not secrets.',
      'CF_API_TOKEN and VIZOALICA_TOKEN_SECRET are secrets: set them with gh secret set (or the GitHub UI), and never paste a real value into this console.',
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
  const endpoint = new URL('/v1/events:batch', remoteUrl).href;
  // The script location is site-relative, so it is right on every hostname that serves the site.
  const html = `<script\n  async\n  src="/vizoalica.js"\n  data-endpoint="${attribute(endpoint)}"\n  data-source="${attribute(item.publicSourceKey)}"\n></script>`;
  const customize = `<script\n  async\n  src="/vizoalica.js"\n  data-endpoint="${attribute(endpoint)}"\n  data-source="${attribute(item.publicSourceKey)}"\n  data-project="${attribute(projectId)}"\n  data-token-url="${DEFAULTS.VIZOALICA_TOKEN_URL}"\n  data-consent="${DEFAULTS.VIZOALICA_CONSENT}"\n></script>`;
  const config: DynamicConfigV1 = {
    version: 1,
    src: DEFAULTS.VIZOALICA_SDK_SRC,
    'data-endpoint': endpoint,
    'data-source': item.publicSourceKey,
    'data-project': projectId,
    'data-token-url': DEFAULTS.VIZOALICA_TOKEN_URL,
    'data-consent': DEFAULTS.VIZOALICA_CONSENT
  };
  if (!isDynamicConfigV1(config)) throw new Error('remote_unavailable');
  const dynamicSnippet = '<script async src="/vizoalica-loader.js"></script>';
  return {
    publicSourceKey: item.publicSourceKey,
    allowedOrigins: item.allowedOrigins,
    modes: [
      {
        id: 'static',
        snippet: html,
        customize,
        defaults: {
          'data-token-url': DEFAULTS.VIZOALICA_TOKEN_URL,
          'data-consent': DEFAULTS.VIZOALICA_CONSENT,
          'data-project': 'taken from the source key'
        }
      },
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
