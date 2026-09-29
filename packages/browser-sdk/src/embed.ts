import { DEFAULT_TOKEN_URL } from './defaults.js';
import { init, type VizoalicaClient } from './index.js';
import type { ConsentState } from '@vizoalica/event-contracts';

export interface EmbedConfig {
  endpoint: string;
  sourceKey: string;
  projectId?: string;
  tokenUrl?: string;
  consentState?: ConsentState;
  autoPageView?: boolean;
}

/**
 * Written as `data-token-url="none"` to send unsigned events: a static website with no token
 * endpoint, which the backend accepts only from the website's allowed origins.
 */
const NO_TOKEN = 'none';

/** The events address of the backend that served this script, when it was loaded from one. */
function endpointFromSrc(src: string | undefined): string | undefined {
  if (!src) return undefined;
  try {
    const url = new URL(src);
    return url.pathname === '/vizoalica.js' &&
      (url.protocol === 'https:' || url.protocol === 'http:')
      ? new URL('/v1/events:batch', url).href
      : undefined;
  } catch {
    return undefined;
  }
}

function readBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value !== 'false';
}

export function configFromScript(
  script: Pick<HTMLScriptElement, 'dataset'> & { src?: string }
): EmbedConfig {
  // Loaded from the backend itself (<script src="https://…workers.dev/vizoalica.js">), the endpoint
  // is that backend's, so the tag needs no data-endpoint.
  const endpoint = script.dataset.endpoint ?? endpointFromSrc(script.src);
  const sourceKey = script.dataset.source;
  if (!endpoint) throw new Error('Vizoalica embed requires data-endpoint');
  if (!sourceKey) throw new Error('Vizoalica embed requires data-source');
  const config: EmbedConfig = {
    endpoint,
    sourceKey,
    consentState: (script.dataset.consent as ConsentState | undefined) ?? 'unknown',
    autoPageView: readBoolean(script.dataset.autoPageView, true)
  };
  if (script.dataset.project) config.projectId = script.dataset.project;
  // Signed is the only production mode, so an absent attribute means the conventional path.
  const tokenUrl = script.dataset.tokenUrl || DEFAULT_TOKEN_URL;
  if (tokenUrl !== NO_TOKEN) config.tokenUrl = tokenUrl;
  return config;
}

export function initFromScript(
  script: Pick<HTMLScriptElement, 'dataset'> & { src?: string }
): VizoalicaClient {
  const config = configFromScript(script);
  const initConfig: Parameters<typeof init>[0] = {
    endpoint: config.endpoint,
    sourceKey: config.sourceKey
  };
  if (config.projectId) initConfig.projectId = config.projectId;
  if (config.consentState) initConfig.consentState = config.consentState;
  if (config.autoPageView !== undefined) initConfig.autoPageView = config.autoPageView;
  if (config.tokenUrl) {
    initConfig.tokenProvider = async () => {
      const response = await fetch(config.tokenUrl!, { credentials: 'same-origin' });
      return response.ok ? response.text() : undefined;
    };
  }
  return init(initConfig);
}

export function autoInit(): VizoalicaClient | undefined {
  if (typeof document === 'undefined') return undefined;
  const script = document.currentScript as HTMLScriptElement | null;
  if (!script) return undefined;
  const client = initFromScript(script);
  Object.assign(globalThis, { vizoalica: client });
  return client;
}

autoInit();
