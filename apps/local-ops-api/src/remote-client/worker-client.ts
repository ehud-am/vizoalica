import { VaultError, type FetchLike } from '../environments/vault.js';

export type Role = 'admin' | 'analyst' | 'owner';
export type Principal = {
  role: Role;
  scope: { projectId: string | null; sourceId: string | null };
  keyLabel: string | null;
  workerVersion: string | null;
  features: { accessKeys: boolean; versions: boolean };
};
export type BackendInfo = {
  workerVersion: string | null;
  schema: {
    applied: number | null;
    expected: number | null;
    appliedNames: string[];
    status: 'current' | 'behind' | 'ahead' | 'unknown';
  };
  health: { database: 'ok' | 'unavailable'; storage: 'ok' | 'unavailable' } | null;
};

const isRole = (value: unknown): value is Role =>
  value === 'admin' || value === 'analyst' || value === 'owner';
const stringOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const numberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) ? value : null;

export class WorkerClient {
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
    /** Requests for a OneCLI-held secret are made through OneCLI instead of directly. */
    private readonly fetchImpl: FetchLike = fetch
  ) {}
  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const signal = AbortSignal.timeout(10_000);
    try {
      return await this.fetchImpl(new URL(path, this.baseUrl), {
        ...init,
        signal,
        redirect: 'error',
        headers: {
          authorization: `Bearer ${this.secret}`,
          accept: 'application/json',
          ...init.headers
        }
      });
    } catch (error) {
      // A OneCLI problem has its own plain explanation; anything else is just "not reachable".
      if (error instanceof VaultError) throw error;
      throw new Error('remote_unavailable');
    }
  }

  /**
   * Who the backend says this credential is. A backend from before access keys has no such route;
   * it only knows the administrator secret, so a working project list means an admin.
   */
  async whoami(): Promise<Principal> {
    const response = await this.request('/v1/admin/whoami');
    if (response.status === 401 || response.status === 403) throw new Error('unauthorized');
    if (response.status === 404) {
      const legacy = await this.request('/v1/admin/projects');
      if (legacy.status === 401 || legacy.status === 403) throw new Error('unauthorized');
      if (!legacy.ok) throw new Error('remote_unavailable');
      return {
        role: 'admin',
        scope: { projectId: null, sourceId: null },
        keyLabel: null,
        workerVersion: null,
        features: { accessKeys: false, versions: false }
      };
    }
    if (!response.ok) throw new Error('remote_unavailable');
    const body = (await response.json().catch(() => undefined)) as
      Record<string, unknown> | undefined;
    if (!body || !isRole(body.role)) throw new Error('remote_unavailable');
    const scope = (body.scope ?? {}) as Record<string, unknown>;
    const features = (body.features ?? {}) as Record<string, unknown>;
    return {
      role: body.role,
      scope: { projectId: stringOrNull(scope.projectId), sourceId: stringOrNull(scope.sourceId) },
      keyLabel: stringOrNull(body.keyLabel),
      workerVersion: stringOrNull(body.workerVersion),
      features: { accessKeys: features.accessKeys === true, versions: features.versions === true }
    };
  }

  /** The Worker and database versions; a backend that predates them yields unknowns. */
  async backendInfo(): Promise<BackendInfo> {
    const unknown: BackendInfo = {
      workerVersion: null,
      schema: { applied: null, expected: null, appliedNames: [], status: 'unknown' },
      health: null
    };
    const response = await this.request('/v1/admin/backend');
    if (response.status === 401 || response.status === 403) throw new Error('unauthorized');
    if (response.status === 404) return unknown;
    if (!response.ok) throw new Error('remote_unavailable');
    const body = (await response.json().catch(() => undefined)) as
      Record<string, unknown> | undefined;
    if (!body) return unknown;
    const schema = (body.schema ?? {}) as Record<string, unknown>;
    const health = body.health as Record<string, unknown> | undefined;
    const status = schema.status;
    return {
      workerVersion: stringOrNull(body.workerVersion),
      schema: {
        applied: numberOrNull(schema.applied),
        expected: numberOrNull(schema.expected),
        appliedNames: Array.isArray(schema.appliedNames)
          ? schema.appliedNames.filter((name): name is string => typeof name === 'string')
          : [],
        status:
          status === 'current' || status === 'behind' || status === 'ahead' ? status : 'unknown'
      },
      health: health
        ? {
            database: health.database === 'ok' ? 'ok' : 'unavailable',
            storage: health.storage === 'ok' ? 'ok' : 'unavailable'
          }
        : null
    };
  }
}
