import type { ConsentState } from '@vizoalica/event-contracts';
import { DEFAULT_TOKEN_URL } from './defaults.js';

export interface DynamicConfigV1 {
  version: 1;
  src: string;
  'data-endpoint': string;
  'data-source': string;
  /** Absent when the backend can tell the project from the source key. */
  'data-project'?: string;
  'data-token-url': string;
  'data-consent': ConsentState;
}

export interface DynamicLoaderState {
  started?: boolean;
  sdkInserted?: boolean;
}

export const DYNAMIC_CONFIG_URL = '/vizoalica/config.json';
export const DYNAMIC_LOADER_STATE = '__vizoalicaLoaderState';

const safeIdentity = /^[A-Za-z0-9_-]{1,128}$/;
const safePublicSource = /^[^\u0000-\u001f]{1,256}$/;
const consentStates = new Set<ConsentState>(['analytics-granted', 'analytics-denied', 'unknown']);

function httpUrl(value: string, baseUrl: URL): URL | undefined {
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      return undefined;
    return url;
  } catch {
    return undefined;
  }
}

export function validateDynamicConfig(
  value: unknown,
  pageUrl: string
): DynamicConfigV1 | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const config = value as Partial<DynamicConfigV1>;
  const baseUrl = new URL(pageUrl);
  const sourceUrl = typeof config.src === 'string' ? httpUrl(config.src, baseUrl) : undefined;
  const endpointUrl =
    typeof config['data-endpoint'] === 'string'
      ? httpUrl(config['data-endpoint'], baseUrl)
      : undefined;
  // Settings that have a conventional default may be left out of the document.
  const tokenUrl = httpUrl(
    typeof config['data-token-url'] === 'string' ? config['data-token-url'] : DEFAULT_TOKEN_URL,
    baseUrl
  );
  const consent = config['data-consent'] ?? 'unknown';
  const hasProject = config['data-project'] !== undefined;
  if (
    config.version !== 1 ||
    !sourceUrl ||
    !endpointUrl ||
    !tokenUrl ||
    tokenUrl.origin !== baseUrl.origin ||
    typeof config['data-source'] !== 'string' ||
    !safePublicSource.test(config['data-source']) ||
    (hasProject &&
      (typeof config['data-project'] !== 'string' || !safeIdentity.test(config['data-project']))) ||
    !consentStates.has(consent as ConsentState)
  )
    return undefined;
  return {
    version: 1,
    src: sourceUrl.href,
    'data-endpoint': endpointUrl.href,
    'data-source': config['data-source'],
    ...(hasProject ? { 'data-project': config['data-project']! } : {}),
    'data-token-url': `${tokenUrl.pathname}${tokenUrl.search}${tokenUrl.hash}`,
    'data-consent': consent as ConsentState
  };
}

export async function initializeDynamicLoader(
  pageWindow: Window & typeof globalThis = window,
  pageDocument: Document = document,
  fetcher: typeof fetch = fetch
): Promise<boolean> {
  const scope = pageWindow as typeof pageWindow & {
    [DYNAMIC_LOADER_STATE]?: DynamicLoaderState;
    vizoalica?: unknown;
  };
  const state = (scope[DYNAMIC_LOADER_STATE] ??= {});
  if (
    state.started ||
    state.sdkInserted ||
    scope.vizoalica ||
    pageDocument.querySelector('script[data-endpoint][data-source]')
  )
    return false;
  state.started = true;
  try {
    const response = await fetcher(DYNAMIC_CONFIG_URL, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { accept: 'application/json' }
    });
    if (!response.ok) return false;
    const config = validateDynamicConfig(await response.json(), pageWindow.location.href);
    if (
      !config ||
      state.sdkInserted ||
      scope.vizoalica ||
      pageDocument.querySelector('script[data-endpoint][data-source]')
    )
      return false;
    state.sdkInserted = true;
    const script = pageDocument.createElement('script');
    script.async = true;
    script.src = config.src;
    script.dataset.endpoint = config['data-endpoint'];
    script.dataset.source = config['data-source'];
    if (config['data-project']) script.dataset.project = config['data-project'];
    script.dataset.tokenUrl = config['data-token-url'];
    script.dataset.consent = config['data-consent'];
    script.addEventListener('error', () => {
      state.sdkInserted = false;
    });
    pageDocument.head.append(script);
    return true;
  } catch {
    return false;
  }
}
