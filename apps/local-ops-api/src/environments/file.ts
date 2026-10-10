import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import { assertEnvironmentName } from '@vizoalica/ops-core';

export type Role = 'admin' | 'owner' | 'analyst';
export const ROLES: readonly Role[] = ['admin', 'owner', 'analyst'];

/** Where OneCLI holds a secret. OneCLI's own flag for the workspace is still called `--project`. */
export type OnecliRef = { workspace: string; agent: string; gateway: string };
/** The literal value, or a pointer to a secret OneCLI holds as a local vault. */
export type Secret = string | { onecli: OnecliRef };

export type EnvironmentDef = {
  /** The Worker's https origin: a workers.dev address or a custom domain. */
  url: string;
  role: Role;
  /** The administrator secret (admin) or an access key (owner, analyst). */
  secret: Secret;
  /** Admin only, optional: how Cloudflare is reached for this environment. */
  cloudflare?: { token: Secret };
};

export type Entry = { name: string; def: EnvironmentDef } | { name: string; problem: string };

export type LoadResult =
  | { status: 'ok'; path: string; entries: Entry[] }
  | { status: 'broken'; path: string; reason: string };

export const environmentsPath = (homeDir: string): string => join(homeDir, 'environments.json');

/** The https origin of a Worker; loopback http is allowed for local development. Custom domains are fine. */
export function normalizeRemoteUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('is not a web address');
  }
  const loopbackHttp =
    url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (url.protocol !== 'https:' && !loopbackHttp) throw new Error('must start with https://');
  if (url.username || url.password) throw new Error('must not contain a user name or password');
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash)
    throw new Error(
      'must be just the address, with no path (for example https://analytics.example.com)'
    );
  return url.origin;
}

