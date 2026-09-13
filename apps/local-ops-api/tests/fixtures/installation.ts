export const installationMetadata = {
  publicSourceKey: 'public-key',
  allowedOrigins: ['https://site.example'],
  tokenIssuer: 'website-owned' as const
};

export const staticInstallationSnippet = `<script
  async
  src="https://site.example/vizoalica.js"
  data-endpoint="https://analytics.example/v1/events:batch"
  data-source="public-key"
  data-project="project-1"
  data-token-url="/vizoalica/ingest-token"
  data-consent="unknown"
></script>`;
