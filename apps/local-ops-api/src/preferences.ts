import { chmodSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type ThemePreference = 'light' | 'dark';

export interface PreferencesRecord {
  theme?: ThemePreference;
  /** The environment the console had selected last, so it opens on it next time. */
  environment?: string;
  updatedAt?: string;
}

const ALLOWED_KEYS = new Set(['theme', 'environment', 'updatedAt']);

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark';
}

/** Reads and validates the preferences file. Returns undefined if it does not exist. */
export function readPreferences(path: string): PreferencesRecord | undefined {
  let stats;
  try {
    stats = lstatSync(path);
  } catch {
    return undefined;
  }
  if (stats.isSymbolicLink()) throw new Error('preferences_symlink_refused');
  if ((stats.mode & 0o777 & 0o077) !== 0) throw new Error('preferences_permissions_must_be_0600');
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error('preferences_invalid');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error('preferences_invalid');
  for (const key of Object.keys(parsed as Record<string, unknown>))
    if (!ALLOWED_KEYS.has(key)) throw new Error('preferences_invalid');
  const record = parsed as Record<string, unknown>;
  if (record.theme !== undefined && !isThemePreference(record.theme))
    throw new Error('preferences_invalid');
  if (record.environment !== undefined && typeof record.environment !== 'string')
    throw new Error('preferences_invalid');
  if (record.updatedAt !== undefined && typeof record.updatedAt !== 'string')
    throw new Error('preferences_invalid');
  return record as PreferencesRecord;
}

/** Atomically replaces the preferences file with user-only (0600) permissions. */
export function writePreferences(path: string, record: PreferencesRecord): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = join(dirname(path), `.${crypto.randomUUID()}.tmp`);
  writeFileSync(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  chmodSync(temporaryPath, 0o600);
  renameSync(temporaryPath, path);
}

/** Changes some preferences and keeps the others; an unreadable file is replaced. */
export function updatePreferences(path: string, patch: PreferencesRecord): PreferencesRecord {
  let existing: PreferencesRecord = {};
  try {
    existing = readPreferences(path) ?? {};
  } catch {
    existing = {};
  }
  const next = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  writePreferences(path, next);
  return next;
}