function parseOnecli(value: unknown, where: string): OnecliRef {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${where}: "onecli" must be an object with workspace, agent, and gateway`);
  const ref = value as Record<string, unknown>;
  for (const key of ['workspace', 'agent', 'gateway'])
    if (typeof ref[key] !== 'string' || !ref[key].trim() || /\s/.test(ref[key].trim()))
      throw new Error(`${where}: onecli.${key} must be a non-empty word`);
  return {
    workspace: (ref.workspace as string).trim(),
    agent: (ref.agent as string).trim(),
    gateway: (ref.gateway as string).trim()
  };
}

function parseSecret(value: unknown, where: string): Secret {
  if (typeof value === 'string') {
    if (!value.trim() || /[\r\n]/.test(value) || value.length > 512)
      throw new Error(`${where} must be a single non-empty line`);
    return value;
  }
  if (typeof value === 'object' && value !== null && 'onecli' in value)
    return { onecli: parseOnecli((value as { onecli: unknown }).onecli, where) };
  throw new Error(
    `${where} must be the secret itself, or { "onecli": { workspace, agent, gateway } }`
  );
}

/** Validates one environment; throws a plain sentence naming what is wrong. */
export function parseEnvironment(name: string, raw: unknown): EnvironmentDef {
  try {
    assertEnvironmentName(name);
  } catch {
    throw new Error(
      'the name must be lowercase letters, digits, and dashes, starting with a letter'
    );
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw new Error('it must be an object');
  const value = raw as Record<string, unknown>;
  if (typeof value.url !== 'string') throw new Error('"url" is missing');
  let url: string;
  try {
    url = normalizeRemoteUrl(value.url);
  } catch (error) {
    throw new Error(`"url" ${(error as Error).message}`);
  }
  if (!ROLES.includes(value.role as Role))
    throw new Error('"role" must be admin, owner, or analyst');
  const role = value.role as Role;
  if (value.secret === undefined) throw new Error('"secret" is missing');
  const def: EnvironmentDef = { url, role, secret: parseSecret(value.secret, '"secret"') };
  if (value.cloudflare !== undefined) {
    if (role !== 'admin') throw new Error('"cloudflare" is only for the admin role');
    const cloudflare = value.cloudflare as Record<string, unknown> | null;
    if (typeof cloudflare !== 'object' || cloudflare === null || cloudflare.token === undefined)
      throw new Error('"cloudflare" must be { "token": … }');
    def.cloudflare = { token: parseSecret(cloudflare.token, '"cloudflare.token"') };
  }
  return def;
}

/** Reads the file. A missing file is simply "no environments"; a damaged one is `broken`, with the reason. */
export function readEnvironments(path: string): LoadResult {
  let stats;
  try {
    stats = lstatSync(path);
  } catch {
    return { status: 'ok', path, entries: [] };
  }
  if (stats.isSymbolicLink())
    return {
      status: 'broken',
      path,
      reason: 'The file is a symbolic link, which is not followed.'
    };
  if ((stats.mode & 0o077) !== 0)
    return {
      status: 'broken',
      path,
      reason: `The file can be read by other users, so it was not used. Fix it with: chmod 600 ${path}`
    };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { status: 'broken', path, reason: 'The file is not valid JSON.' };
  }
  const root = parsed as { version?: unknown; environments?: unknown } | null;
  if (typeof root !== 'object' || root === null || Array.isArray(root))
    return { status: 'broken', path, reason: 'The file must contain a JSON object.' };
  if (root.version !== undefined && root.version !== 1)
    return {
      status: 'broken',
      path,
      reason: `Unknown file version ${JSON.stringify(root.version)}.`
    };
  if (root.environments === undefined) return { status: 'ok', path, entries: [] };
  if (
    typeof root.environments !== 'object' ||
    root.environments === null ||
    Array.isArray(root.environments)
  )
    return { status: 'broken', path, reason: '"environments" must be an object keyed by name.' };
  const entries: Entry[] = Object.entries(root.environments as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, raw]) => {
      try {
        return { name, def: parseEnvironment(name, raw) };
      } catch (error) {
        return { name, problem: (error as Error).message };
      }
    });
  return { status: 'ok', path, entries };
}

/** Replaces the whole file atomically with owner-only permissions. Used by `vizoalica env`, never by the service. */
export function writeEnvironments(
  path: string,
  environments: Record<string, EnvironmentDef>
): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = join(dirname(path), `.${crypto.randomUUID()}.tmp`);
  const body = { version: 1, environments };
  writeFileSync(temporary, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  try {
    renameSync(temporary, path);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
  chmodSync(path, 0o600);
}

/** The definitions that parsed. A caller that rewrites the file must first refuse when an entry has a problem. */
export function definitionsOf(result: LoadResult): Record<string, EnvironmentDef> {
  if (result.status !== 'ok') return {};
  const map: Record<string, EnvironmentDef> = {};
  for (const entry of result.entries) if ('def' in entry) map[entry.name] = entry.def;
  return map;
}

/** Saving rewrites the whole file, so it must not silently drop an entry that has a problem. */
export function rewriteBlocker(
  loaded: Extract<LoadResult, { status: 'ok' }>,
  except: string
): string | undefined {
  const bad = loaded.entries.find((entry) => 'problem' in entry && entry.name !== except);
  return bad && 'problem' in bad
    ? `The entry "${bad.name}" is not valid (${bad.problem}), and saving would drop it.\nFix or remove it in ${loaded.path} first.\n`
    : undefined;
}

/** Adds one new environment to the file. Throws a plain sentence when it cannot be done safely. */
export function addEnvironment(path: string, name: string, def: EnvironmentDef): void {
  const loaded = readEnvironments(path);
  if (loaded.status === 'broken')
    throw new Error(`The environments file cannot be used (${path}): ${loaded.reason}`);
  if (loaded.entries.some((entry) => entry.name === name))
    throw new Error(`"${name}" already exists in ${path}.`);
  const blocked = rewriteBlocker(loaded, name);
  if (blocked) throw new Error(blocked.trim());
  writeEnvironments(path, { ...definitionsOf(loaded), [name]: def });
}
