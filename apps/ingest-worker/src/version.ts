import type { Env } from './env.js';

/** The release this Worker was deployed from, or null when it was not told (an older deploy path). */
export function workerVersion(env: Env): string | null {
  const value = env.VIZOALICA_WORKER_VERSION;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
