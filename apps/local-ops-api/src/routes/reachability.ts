import type { ReachabilityStatus } from '../contracts.js';

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
    const body: unknown = await response.json();
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
