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

type Probe = { response: Response } | { redirect: string } | undefined;

/**
 * One GET to a site, never following a redirect (an operator-supplied address must not steer this
 * request elsewhere). A redirect is reported with where it points; the answer's body is never read.
 */
async function probe(
  fetchImpl: typeof fetch,
  target: URL,
  headers: Record<string, string> = {}
): Promise<Probe> {
  try {
    const response = await fetchImpl(target, {
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(5_000)
    });
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      try {
        return { redirect: new URL(location, target).origin };
      } catch {
        return undefined;
      }
    }
    return { response };
  } catch {
    return undefined;
  }
}

type OriginResult =
  { kind: 'ok' } | { kind: 'moved'; to: string } | { kind: 'problem'; check: InstallCheck };

/** What is wrong, if anything, with the parts a visitor's browser meets on one address. */
async function checkOrigin(
  base: URL,
  allowed: ReadonlySet<string>,
  fetchImpl: typeof fetch
): Promise<OriginResult> {
  const problem = (code: InstallCheck['code'], nextAction: string): OriginResult => ({
    kind: 'problem',
    check: { code, nextAction }
  });
  const sdk = await probe(fetchImpl, new URL('/vizoalica.js', base));
  if (!sdk)
    return problem(
      'site-unreachable',
      `Could not reach ${base.origin}. Check that the address is live, then check again.`
    );
  if ('redirect' in sdk) {
    // Visitors who land on the other address send events from there, so it must be allowed too.
    if (allowed.has(sdk.redirect)) return { kind: 'moved', to: sdk.redirect };
    return problem(
      'site-redirects',
      `${base.origin} redirects to ${sdk.redirect}, and visitors there would be turned away. Add ${sdk.redirect} to the website’s allowed origins (and to your token endpoint’s list), or stop listing ${base.origin}.`
    );
  }
  if (!sdk.response.ok || isHtml(sdk.response))
    return problem(
      'sdk-file-missing',
      `Save vizoalica.js in the root folder of your website so it is served at ${base.origin}/vizoalica.js, then deploy.`
    );
  // The token endpoint is asked as the site's own page would ask, with its origin.
  const token = await probe(fetchImpl, new URL('/vizoalica/ingest-token', base), {
    origin: base.origin
  });
  if (!token || 'redirect' in token || token.response.status === 404 || isHtml(token.response))
    return problem(
      'token-endpoint-missing',
      `Add the token endpoint so ${base.origin}/vizoalica/ingest-token answers, then deploy. The install page shows the endpoint.`
    );
  if (token.response.status === 403)
    return problem(
      'origin-not-allowed',
      `The token endpoint does not accept ${base.origin}. Make sure its list of site origins includes this exact address, then deploy.`
    );
  if (!token.response.ok)
    return problem(
      'token-endpoint-rejecting',
      `The token endpoint on ${base.origin} is answering with an error. Check that VIZOALICA_TOKEN_SECRET is set on your site and is the same secret as your backend.`
    );
  return { kind: 'ok' };
}

/**
 * Looks at the parts of an install that fail most often, on every allowed address (a site served
 * from both the bare domain and www can be right on one and wrong on the other), and answers with
 * the first thing that is wrong: one code, one next action. A single-page-app host answers unknown
 * paths with its home page, so an HTML answer counts as "not there".
 *
 * The token endpoint is asked for a token, which is discarded unread and lives five minutes: that
 * is the only way to see whether its secret and origin list are right.
 */
export async function checkInstall(
  origins: readonly string[],
  path: 'github' | 'snippet',
  configReachable: boolean,
  fetchImpl: typeof fetch = fetch
): Promise<InstallCheck> {
  const bases: URL[] = [];
  for (const origin of origins.slice(0, 10)) {
    try {
      bases.push(new URL(origin));
    } catch {
      // An origin that is not an address cannot be probed; the service refuses it on save.
    }
  }
  if (bases.length === 0)
    return { code: 'site-unreachable', nextAction: 'Edit the website and enter a valid origin.' };
  const allowed = new Set(bases.map((base) => base.origin));
  const results = await Promise.all(bases.map((base) => checkOrigin(base, allowed, fetchImpl)));
  const failed = results.find((result) => result.kind === 'problem');
  if (failed?.kind === 'problem') return failed.check;
  // Every address only redirects to another allowed one: nothing serves the files.
  if (results.every((result) => result.kind === 'moved'))
    return {
      code: 'site-redirects',
      nextAction:
        'Every allowed address redirects to another allowed address, so none of them serves Vizoalica. List the address that actually serves your site.'
    };
  if (path === 'github' && !configReachable)
    return {
      code: 'config-file-missing',
      nextAction:
        'Finish the deploy: the workflow publishes /vizoalica/config.json, and it is not answering yet. Check the latest run in your repository’s Actions tab.'
    };
  return { code: 'ok', nextAction: 'No action needed.' };
}
