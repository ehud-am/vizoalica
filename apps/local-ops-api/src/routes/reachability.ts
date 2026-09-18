import type { ReachabilityStatus } from '../contracts.js';

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
