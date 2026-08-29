import type { Env } from './env.js';

export function loadWorkerConfig(env: Env): {
  allowUnsignedDemo: boolean;
  maxRequestBytes: number;
} {
  if (!env.VIZOALICA_DB || !env.VIZOALICA_EVENTS || !env.VIZOALICA_TOKEN_SECRET)
    throw new Error('missing_required_cloudflare_binding');
  const maxRequestBytes = Number(env.VIZOALICA_MAX_REQUEST_BYTES ?? 131072);
  if (!Number.isSafeInteger(maxRequestBytes) || maxRequestBytes < 1)
    throw new Error('invalid_max_request_bytes');
  return { allowUnsignedDemo: env.VIZOALICA_DEMO_MODE === 'true', maxRequestBytes };
}
