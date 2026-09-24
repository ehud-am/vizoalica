import { WorkerClient } from '../remote-client/worker-client.js';
import {
  normalizeRemoteUrl,
  ONECLI_PLACEHOLDER,
  ROLE_HINTS,
  type CloudflareCredential,
  type RoleHint
} from '../environment-store.js';
import {
  backendSummary,
  buildSetupState,
  type SetupDeps,
  type SetupState
} from '../setup/state.js';
import { roleFromBackend } from '../setup/stages.js';

export type EnvironmentsReply = { status: number; body: unknown };

const bad = (field: string): EnvironmentsReply => ({
  status: 400,
  body: { error: 'invalid_request', field }
});

function validCloudflare(value: unknown): CloudflareCredential | undefined | 'invalid' {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null) return 'invalid';
  const mode = (value as { mode?: unknown }).mode;
  if (mode === 'onecli') return { mode: 'onecli' };
  if (mode === 'token') {
    const token = (value as { token?: unknown }).token;
    if (typeof token !== 'string' || !token.trim()) return 'invalid';
    return { mode: 'token', token };
  }
  return 'invalid';
}

/** What the console needs to draw its environment lists, plus whether OneCLI is already set up here. */
function environmentsBody(store: SetupDeps['store']) {
  return {
    active: store.active() ?? null,
    environments: store.list(),
    onecliConfigured: store.onecliSettings() !== undefined
  };
}

/** The OneCLI project, agent, and gateway a first-time OneCLI setup supplies; absent when none were sent. */
function validOnecliSettings(
  value: unknown
): { project: string; agent: string; gateway: string } | undefined | 'invalid' {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null) return 'invalid';
  const { project, agent, gateway } = value as Record<string, unknown>;
  for (const field of [project, agent, gateway])
    if (typeof field !== 'string' || !field.trim() || field.length > 256 || /\s/.test(field.trim()))
      return 'invalid';
  return {
    project: (project as string).trim(),
    agent: (agent as string).trim(),
    gateway: (gateway as string).trim()
  };
}

function errorReply(error: unknown): EnvironmentsReply {
  const code = error instanceof Error ? error.message : 'invalid_request';
  if (code === 'invalid_environment_name') return bad('name');
  if (code === 'environment_name_taken')
    return { status: 409, body: { error: 'environment_name_taken' } };
  if (code === 'environments_not_supported')
    return { status: 409, body: { error: 'environments_not_supported' } };
  if (code === 'environment_not_found')
    return { status: 404, body: { error: 'environment_not_found' } };
  throw error;
}

