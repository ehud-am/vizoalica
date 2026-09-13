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

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

const targetInputs = {
  pagesProject: 'YOUR_PAGES_PROJECT',
  environment: 'production',
  productionBranch: 'main',
  siteDirectory: 'YOUR_SITE_DIRECTORY',
  outputDirectory: 'public'
};

function cloudflareGuidance(config: DynamicConfigV1): CloudflareGuidance {
  const publicVariables = {
    VIZOALICA_SDK_SRC: config.src,
    VIZOALICA_INGEST_ENDPOINT: config['data-endpoint'],
    VIZOALICA_PUBLIC_SOURCE_KEY: config['data-source'],
    VIZOALICA_PROJECT_ID: config['data-project'],
    VIZOALICA_TOKEN_URL: config['data-token-url'],
    VIZOALICA_CONSENT: config['data-consent']
  };
  const project = shellQuote(targetInputs.pagesProject);
  const directory = shellQuote(targetInputs.siteDirectory);
  const output = shellQuote(targetInputs.outputDirectory);
  const branch = shellQuote(targetInputs.productionBranch);
  const environment = shellQuote(targetInputs.environment);
  const wranglerFile = shellQuote(`${targetInputs.siteDirectory}/wrangler.toml`);
  const functionFile = shellQuote(
    `${targetInputs.siteDirectory}/functions/vizoalica/config.json.ts`
  );
  const loaderFile = shellQuote(
    `${targetInputs.siteDirectory}/${targetInputs.outputDirectory}/vizoalica-loader.js`
  );
  const routesFile = shellQuote(
    `${targetInputs.siteDirectory}/${targetInputs.outputDirectory}/_routes.json`
  );
  return {
    publicVariables,
    targetInputs,
    steps: [
      {
        id: 'inspect',
        title: 'Inspect the account and exact Pages target',
        commands: [
          'pnpm exec wrangler whoami',
          'pnpm exec wrangler pages project list --json',
          `printf 'Target Pages project: %s\\nTarget environment: %s\\n' ${project} ${environment}`
        ]
      },
      {
        id: 'configure',
        title: 'Merge the public variables and dynamic assets',
        commands: [`sed -n '1,240p' ${wranglerFile}`]
      },
      {
        id: 'review',
        title: 'Review project, environment, branch, directories, and diff',
        commands: [`git diff -- ${wranglerFile} ${functionFile} ${loaderFile} ${routesFile}`]
      },
      {
        id: 'exercise',
        title: 'Exercise the real Pages output locally',
        commands: [`pnpm exec wrangler pages dev ${output} --cwd ${directory}`]
      },
      {
        id: 'deploy',
        title: 'Deploy with the site’s approved hosting mode',
        commands: [
          `pnpm exec wrangler pages deploy ${output} --cwd ${directory} --project-name ${project} --branch ${branch}`,
          `git push origin ${shellQuote(targetInputs.productionBranch)} # Git-connected alternative`
        ]
      },
      {
        id: 'verify',
        title: 'Inspect deployment and verify configuration and collection',
        commands: [
          `pnpm exec wrangler pages deployment list --project-name ${project}`,
          'curl --fail --show-error https://YOUR_SITE.example/vizoalica/config.json',
          `pnpm website:verify -- https://YOUR_SITE.example ${shellQuote(config['data-project'])} YOUR_SOURCE_ID --mode dynamic`
        ]
      }
    ],
    warnings: [
      'These six values are public browser configuration, not secrets.',
      'Merge with the existing site configuration; do not overwrite unrelated settings or routes.',
      'Keep VIZOALICA_TOKEN_SECRET and deployment credentials server-side and out of these commands.',
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
        cloudflare: cloudflareGuidance(config)
      }
    ],
    privateSetup: { tokenIssuer: 'website-owned', tokenSecretRequired: true },
    projectId,
    sourceId,
    html
  };
}
