import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';

export type RoleHint = 'admin' | 'website-owner' | 'analyst';
export type CredentialKind = 'admin-secret' | 'access-key';
export type Connection = {
  remoteUrl: string;
  credential: string;
  kind: CredentialKind;
  /** Only remembers the first-run choice; the backend decides what the credential may do. */
  roleHint?: RoleHint;
};

export const ROLE_HINTS: readonly RoleHint[] = ['admin', 'website-owner', 'analyst'];
export const ONECLI_PLACEHOLDER = 'onecli-managed';
const REVOKED_URL = 'https://revoked.invalid';

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

function fileValues(connection: Connection): Record<string, string> {
  return {
    VIZOALICA_REMOTE_URL: connection.remoteUrl,
    ...(connection.kind === 'admin-secret'
      ? { VIZOALICA_ADMIN_SECRET: connection.credential }
      : { VIZOALICA_READ_KEY: connection.credential }),
    ...(connection.roleHint ? { VIZOALICA_ROLE_HINT: connection.roleHint } : {})
  };
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
 * The backend connection the service is using, backed by the same private file the
 * checkout-based commands write. It can be empty: the console then walks the user through first run.
 */
export class ConnectionStore {
  private connection: Connection | undefined;
  private roleHintOnly: RoleHint | undefined;
  private revision_ = 0;
  private revoked_ = false;

  private constructor(private readonly path: string | undefined) {}

  static fromFile(path: string, env: NodeJS.ProcessEnv = process.env): ConnectionStore {
    const store = new ConnectionStore(path);
    if (!existsSync(path)) return store;
    if ((statSync(path).mode & 0o077) !== 0) throw new Error('config_permissions_must_be_0600');
    let values: Record<string, unknown>;
    try {
      values = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    } catch {
      throw new Error('invalid_connection_file');
    }
    if (!values || typeof values !== 'object' || Array.isArray(values))
      throw new Error('invalid_connection_file');
    const url = values.VIZOALICA_REMOTE_URL;
    const admin = values.VIZOALICA_ADMIN_SECRET;
    const key = values.VIZOALICA_READ_KEY;
    const hint = values.VIZOALICA_ROLE_HINT;
    if (hint !== undefined && !isRoleHint(hint)) throw new Error('invalid_connection_file');
    if (url === REVOKED_URL && admin === '' && key === undefined) {
      store.revoked_ = true;
      return store;
    }
    const hasAdmin = typeof admin === 'string' && admin.trim() !== '';
    const hasKey = typeof key === 'string' && key.trim() !== '';
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
    store.connection = {
      remoteUrl,
      credential: (hasAdmin ? admin : key) as string,
      kind: hasAdmin ? 'admin-secret' : 'access-key',
      ...(hint ? { roleHint: hint } : {})
    };
    return store;
  }

  /** A connection held in memory only, for a service started from explicit settings. */
  static fromConnection(connection: Connection, path?: string): ConnectionStore {
    const store = new ConnectionStore(path);
    store.connection = connection;
    return store;
  }

  current(): Connection | undefined {
    return this.connection;
  }

  /** Changes whenever the connection does, so callers can rebuild what depends on it. */
  get revision(): number {
    return this.revision_;
  }

  /** The saved file said the credential was removed on purpose. */
  get revoked(): boolean {
    return this.revoked_;
  }

  /** `onecli` when the credential is the placeholder the wrapper fills in. */
  mode(): 'file' | 'onecli' | undefined {
    if (!this.connection) return undefined;
    return this.connection.credential === ONECLI_PLACEHOLDER ? 'onecli' : 'file';
  }

  hint(): RoleHint | undefined {
    return this.connection?.roleHint ?? this.roleHintOnly;
  }

  save(connection: Connection): void {
    if (this.path) replaceFile(this.path, fileValues(connection));
    this.connection = connection;
    this.revoked_ = false;
    this.revision_ += 1;
  }

  disconnect(): void {
    if (this.path)
      replaceFile(this.path, { VIZOALICA_REMOTE_URL: REVOKED_URL, VIZOALICA_ADMIN_SECRET: '' });
    this.connection = undefined;
    this.revoked_ = this.path !== undefined;
    this.revision_ += 1;
  }

  setRoleHint(hint: RoleHint): void {
    if (!this.connection) {
      this.roleHintOnly = hint;
      return;
    }
    this.save({ ...this.connection, roleHint: hint });
  }
}
