import { homedir } from 'node:os';
import { join } from 'node:path';

const MIN_SESSION_TTL_MS = 60_000;
const MAX_SESSION_TTL_MS = 24 * 60 * 60_000;

/** A missing value means 30 minutes; anything else must be a whole number within bounds. */
function safeSessionTtl(value: string | undefined): number {
  if (value === undefined || value === '') return 30 * 60_000;
  const ttl = Number(value);
  // NaN would otherwise never compare as expired, leaving a session valid forever.
  if (!Number.isInteger(ttl) || ttl < MIN_SESSION_TTL_MS || ttl > MAX_SESSION_TTL_MS)
    throw new Error('invalid_session_ttl');
  return ttl;
}

function safePort(value: string | undefined): number {
  const port = Number(value ?? 4318);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('invalid_port');
  return port;
}

/** Everything about the service that is not the backend connection. */
export type Settings = {
  port: number;
  /** The extra origin allowed to call the API; the Vite dev server in a checkout. */
  consoleOrigin: string;
  /** Every origin the API accepts: its own address and `consoleOrigin`. */
  allowedOrigins: string[];
  sessionTtlMs: number;
  /** The directory holding `environments.json` and `preferences.json`. */
  homeDir?: string;
};

function safeConsoleOrigin(value: string | undefined): string {
  const consoleOrigin = value ?? 'http://127.0.0.1:5173';
  const origin = new URL(consoleOrigin);
  if (
    (origin.hostname !== '127.0.0.1' && origin.hostname !== 'localhost') ||
    origin.origin !== consoleOrigin
  )
    throw new Error('console_origin_must_be_loopback');
  return consoleOrigin;
}

/** The directory holding `environments.json` and `preferences.json`. */
export function defaultHomeDir(): string {
  return join(homedir(), '.config', 'vizoalica');
}

export function loadSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  const port = safePort(env.VIZOALICA_PORT);
  const consoleOrigin = safeConsoleOrigin(env.VIZOALICA_CONSOLE_ORIGIN);
  return {
    port,
    consoleOrigin,
    allowedOrigins: [...new Set([`http://127.0.0.1:${port}`, consoleOrigin])],
    sessionTtlMs: safeSessionTtl(env.VIZOALICA_SESSION_TTL_MS)
  };
}

/** Resolves the preferences file path in the environments home directory. */
export function resolvePreferencesPath(settings: Pick<Settings, 'homeDir'>): string {
  return join(settings.homeDir ?? defaultHomeDir(), 'preferences.json');
}
