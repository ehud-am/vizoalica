import { existsSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export type Config = {
  remoteUrl: string;
  adminSecret: string;
  port: number;
  consoleOrigin: string;
  sessionTtlMs: number;
  /** Absolute path of the local-operations config file this Config was loaded from, if any. */
  configFilePath?: string;
};

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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const remoteUrl = env.VIZOALICA_REMOTE_URL;
  const adminSecret = env.VIZOALICA_ADMIN_SECRET;
  if (!remoteUrl || !adminSecret?.trim()) throw new Error('access_revoked');
  const url = new URL(remoteUrl);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost'))
    throw new Error('remote_url_must_use_https');
  const port = safePort(env.VIZOALICA_PORT);
  const consoleOrigin = env.VIZOALICA_CONSOLE_ORIGIN ?? 'http://127.0.0.1:5173';
  const origin = new URL(consoleOrigin);
  if (
    (origin.hostname !== '127.0.0.1' && origin.hostname !== 'localhost') ||
    origin.origin !== consoleOrigin
  )
    throw new Error('console_origin_must_be_loopback');
  return {
    remoteUrl: url.toString().replace(/\/$/, ''),
    adminSecret,
    port,
    consoleOrigin,
    sessionTtlMs: safeSessionTtl(env.VIZOALICA_SESSION_TTL_MS)
  };
}
export function loadConfigFile(path: string): Config {
  const mode = statSync(path).mode & 0o777;
  if ((mode & 0o077) !== 0) throw new Error('config_permissions_must_be_0600');
  const values = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
  return { ...loadConfig({ ...process.env, ...values }), configFilePath: resolve(path) };
}

/** Resolves the preferences file path beside the configured local-operations file. */
export function resolvePreferencesPath(config: Config): string {
  const base =
    config.configFilePath ?? join(homedir(), '.config', 'vizoalica', 'local-operations.json');
  return join(dirname(base), 'preferences.json');
}

export function writeConfigFile(
  path: string,
  values: Record<string, string>,
  options: { replace?: boolean } = {}
): void {
  if (existsSync(path) && options.replace !== true) throw new Error('config_exists_use_replace');
  const content = `${JSON.stringify(values, null, 2)}\n`;
  if (options.replace === true) {
    // A same-directory temp file + rename is the atomic, portable way to
    // replace an existing file's contents without a window where a reader
    // could see a partially-written file.
    const temporaryPath = join(dirname(path), `.${crypto.randomUUID()}.tmp`);
    writeFileSync(temporaryPath, content, { mode: 0o600, flag: 'wx' });
    try {
      renameSync(temporaryPath, path);
    } catch (error) {
      if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
      throw error;
    }
  } else {
    // O_CREAT|O_EXCL ('wx') is itself the atomic, TOCTOU-safe "fail if it
    // already exists" primitive — no temp file or hardlink dance needed.
    // (An earlier version used create-then-hardlink-into-place here, which
    // is POSIX-specific and fails on filesystems without hardlink support;
    // 'wx' is the same guarantee and works everywhere Node does.)
    writeFileSync(path, content, { mode: 0o600, flag: 'wx' });
  }
}

/** A local revocation is performed by removing the credential from the operator-owned config. */
export function ensureCredential(config: Config): Config {
  if (!config.adminSecret.trim()) throw new Error('access_revoked');
  return config;
}
