import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import { assertEnvironmentName } from '@vizoalica/ops-core';

export type RoleHint = 'admin' | 'website-owner' | 'analyst';
export type CredentialKind = 'admin-secret' | 'access-key';
export type Connection = {
  remoteUrl: string;
  credential: string;
  kind: CredentialKind;
  /** Only remembers the first-run choice; the backend decides what the credential may do. */
  roleHint?: RoleHint;
};

/** How one environment's deploy and update runs reach Cloudflare (research R25). */
export type CloudflareCredential = { mode: 'token'; token: string } | { mode: 'onecli' };

export type EnvironmentSummary = {
  name: string;
  /** Whether a backend connection is saved; this is local knowledge, not a live health check. */
  hasConnection: boolean;
  mode: 'file' | 'onecli' | undefined;
};

export const ROLE_HINTS: readonly RoleHint[] = ['admin', 'website-owner', 'analyst'];
export const ONECLI_PLACEHOLDER = 'onecli-managed';
const REVOKED_URL = 'https://revoked.invalid';
const KNOWN_CONNECTION_KEYS = new Set([
  'VIZOALICA_REMOTE_URL',
  'VIZOALICA_ADMIN_SECRET',
  'VIZOALICA_READ_KEY',
  'VIZOALICA_ROLE_HINT'
]);

/** The https origin of a Worker; loopback http is allowed for local development. */
export function normalizeRemoteUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('invalid_request');
  }
  const loopbackHttp =
    url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if ((url.protocol !== 'https:' && !loopbackHttp) || url.username || url.password)
    throw new Error('invalid_request');
  return url.origin;
}

function isRoleHint(value: unknown): value is RoleHint {
  return ROLE_HINTS.includes(value as RoleHint);
}

