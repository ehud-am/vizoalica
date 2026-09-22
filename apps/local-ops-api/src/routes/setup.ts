import { WorkerClient } from '../remote-client/worker-client.js';
import {
  normalizeRemoteUrl,
  ONECLI_PLACEHOLDER,
  ROLE_HINTS,
  type RoleHint
} from '../connection-store.js';
import {
  backendSummary,
  buildSetupState,
  type SetupDeps,
  type SetupState
} from '../setup/state.js';
import { roleFromBackend } from '../setup/stages.js';

export type SetupReply = { status: number; body: unknown };

const bad = (field: string): SetupReply => ({
  status: 400,
  body: { error: 'invalid_request', field }
});

/** The setup routes. They return an answer instead of throwing, so a refusal never ends the session. */
export async function handleSetup(
  method: string,
  pathname: string,
  readBody: () => Promise<unknown>,
  deps: SetupDeps
): Promise<SetupReply | undefined> {
  if (method === 'GET' && pathname === '/api/setup/state')
    return { status: 200, body: await buildSetupState(deps) };

  if (method === 'POST' && pathname === '/api/setup/disconnect') {
    deps.store.disconnect();
    return { status: 200, body: await buildSetupState(deps) };
  }

  if (method === 'POST' && pathname === '/api/setup/role') {
    const body = (await readBody()) as { roleHint?: unknown } | undefined;
    if (!ROLE_HINTS.includes(body?.roleHint as RoleHint)) return bad('roleHint');
    deps.store.setRoleHint(body!.roleHint as RoleHint);
    return { status: 200, body: await buildSetupState(deps) };
  }

  if (method === 'POST' && pathname === '/api/setup/connect') {
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
    const chosen = body.roleHint as RoleHint | undefined;
    deps.store.save({
      remoteUrl: workerUrl,
      credential,
      kind: principal.role === 'admin' ? 'admin-secret' : 'access-key',
      roleHint: actual
    });
    const state: SetupState = await buildSetupState(deps);
    // The backend, not the choice made on the first-run screen, decides what this credential is.
    const notice =
      chosen !== undefined && chosen !== actual
        ? principal.role === 'admin'
          ? 'administrator_secret_used'
          : 'role_corrected'
        : undefined;
    return { status: 200, body: notice ? { ...state, notice } : state };
  }
  return undefined;
}
