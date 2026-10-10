interface Env {
  VIZOALICA_SDK_SRC: string;
  VIZOALICA_INGEST_ENDPOINT: string;
  VIZOALICA_PUBLIC_SOURCE_KEY: string;
  VIZOALICA_PROJECT_ID: string;
  VIZOALICA_TOKEN_URL: string;
  VIZOALICA_CONSENT: string;
}

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff'
};

function unavailable(status = 503, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: 'configuration_unavailable' }), {
    status,
    headers: { ...headers, ...extra }
  });
}

function validIdentity(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value) && !value.startsWith('REPLACE_');
}

function validHttpUrl(value: string, origin: string, sameOrigin = false): boolean {
  try {
    const url = new URL(value, origin);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      return false;
    return !sameOrigin || url.origin === origin;
  } catch {
    return false;
  }
}

export async function onRequest({
  request,
  env
}: {
  request: Request;
  env: Env;
}): Promise<Response> {
  if (request.method !== 'GET') return unavailable(405, { allow: 'GET' });
  const origin = new URL(request.url).origin;
  if (
    !validHttpUrl(env.VIZOALICA_SDK_SRC, origin) ||
    !validHttpUrl(env.VIZOALICA_INGEST_ENDPOINT, origin) ||
    !validIdentity(env.VIZOALICA_PUBLIC_SOURCE_KEY) ||
    !validIdentity(env.VIZOALICA_PROJECT_ID) ||
    !validHttpUrl(env.VIZOALICA_TOKEN_URL, origin, true) ||
    !['analytics-granted', 'analytics-denied', 'unknown'].includes(env.VIZOALICA_CONSENT)
  )
    return unavailable();
  return new Response(
    JSON.stringify({
      version: 1,
      src: env.VIZOALICA_SDK_SRC,
      'data-endpoint': env.VIZOALICA_INGEST_ENDPOINT,
      'data-source': env.VIZOALICA_PUBLIC_SOURCE_KEY,
      'data-project': env.VIZOALICA_PROJECT_ID,
      'data-token-url': env.VIZOALICA_TOKEN_URL,
      'data-consent': env.VIZOALICA_CONSENT
    }),
    { headers }
  );
}