/** Every environment route (this is local file management, not a Worker resource — see the contract). */
export async function handleEnvironments(
  method: string,
  pathname: string,
  readBody: () => Promise<unknown>,
  deps: SetupDeps
): Promise<EnvironmentsReply | undefined> {
  const store = deps.store;

  if (method === 'GET' && pathname === '/api/environments')
    return { status: 200, body: environmentsBody(store) };

  if (method === 'POST' && pathname === '/api/environments') {
    const body = (await readBody()) as { name?: unknown; cloudflare?: unknown } | undefined;
    if (typeof body?.name !== 'string') return bad('name');
    const cloudflare = validCloudflare(body.cloudflare);
    if (cloudflare === 'invalid') return bad('cloudflare');
    const onecli =
      cloudflare?.mode === 'onecli'
        ? validOnecliSettings((body.cloudflare as { onecli?: unknown }).onecli)
        : undefined;
    if (onecli === 'invalid') return bad('cloudflare');
    try {
      store.create(body.name, cloudflare);
      if (onecli) store.saveOnecliSettings(onecli);
    } catch (error) {
      return errorReply(error);
    }
    return { status: 200, body: environmentsBody(store) };
  }

  const cloudflareMatch = /^\/api\/environments\/([^/]+)\/cloudflare$/.exec(pathname);
  if (method === 'PUT' && cloudflareMatch) {
    const body = (await readBody()) as { cloudflare?: unknown } | undefined;
    const cloudflare = validCloudflare(body?.cloudflare);
    if (cloudflare === undefined || cloudflare === 'invalid') return bad('cloudflare');
    const onecli =
      cloudflare.mode === 'onecli'
        ? validOnecliSettings((body?.cloudflare as { onecli?: unknown }).onecli)
        : undefined;
    if (onecli === 'invalid') return bad('cloudflare');
    try {
      store.setCloudflareCredential(decodeURIComponent(cloudflareMatch[1]!), cloudflare);
      if (onecli) store.saveOnecliSettings(onecli);
    } catch (error) {
      return errorReply(error);
    }
    return { status: 200, body: environmentsBody(store) };
  }

  const selectMatch = /^\/api\/environments\/([^/]+)\/select$/.exec(pathname);
  if (method === 'POST' && selectMatch) {
    try {
      store.select(decodeURIComponent(selectMatch[1]!));
    } catch (error) {
      return errorReply(error);
    }
    return { status: 200, body: await buildSetupState(deps) };
  }

  const connectMatch = /^\/api\/environments\/([^/]+)\/connect$/.exec(pathname);
  if (method === 'POST' && connectMatch) {
    const name = decodeURIComponent(connectMatch[1]!);
    if (!store.list().some((item) => item.name === name))
      return errorReply(new Error('environment_not_found'));
    const body = (await readBody()) as
      { workerUrl?: unknown; credential?: unknown; roleHint?: unknown } | undefined;
    if (typeof body?.workerUrl !== 'string') return bad('workerUrl');
    const credential = body.credential;
    if (
      typeof credential !== 'string' ||
      !credential.trim() ||
      credential.length > 512 ||
      /[\r\n]/.test(credential) ||
      credential === ONECLI_PLACEHOLDER
    )
      return bad('credential');
    if (body.roleHint !== undefined && !ROLE_HINTS.includes(body.roleHint as RoleHint))
      return bad('roleHint');
    let workerUrl: string;
    try {
      workerUrl = normalizeRemoteUrl(body.workerUrl);
    } catch {
      return bad('workerUrl');
    }
    const client = new WorkerClient(workerUrl, credential);
    let principal;
    try {
      principal = await client.whoami();
    } catch (error) {
      return error instanceof Error && error.message === 'unauthorized'
        ? { status: 401, body: { error: 'unauthorized', recovery: 'reauthorize' } }
        : { status: 503, body: { error: 'unreachable', recovery: 'retry_safely' } };
    }
    const info = await client.backendInfo().catch(() => ({
      workerVersion: null,
      schema: { applied: null, expected: null, appliedNames: [], status: 'unknown' as const },
      health: null
    }));
    const { incompatible, backend } = await backendSummary(deps, principal, info);
    if (incompatible)
      return { status: 422, body: { error: 'incompatible', message: backend.message } };
    const actual = roleFromBackend(principal.role);
    store.select(name);
    store.save({
      remoteUrl: workerUrl,
      credential,
      kind: principal.role === 'admin' ? 'admin-secret' : 'access-key',
      roleHint: actual
    });
    const state: SetupState = await buildSetupState(deps);
    const chosen = body.roleHint as RoleHint | undefined;
    const notice =
      chosen !== undefined && chosen !== actual
        ? principal.role === 'admin'
          ? 'administrator_secret_used'
          : 'role_corrected'
        : undefined;
    return { status: 200, body: notice ? { ...state, notice } : state };
  }

  const removeMatch = /^\/api\/environments\/([^/]+)$/.exec(pathname);
  if (method === 'DELETE' && removeMatch) {
    const body = (await readBody()) as { confirm?: unknown } | undefined;
    if (body?.confirm !== true) return bad('confirm');
    try {
      store.remove(decodeURIComponent(removeMatch[1]!));
    } catch (error) {
      return errorReply(error);
    }
    return { status: 200, body: environmentsBody(store) };
  }

  return undefined;
}