function replaceFile(path: string, values: Record<string, string>): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  // A same-directory temporary file plus rename means a reader never sees a partial file.
  const temporary = join(dirname(path), `.${crypto.randomUUID()}.tmp`);
  writeFileSync(temporary, `${JSON.stringify(values, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  try {
    renameSync(temporary, path);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
  chmodSync(path, 0o600);
}

/**
 * One environment's file: the connection fields an environment file has always had, plus whatever other
 * fields (its name, its Cloudflare credential) are on the same file. Extra fields are read once and
 * carried through on every write, so saving a connection never drops the environment's own identity.
 */
class EnvironmentFile {
  private connection: Connection | undefined;
  private roleHintOnly: RoleHint | undefined;
  private revoked_ = false;
  private extra: Record<string, string> = {};

  private constructor(private readonly path: string | undefined) {}

  static fromFile(path: string, env: NodeJS.ProcessEnv = process.env): EnvironmentFile {
    const file = new EnvironmentFile(path);
    if (!existsSync(path)) return file;
    if ((statSync(path).mode & 0o077) !== 0) throw new Error('config_permissions_must_be_0600');
    let values: Record<string, unknown>;
    try {
      values = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    } catch {
      throw new Error('invalid_connection_file');
    }
    if (!values || typeof values !== 'object' || Array.isArray(values))
      throw new Error('invalid_connection_file');
    for (const [key, value] of Object.entries(values))
      if (!KNOWN_CONNECTION_KEYS.has(key) && typeof value === 'string') file.extra[key] = value;
    const url = values.VIZOALICA_REMOTE_URL;
    const admin = values.VIZOALICA_ADMIN_SECRET;
    const key = values.VIZOALICA_READ_KEY;
    const hint = values.VIZOALICA_ROLE_HINT;
    if (hint !== undefined && !isRoleHint(hint)) throw new Error('invalid_connection_file');
    if (url === REVOKED_URL && admin === '' && key === undefined) {
      file.revoked_ = true;
      return file;
    }
    const hasAdmin = typeof admin === 'string' && admin.trim() !== '';
    const hasKey = typeof key === 'string' && key.trim() !== '';
    // A freshly created environment file has no connection fields at all yet: that is "no connection",
    // not a corrupted file. Only a file with some but not all of what a connection needs is invalid.
    if (url === undefined && admin === undefined && key === undefined) return file;
    if (typeof url !== 'string' || hasAdmin === hasKey) throw new Error('invalid_connection_file');
    let remoteUrl: string;
    try {
      remoteUrl = normalizeRemoteUrl(url);
    } catch {
      throw new Error('invalid_connection_file');
    }
    if (hasAdmin && admin === ONECLI_PLACEHOLDER && env.VIZOALICA_ONECLI_WRAPPED !== '1')
      throw new Error(
        'onecli_placeholder_requires_wrapper: start this configuration with vizoalica console (pnpm vizoalica console in a source checkout)'
      );
    file.connection = {
      remoteUrl,
      credential: (hasAdmin ? admin : key) as string,
      kind: hasAdmin ? 'admin-secret' : 'access-key',
      ...(hint ? { roleHint: hint } : {})
    };
    return file;
  }

  /** A connection held in memory only, for a service started from explicit settings. */
  static fromConnection(connection: Connection, path?: string): EnvironmentFile {
    const file = new EnvironmentFile(path);
    file.connection = connection;
    return file;
  }

  private write(values: Record<string, string>): void {
    if (this.path) replaceFile(this.path, { ...this.extra, ...values });
  }

  current(): Connection | undefined {
    return this.connection;
  }

  get revoked(): boolean {
    return this.revoked_;
  }

  mode(): 'file' | 'onecli' | undefined {
    if (!this.connection) return undefined;
    return this.connection.credential === ONECLI_PLACEHOLDER ? 'onecli' : 'file';
  }

  hint(): RoleHint | undefined {
    return this.connection?.roleHint ?? this.roleHintOnly;
  }

  extraValue(key: string): string | undefined {
    return this.extra[key];
  }

  setExtra(values: Record<string, string | undefined>): void {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete this.extra[key];
      else this.extra[key] = value;
    }
    // Re-persist whatever connection fields are already on disk, merged with the updated extras.
    if (this.connection)
      this.write({
        VIZOALICA_REMOTE_URL: this.connection.remoteUrl,
        ...(this.connection.kind === 'admin-secret'
          ? { VIZOALICA_ADMIN_SECRET: this.connection.credential }
          : { VIZOALICA_READ_KEY: this.connection.credential }),
        ...(this.connection.roleHint ? { VIZOALICA_ROLE_HINT: this.connection.roleHint } : {})
      });
    else if (this.path) replaceFile(this.path, { ...this.extra });
  }

  save(connection: Connection): void {
    this.write({
      VIZOALICA_REMOTE_URL: connection.remoteUrl,
      ...(connection.kind === 'admin-secret'
        ? { VIZOALICA_ADMIN_SECRET: connection.credential }
        : { VIZOALICA_READ_KEY: connection.credential }),
      ...(connection.roleHint ? { VIZOALICA_ROLE_HINT: connection.roleHint } : {})
    });
    this.connection = connection;
    this.revoked_ = false;
  }

  disconnect(): void {
    this.write({ VIZOALICA_REMOTE_URL: REVOKED_URL, VIZOALICA_ADMIN_SECRET: '' });
    this.connection = undefined;
    this.revoked_ = this.path !== undefined;
  }

  setRoleHint(hint: RoleHint): void {
    if (!this.connection) {
      this.roleHintOnly = hint;
      return;
    }
    this.save({ ...this.connection, roleHint: hint });
  }
}

/**
 * The set of backend environments this computer knows about (research R24): a named, file-backed
 * `EnvironmentFile` per environment under `<base>/environments/<name>.json`, plus a pointer file naming
 * which one is active. Every method that used to belong to the single connection store (`current`,
 * `revision`, `revoked`, `mode`, `hint`, `save`, `disconnect`, `setRoleHint`) now operates on the *active*
 * environment, so the rest of the service (the setup state, the deploy engine, every route) needs no
 * change beyond reading from this store instead of the old single-connection one.
 */
export class EnvironmentStore {
  private readonly files = new Map<string, EnvironmentFile>();
  private activeName: string | undefined;
  private revision_ = 0;
  /** A role chosen before any environment exists yet (first run, before naming or connecting one). */
  private pendingHint: RoleHint | undefined;
  /** A pre-0.7.0 single connection file found with no environment created yet; not imported on its own. */
  private legacyConnection: Connection | undefined;

  private constructor(
    private readonly baseDir: string | undefined,
    private readonly env: NodeJS.ProcessEnv
  ) {}

  static fromDirectory(baseDir: string, env: NodeJS.ProcessEnv = process.env): EnvironmentStore {
    const store = new EnvironmentStore(baseDir, env);
    try {
      const pointer = JSON.parse(readFileSync(store.activePointerPath(), 'utf8')) as {
        active?: unknown;
      };
      if (typeof pointer.active === 'string' && existsSync(store.envFilePath(pointer.active)))
        store.activeName = pointer.active;
    } catch {
      // No pointer yet, or it is unreadable: no environment is active.
    }
    // Validate the active environment's file eagerly, the way the single connection file used to, so a
    // caller that treats construction as "fail fast" (the packaged CLI's startup error handling) still
    // gets a plain, synchronous error instead of one surfacing only on the first request.
    if (store.activeName) store.fileFor(store.activeName);
    // No environment yet, but a pre-0.7.0 single connection file is sitting right there: validate it
    // eagerly too (so a damaged or over-permissive one still fails fast with the familiar repair
    // message), but never import it on its own — it becomes the first environment once the admin names
    // it (`importLegacyAs`), since its name is also its resource-name prefix (research R26).
    else if (existsSync(store.legacyFilePath()))
      store.legacyConnection = EnvironmentFile.fromFile(store.legacyFilePath(), env).current();
    try {
      const stored = JSON.parse(readFileSync(store.pendingHintPath(), 'utf8')) as {
        hint?: unknown;
      };
      if (isRoleHint(stored.hint)) store.pendingHint = stored.hint;
    } catch {
      // No pending hint yet, or it is unreadable: nothing remembered before an environment exists.
    }
    return store;
  }

  /** A single, fixed, always-active environment for a service started from explicit settings or env vars. */
  static fromConnection(name: string, connection: Connection): EnvironmentStore {
    const store = new EnvironmentStore(undefined, process.env);
    store.files.set(name, EnvironmentFile.fromConnection(connection));
    store.activeName = name;
    return store;
  }

  private envDir(): string {
    return join(this.baseDir!, 'environments');
  }

  private envFilePath(name: string): string {
    return join(this.envDir(), `${name}.json`);
  }

  private activePointerPath(): string {
    return join(this.baseDir!, 'active-environment.json');
  }

  private pendingHintPath(): string {
    return join(this.baseDir!, 'pending-role-hint.json');
  }

  private legacyFilePath(): string {
    return join(this.baseDir!, 'local-operations.json');
  }

  /** A pre-0.7.0 single connection file is present, valid, and not yet imported as an environment. */
  hasLegacySetup(): boolean {
    return this.legacyConnection !== undefined;
  }

  legacyPreview(): { workerHost: string; mode: 'file' | 'onecli' } | undefined {
    if (!this.legacyConnection) return undefined;
    return {
      workerHost: new URL(this.legacyConnection.remoteUrl).host,
      mode: this.legacyConnection.credential === ONECLI_PLACEHOLDER ? 'onecli' : 'file'
    };
  }

  /** Moves the pre-0.7.0 single connection into a newly named environment; the old file is left as is. */
  importLegacyAs(name: string): void {
    if (!this.legacyConnection) throw new Error('no_legacy_setup');
    this.create(name);
    this.save(this.legacyConnection);
    this.legacyConnection = undefined;
  }

  /** The active environment, auto-creating an unnamed one if none exists yet (a key holder who never
   * picks or deploys an environment still needs somewhere local to save their connection). */
  private ensureActive(): string {
    if (this.activeName) return this.activeName;
    if (!this.baseDir) throw new Error('no_active_environment');
    let candidate = 'env';
    let suffix = 1;
    while (existsSync(this.envFilePath(candidate))) candidate = `env-${suffix++}`;
    this.create(candidate);
    return candidate;
  }

  private fileFor(name: string): EnvironmentFile {
    let file = this.files.get(name);
    if (!file) {
      if (!this.baseDir) throw new Error('environment_not_found');
      file = EnvironmentFile.fromFile(this.envFilePath(name), this.env);
      this.files.set(name, file);
    }
    return file;
  }

  list(): EnvironmentSummary[] {
    if (!this.baseDir) return [...this.files.keys()].map((name) => this.summarize(name));
    if (!existsSync(this.envDir())) return [];
    return readdirSync(this.envDir())
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => entry.slice(0, -'.json'.length))
      .sort()
      .map((name) => this.summarize(name));
  }

  private summarize(name: string): EnvironmentSummary {
    const file = this.fileFor(name);
    return { name, hasConnection: file.current() !== undefined, mode: file.mode() };
  }

  active(): string | undefined {
    return this.activeName;
  }

  /** `cloudflare` is omitted for an environment that will never deploy (an owner or analyst's key
   * auto-creates a local place to save its connection, via `ensureActive`, with no Cloudflare credential). */
  create(name: string, cloudflare?: CloudflareCredential): void {
    try {
      assertEnvironmentName(name);
    } catch (error) {
      throw new Error('invalid_environment_name', { cause: error });
    }
    if (!this.baseDir) throw new Error('environments_not_supported');
    if (existsSync(this.envFilePath(name))) throw new Error('environment_name_taken');
    replaceFile(this.envFilePath(name), {
      VIZOALICA_ENV_NAME: name,
      ...(cloudflare
        ? {
            VIZOALICA_CF_MODE: cloudflare.mode,
            ...(cloudflare.mode === 'token' ? { VIZOALICA_CF_API_TOKEN: cloudflare.token } : {})
          }
        : {})
    });
    this.files.delete(name);
    this.select(name);
    // A role chosen before this environment existed carries into it now that it does.
    if (this.pendingHint) this.fileFor(name).setRoleHint(this.pendingHint);
    this.pendingHint = undefined;
    if (this.baseDir && existsSync(this.pendingHintPath())) unlinkSync(this.pendingHintPath());
  }

  select(name: string): void {
    if (!this.baseDir) {
      if (!this.files.has(name)) throw new Error('environment_not_found');
      this.activeName = name;
      this.revision_ += 1;
      return;
    }
    if (!existsSync(this.envFilePath(name))) throw new Error('environment_not_found');
    replaceFile(this.activePointerPath(), { active: name });
    this.activeName = name;
    this.revision_ += 1;
  }

  remove(name: string): void {
    if (!this.baseDir) throw new Error('environments_not_supported');
    const path = this.envFilePath(name);
    if (!existsSync(path)) throw new Error('environment_not_found');
    unlinkSync(path);
    this.files.delete(name);
    if (this.activeName === name) {
      if (existsSync(this.activePointerPath())) unlinkSync(this.activePointerPath());
      this.activeName = undefined;
    }
    this.revision_ += 1;
  }

  cloudflareCredential(name = this.activeName): CloudflareCredential | undefined {
    if (!name) return undefined;
    const file = this.fileFor(name);
    const mode = file.extraValue('VIZOALICA_CF_MODE');
    if (mode === 'token') {
      const token = file.extraValue('VIZOALICA_CF_API_TOKEN');
      return token !== undefined ? { mode: 'token', token } : undefined;
    }
    if (mode === 'onecli') return { mode: 'onecli' };
    return undefined;
  }

  /** Changes whenever the active environment's connection does, or the active environment itself does. */
  get revision(): number {
    return this.revision_;
  }

  current(): Connection | undefined {
    return this.activeName ? this.fileFor(this.activeName).current() : undefined;
  }

  get revoked(): boolean {
    return this.activeName ? this.fileFor(this.activeName).revoked : false;
  }

  mode(): 'file' | 'onecli' | undefined {
    return this.activeName ? this.fileFor(this.activeName).mode() : undefined;
  }

  hint(): RoleHint | undefined {
    return this.activeName ? this.fileFor(this.activeName).hint() : this.pendingHint;
  }

  save(connection: Connection): void {
    const name = this.ensureActive();
    this.fileFor(name).save(connection);
    this.revision_ += 1;
  }

  disconnect(): void {
    if (!this.activeName) return;
    this.fileFor(this.activeName).disconnect();
    this.revision_ += 1;
  }

  setRoleHint(hint: RoleHint): void {
    if (this.activeName) {
      this.fileFor(this.activeName).setRoleHint(hint);
      this.revision_ += 1;
      return;
    }
    this.pendingHint = hint;
    if (this.baseDir) {
      try {
        replaceFile(this.pendingHintPath(), { hint });
      } catch {
        // Best effort: worst case the hint is only remembered for this process's lifetime.
      }
    }
    this.revision_ += 1;
  }

  /** The machine-wide OneCLI settings (`ops.json`), used both to wrap the admin secret's whole process
   * and, for an OneCLI-mode environment's Cloudflare credential, to wrap each deploy or update run. */
  onecliSettings(): { project: string; agent: string; gateway: string } | undefined {
    if (!this.baseDir) return undefined;
    try {
      const ops = JSON.parse(readFileSync(join(this.baseDir, 'ops.json'), 'utf8')) as {
        onecli?: { project?: unknown; agent?: unknown; gateway?: unknown };
      };
      const { project, agent, gateway } = ops.onecli ?? {};
      return typeof project === 'string' && typeof agent === 'string' && typeof gateway === 'string'
        ? { project, agent, gateway }
        : undefined;
    } catch {
      return undefined;
    }
  }
}
