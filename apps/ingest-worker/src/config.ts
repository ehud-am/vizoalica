import type { Env } from './env.js';

const MIN_SECRET_LENGTH = 32;
const MAX_SECRET_LENGTH = 256;

/**
 * The rule the CLI enforces on any secret it accepts (`isValidSecret` in scripts/cli/secrets.ts),
 * enforced here too, so a hand-set weak value can never sign tokens or authorize an administrator.
 */
function isStrongSecret(value: string): boolean {
  return (
    value.length >= MIN_SECRET_LENGTH &&
    value.length <= MAX_SECRET_LENGTH &&
    /^[\x21-\x7e]+$/.test(value)
  );
}

export function loadWorkerConfig(env: Env): {
  allowUnsignedDemo: boolean;
  maxRequestBytes: number;
} {
  if (
    !env.VIZOALICA_DB ||
    !env.VIZOALICA_EVENTS ||
    !env.VIZOALICA_TOKEN_SECRET ||
    !env.VIZOALICA_ADMIN_SECRET ||
    !env.VIZOALICA_ANALYTICS_DIGEST_SECRET
  )
    throw new Error('missing_required_cloudflare_binding');
  // The message names the setting, never its value.
  for (const name of [
    'VIZOALICA_TOKEN_SECRET',
    'VIZOALICA_ADMIN_SECRET',
    'VIZOALICA_ANALYTICS_DIGEST_SECRET'
  ] as const)
    if (!isStrongSecret(env[name])) throw new Error(`weak_secret:${name}`);
  const maxRequestBytes = Number(env.VIZOALICA_MAX_REQUEST_BYTES ?? 131072);
  if (!Number.isSafeInteger(maxRequestBytes) || maxRequestBytes < 1)
    throw new Error('invalid_max_request_bytes');
  return { allowUnsignedDemo: env.VIZOALICA_DEMO_MODE === 'true', maxRequestBytes };
}
