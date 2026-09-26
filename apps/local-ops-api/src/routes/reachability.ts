import type { InstallCheck, ReachabilityStatus } from '../contracts.js';

const MAX_CONFIG_BYTES = 16_384;

// The origin is operator-supplied, so never buffer an unbounded response from it.
async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error('response_too_large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Checks whether a website's own /vizoalica/config.json endpoint is live and
 * returning a valid-shaped configuration. This is the one signal Vizoalica
 * can honestly observe about a customer's CI/CD deployment (it has no
 * credential to the customer's GitHub repo to read Actions run status), and
 * directly answers "is my website's dynamic integration actually working".
 */
export async function checkReachability(
  origin: string,
  fetchImpl = fetch
): Promise<ReachabilityStatus> {
  const checkedAt = new Date().toISOString();
  let target: URL;
  try {
    target = new URL('/vizoalica/config.json', origin);
  } catch {
    return {
      configEndpointReachable: false,
      configEndpointCheckedAt: checkedAt,
      configEndpointError: 'invalid_origin'
    };
  }
  try {
    const response = await fetchImpl(target, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(5_000)
    });
    if (!response.ok) {
      return {
        configEndpointReachable: false,
        configEndpointCheckedAt: checkedAt,
        configEndpointError: `http_${response.status}`
      };
    }
    let body: unknown;
    try {
      body = JSON.parse(await readCapped(response, MAX_CONFIG_BYTES));
    } catch {
      return {
        configEndpointReachable: false,
        configEndpointCheckedAt: checkedAt,
        configEndpointError: 'malformed_response'
      };
    }
    const valid =
      !!body &&
      typeof body === 'object' &&
      (body as Record<string, unknown>).version === 1 &&
      typeof (body as Record<string, unknown>).src === 'string';
    return {
      configEndpointReachable: valid,
      configEndpointCheckedAt: checkedAt,
      configEndpointError: valid ? null : 'malformed_response'
    };
  } catch {
    return {
      configEndpointReachable: false,
      configEndpointCheckedAt: checkedAt,
      configEndpointError: 'network_error'
    };
  }
}

const isHtml = (response: Response) =>
  (response.headers.get('content-type') ?? '').toLowerCase().includes('text/html');

async function probe(
  fetchImpl: typeof fetch,
  target: URL,
  headers: Record<string, string> = {}
): Promise<Response | undefined> {
  try {
    const response = await fetchImpl(target, {
      method: 'GET',
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(5_000)
    });
    // Only the status and type matter; never read more of a site's response than that.
    await response.body?.cancel();
    return response;
  } catch {
    return undefined;
  }
}

/**
 * Looks at the parts of an install that fail most often, in the order a visitor's browser meets
 * them, and answers with the first that is wrong: one code, one next action. A single-page-app host
 * answers unknown paths with its home page, so an HTML answer counts as "not there".
 */
export async function checkInstall(
  origin: string,
  path: 'github' | 'snippet',
  configReachable: boolean,
  fetchImpl: typeof fetch = fetch
): Promise<InstallCheck> {
  let base: URL;
  try {
    base = new URL(origin);
  } catch {
    return { code: 'site-unreachable', nextAction: 'Edit the website and enter a valid origin.' };
  }
  const sdk = await probe(fetchImpl, new URL('/vizoalica.js', base));
  if (!sdk)
    return {
      code: 'site-unreachable',
      nextAction: `Could not reach ${base.origin}. Check the address is live; if it redirects to another address (for example www), allow that address too.`
    };
  if (!sdk.ok || isHtml(sdk))
    return {
      code: 'sdk-file-missing',
      nextAction: `Save vizoalica.js in the root folder of your website so it is served at ${base.origin}/vizoalica.js, then deploy.`
    };
  if (path === 'github' && !configReachable)
    return {
      code: 'config-file-missing',
      nextAction:
        'Finish the deploy: the workflow publishes /vizoalica/config.json, and it is not answering yet. Check the latest run in your repository’s Actions tab.'
    };
  // The token endpoint is asked as the site's own page would ask, with its origin.
  const token = await probe(fetchImpl, new URL('/vizoalica/ingest-token', base), {
    origin: base.origin
  });
  if (!token || token.status === 404 || isHtml(token))
    return {
      code: 'token-endpoint-missing',
      nextAction: `Add the token endpoint so ${base.origin}/vizoalica/ingest-token answers, then deploy. The install page shows the endpoint.`
    };
  if (token.status === 403)
    return {
      code: 'origin-not-allowed',
      nextAction: `The token endpoint does not accept ${base.origin}. Make sure its list of site origins includes this exact address, then deploy.`
    };
  if (!token.ok)
    return {
      code: 'token-endpoint-rejecting',
      nextAction:
        'The token endpoint is answering with an error. Check that VIZOALICA_TOKEN_SECRET is set on your site and is the same secret as your backend.'
    };
  return { code: 'ok', nextAction: 'No action needed.' };
}
