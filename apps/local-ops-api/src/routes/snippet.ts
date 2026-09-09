function attribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function integrationSnippet(
  metadata: unknown,
  remoteUrl: string,
  projectId: string,
  sourceId: string
) {
  const item = metadata as { publicSourceKey?: unknown; allowedOrigins?: unknown } | null;
  if (
    !item ||
    typeof item.publicSourceKey !== 'string' ||
    !Array.isArray(item.allowedOrigins) ||
    typeof item.allowedOrigins[0] !== 'string'
  )
    throw new Error('remote_unavailable');
  const origin = new URL(item.allowedOrigins[0]);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== item.allowedOrigins[0])
    throw new Error('remote_unavailable');
  const html = `<script\n  async\n  src="${attribute(origin.origin)}/vizoalica.js"\n  data-endpoint="${attribute(new URL('/v1/events:batch', remoteUrl).href)}"\n  data-source="${attribute(item.publicSourceKey)}"\n  data-project="${attribute(projectId)}"\n  data-token-url="/vizoalica/ingest-token"\n  data-consent="unknown"\n></script>`;
  return {
    publicSourceKey: item.publicSourceKey,
    allowedOrigins: item.allowedOrigins,
    tokenIssuer: 'website-owned',
    projectId,
    sourceId,
    html
  };
}
