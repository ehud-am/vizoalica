import { readdirSync } from 'node:fs';
import { presetRange } from '../../../ingest-api/src/analytics/range.js';
import { isIncompatible, versionStatus, type ComponentStatus } from '../compat.js';
import type { Connection, ConnectionStore, RoleHint } from '../connection-store.js';
import { analyticsOverview } from '../routes/analytics.js';
import { workerJson } from '../routes/websites.js';
import { WorkerClient, type BackendInfo, type Principal } from '../remote-client/worker-client.js';
import {
  computeStages,
  roleFromBackend,
  viewRole,
  type ConnectionStatus,
  type Stage
} from './stages.js';

export type SetupState = {
  version: string;
  needsFirstRun: boolean;
  connection: {
    status: ConnectionStatus;
    workerHost?: string;
    mode?: 'file' | 'onecli';
    roleHint?: RoleHint;
  };
  principal?: {
    role: Principal['role'];
    scope: Principal['scope'];
    keyLabel: string | null;
    features: Principal['features'];
  };
  backend?: {
    workerVersion: string | null;
    schema: { applied: number | null; expected: number | null };
    worker: ComponentStatus;
    schemaStatus: ComponentStatus;
    message: string;
  };
  stages: Stage[];
  /** Set only on the answer to a connect that used a credential of a different role than chosen. */
  notice?: 'administrator_secret_used' | 'role_corrected';
};

export type SetupDeps = {
  store: ConnectionStore;
  version: string;
  /** The highest database change this console carries, or null when it does not know. */
  expectedSchema: number | null;
  clientFor?: (connection: Connection) => WorkerClient;
  now?: () => Date;
};

/** The highest `NNNN_name.sql` number in a directory of database changes. */
export function expectedSchemaFrom(schemaDir: string | undefined): number | null {
  if (!schemaDir) return null;
  try {
    const numbers = readdirSync(schemaDir)
      .map((name) => /^(\d{4})_.+\.sql$/.exec(name)?.[1])
      .filter((value): value is string => value !== undefined)
      .map(Number);
    return numbers.length ? Math.max(...numbers) : null;
  } catch {
    return null;
  }
}

const MAX_PROJECTS = 20;
const MAX_DATA_CHECKS = 5;

type Discovery = {
  websites: number;
  firstWebsiteId?: string;
  dataArriving: boolean;
};

