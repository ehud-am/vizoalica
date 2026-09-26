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

/** Written as `data-token-url="none"` to send unsigned events (demos only). */
const NO_TOKEN = 'none';

function readBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value !== 'false';
}

export function configFromScript(script: Pick<HTMLScriptElement, 'dataset'>): EmbedConfig {
  const endpoint = script.dataset.endpoint;
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

export function initFromScript(script: Pick<HTMLScriptElement, 'dataset'>): VizoalicaClient {
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
