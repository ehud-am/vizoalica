import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { access, chmod, lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import type { DeploymentProfile, WranglerTarget } from './types.js';
import { DeploymentFailure } from './types.js';

const MAX_FILE_BYTES = 64 * 1024;
const FORBIDDEN_KEY = /(token|secret|password|authorization|api.?key|email)/i;
const SIMPLE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidProfile();
  return value as Record<string, unknown>;
}

function invalidProfile(message = 'The deployment profile is invalid.'): DeploymentFailure {
  return new DeploymentFailure('invalid_profile', message, 2, 'review');
}

function requiredString(value: unknown, name: string, pattern = SIMPLE): string {
  if (typeof value !== 'string' || !pattern.test(value)) throw invalidProfile(`Invalid ${name}.`);
  return value;
}

function rejectForbiddenKeys(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) throw invalidProfile(`Forbidden credential field: ${key}.`);
    rejectForbiddenKeys(child);
  }
}

export function validateProfile(value: unknown): DeploymentProfile {
  const root = record(value);
  rejectForbiddenKeys(root);
  const allowed = new Set([
    'schemaVersion',
    'provider',
    'environment',
    'wranglerConfigPath',
    'cloudflare',
    'onecli',
    'auditRetentionDays',
    'analyticsDigestPath'
  ]);
  if (Object.keys(root).some((key) => !allowed.has(key)))
    throw invalidProfile('Unknown deployment profile field.');
  if (root.schemaVersion !== 1) throw invalidProfile('Unsupported profile schema version.');
  if (root.provider !== 'onecli' && root.provider !== 'cloudflare-native')
    throw invalidProfile('Invalid credential provider.');
  const cloudflare = record(root.cloudflare);
  if (Object.keys(cloudflare).some((key) => key !== 'accountId'))
    throw invalidProfile('Unknown Cloudflare field.');
  const accountId = requiredString(
    cloudflare.accountId,
    'Cloudflare account ID',
    /^[a-fA-F0-9]{32}$/
  ).toLowerCase();
  const retention = root.auditRetentionDays ?? 90;
  if (!Number.isInteger(retention) || Number(retention) < 90 || Number(retention) > 3650)
    throw invalidProfile('Audit retention must be 90 to 3650 days.');
  const provider: DeploymentProfile['provider'] = root.provider;
  const base = {
    schemaVersion: 1 as const,
    provider,
    environment: requiredString(root.environment, 'environment', /^[a-z0-9][a-z0-9-]{0,62}$/),
    wranglerConfigPath: requiredString(
      root.wranglerConfigPath,
      'Wrangler configuration path',
      /^[^\0\r\n]{1,512}$/
    ),
    cloudflare: { accountId },
    auditRetentionDays: Number(retention)
  };
  const analyticsDigestPath =
    root.analyticsDigestPath === undefined
      ? undefined
      : requiredString(root.analyticsDigestPath, 'analytics digest path', /^[^\0\r\n]{1,1024}$/);
  const withDigestPath = { ...base, ...(analyticsDigestPath ? { analyticsDigestPath } : {}) };
  if (root.provider === 'cloudflare-native') {
    if (root.onecli !== undefined)
      throw invalidProfile('Native profiles cannot contain OneCLI fields.');
    return withDigestPath;
  }
  const onecli = record(root.onecli);
  const onecliAllowed = new Set(['project', 'agentId', 'agentIdentifier', 'connectionId']);
  if (Object.keys(onecli).some((key) => !onecliAllowed.has(key)))
    throw invalidProfile('Unknown OneCLI field.');
  return {
    ...withDigestPath,
    onecli: {
      project: requiredString(onecli.project, 'OneCLI project'),
      agentId: requiredString(onecli.agentId, 'OneCLI agent ID'),
      agentIdentifier: requiredString(onecli.agentIdentifier, 'OneCLI agent identifier'),
      connectionId: requiredString(onecli.connectionId, 'OneCLI connection ID')
    }
  };
}

export async function ensureAnalyticsDigest(path: string): Promise<string> {
  const existing = await lstat(path).catch(() => undefined);
  if (existing) {
    if (!existing.isFile() || existing.isSymbolicLink() || (existing.mode & 0o077) !== 0)
      throw invalidProfile('The analytics digest file is unsafe.');
    const value = (await readFile(path, 'utf8')).trim();
    if (!/^[A-Za-z0-9_-]{43}$/.test(value))
      throw invalidProfile('The analytics digest file is invalid.');
    return value;
  }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700);
  const value = randomBytes(32).toString('base64url');
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(`${value}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(path, 0o600);
  return value;
}

export async function readJsonFile<T>(path: string): Promise<T> {
  const stat = await lstat(path).catch(() => undefined);
  if (!stat?.isFile() || stat.isSymbolicLink() || stat.size > MAX_FILE_BYTES)
    throw invalidProfile('The configuration file is missing or unsafe.');
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    throw invalidProfile('The configuration file is not valid JSON.');
  }
}

export async function loadProfile(path: string): Promise<DeploymentProfile> {
  return validateProfile(await readJsonFile(path));
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function digest(value: unknown): string {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : canonicalJson(value))
    .digest('hex');
}

export function assertOperatorPath(path: string, repositoryRoot: string): string {
  const absolute = resolve(path);
  const rel = relative(resolve(repositoryRoot), absolute);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    throw new DeploymentFailure(
      'unsafe_path',
      'Operator deployment state must be outside the repository.',
      2,
      'review'
    );
  }
  if (absolute === '/' || dirname(absolute) === absolute)
    throw new DeploymentFailure('unsafe_path', 'Unsafe deployment state path.', 2, 'review');
  return absolute;
}

export async function writePrivateJson(
  path: string,
  value: unknown,
  replace = false
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700);
  if (!replace) {
    try {
      await access(path, constants.F_OK);
      throw invalidProfile('The target already exists; use --replace to update it.');
    } catch (error) {
      if (error instanceof DeploymentFailure) throw error;
    }
  }
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  const handle = await open(temp, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temp, path);
    await chmod(path, 0o600);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }
}

function tomlString(text: string, key: string): string {
  const match = text.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"`, 'm'));
  return match?.[1] ?? '';
}

export async function loadWranglerTarget(
  path: string
): Promise<{ target: WranglerTarget; content: string }> {
  const content = await readFile(path, 'utf8').catch(() => {
    throw new DeploymentFailure(
      'invalid_plan',
      'The Wrangler configuration is missing.',
      2,
      'review'
    );
  });
  const target: WranglerTarget = {
    workerName: tomlString(content, 'name'),
    databaseName: tomlString(content, 'database_name'),
    databaseId: tomlString(content, 'database_id'),
    bucketName: tomlString(content, 'bucket_name'),
    demoMode: tomlString(content, 'VIZOALICA_DEMO_MODE') === 'true'
  };
  if (
    !target.workerName ||
    !target.databaseName ||
    !target.databaseId ||
    !target.bucketName ||
    target.databaseId.includes('REPLACE') ||
    target.demoMode
  ) {
    throw new DeploymentFailure(
      'invalid_plan',
      'The Wrangler target is incomplete or unsafe for deployment.',
      2,
      'review'
    );
  }
  return { target, content };
}