/** What this credential can see: how many websites, and whether any of them is receiving data. */
async function discover(client: WorkerClient, now: Date): Promise<Discovery> {
  const projects = (await workerJson(client, '/v1/admin/projects')) as Array<{
    id?: unknown;
    status?: unknown;
  }>;
  let websites = 0;
  let firstWebsiteId: string | undefined;
  const withWebsites: string[] = [];
  for (const project of (Array.isArray(projects) ? projects : []).slice(0, MAX_PROJECTS)) {
    if (typeof project.id !== 'string' || project.status === 'deleted') continue;
    const sources = (await workerJson(
      client,
      `/v1/admin/projects/${encodeURIComponent(project.id)}/sources`
    )) as Array<{ id?: unknown; status?: unknown }>;
    const live = (Array.isArray(sources) ? sources : []).filter(
      (source) => typeof source.id === 'string' && source.status !== 'deleted'
    );
    if (!live.length) continue;
    websites += live.length;
    firstWebsiteId ??= live[0]!.id as string;
    withWebsites.push(project.id);
  }
  let dataArriving = false;
  const range = presetRange('7d', now);
  for (const projectId of withWebsites.slice(0, MAX_DATA_CHECKS)) {
    try {
      const overview = await analyticsOverview(
        client,
        projectId,
        undefined,
        range.startUtc,
        range.endUtc
      );
      if ((overview.totals?.pageViews ?? 0) > 0) {
        dataArriving = true;
        break;
      }
    } catch {
      // A report that cannot be produced yet means no data to show, not a broken setup.
    }
  }
  return { websites, ...(firstWebsiteId ? { firstWebsiteId } : {}), dataArriving };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/** Whether a principal's key lets it create a website: not when it is limited to a single website. */
function canCreateWebsites(principal: Principal | undefined): boolean {
  if (!principal) return false;
  return principal.role === 'admin' || principal.scope.sourceId === null;
}

export async function backendSummary(
  deps: Pick<SetupDeps, 'version' | 'expectedSchema'>,
  principal: Principal,
  info: BackendInfo
) {
  const workerVersion = info.workerVersion ?? principal.workerVersion;
  const statuses = versionStatus(
    { consoleVersion: deps.version, expectedSchema: deps.expectedSchema },
    { workerVersion, schemaApplied: info.schema.applied }
  );
  return {
    incompatible: isIncompatible(statuses),
    backend: {
      workerVersion,
      schema: { applied: info.schema.applied, expected: deps.expectedSchema },
      worker: statuses.worker,
      schemaStatus: statuses.schema,
      message: isIncompatible(statuses)
        ? statuses.schema.message
        : statuses.worker.update
          ? statuses.worker.message
          : statuses.schema.message
    }
  };
}

/** The setup state, worked out from the live backend on every call and never stored. */
export async function buildSetupState(deps: SetupDeps): Promise<SetupState> {
  const connection = deps.store.current();
  const hint = deps.store.hint();
  const base = { version: deps.version };
  if (!connection) {
    return {
      ...base,
      needsFirstRun: true,
      connection: { status: 'none', ...(hint ? { roleHint: hint } : {}) },
      stages: computeStages({
        connection: 'none',
        role: viewRole(undefined, hint),
        canCreate: false,
        websites: 0,
        dataArriving: false
      })
    };
  }
  const shared = {
    workerHost: hostOf(connection.remoteUrl),
    mode: deps.store.mode()!,
    ...(connection.roleHint ? { roleHint: connection.roleHint } : {})
  };
  const client = (deps.clientFor ?? ((c) => new WorkerClient(c.remoteUrl, c.credential)))(
    connection
  );
  const fallbackRole = viewRole(undefined, connection.roleHint);
  const withoutBackend = (status: ConnectionStatus, principal?: Principal): SetupState => ({
    ...base,
    needsFirstRun: false,
    connection: { status, ...shared },
    ...(principal
      ? {
          principal: {
            role: principal.role,
            scope: principal.scope,
            keyLabel: principal.keyLabel,
            features: principal.features
          }
        }
      : {}),
    stages: computeStages({
      connection: status,
      role: principal?.role ?? fallbackRole,
      canCreate: canCreateWebsites(principal),
      websites: 0,
      dataArriving: false
    })
  });
  let principal: Principal;
  try {
    principal = await client.whoami();
  } catch (error) {
    return withoutBackend(
      error instanceof Error && error.message === 'unauthorized' ? 'revoked' : 'unreachable'
    );
  }
  let info: BackendInfo;
  try {
    info = await client.backendInfo();
  } catch {
    info = {
      workerVersion: null,
      schema: { applied: null, expected: null, appliedNames: [], status: 'unknown' },
      health: null
    };
  }
  const { backend, incompatible } = await backendSummary(deps, principal, info);
  if (incompatible) return { ...withoutBackend('incompatible', principal), backend };
  let discovery: Discovery;
  try {
    discovery = await discover(client, (deps.now ?? (() => new Date()))());
  } catch (error) {
    return {
      ...withoutBackend(
        error instanceof Error &&
          (error.message === 'access_revoked' || error.message === 'unauthorized')
          ? 'revoked'
          : 'unreachable',
        principal
      ),
      backend
    };
  }
  return {
    ...base,
    needsFirstRun: false,
    connection: { status: 'connected', ...shared },
    principal: {
      role: principal.role,
      scope: principal.scope,
      keyLabel: principal.keyLabel,
      features: principal.features
    },
    backend,
    stages: computeStages({
      connection: 'connected',
      role: principal.role,
      canCreate: canCreateWebsites(principal),
      websites: discovery.websites,
      firstWebsiteId: discovery.firstWebsiteId,
      dataArriving: discovery.dataArriving
    })
  };
}

export { roleFromBackend };
