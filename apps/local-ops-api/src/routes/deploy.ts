import {
  buildPlan,
  cleanupRun,
  getRun,
  preflight,
  resumeRun,
  startRun,
  type EngineDeps
} from '../deploy/engine.js';
import { defaultNames } from '@vizoalica/ops-core';

export type DeployReply = { status: number; body: unknown };

const bad = (field: string): DeployReply => ({
  status: 400,
  body: { error: 'invalid_request', field }
});

/** True once a connection exists whose credential is not the administrator's (an owner or analyst). */
function isNonAdminConnection(deps: Pick<EngineDeps, 'environmentStore'>): boolean {
  const connection = deps.environmentStore.current();
  return connection !== undefined && connection.kind !== 'admin-secret';
}

function errorReply(error: unknown): DeployReply {
  const code = error instanceof Error ? error.message : 'invalid_request';
  if (code === 'plan_not_found') return { status: 404, body: { error: 'plan_not_found' } };
  if (code === 'run_not_found') return { status: 404, body: { error: 'run_not_found' } };
  if (code === 'run_not_resumable') return { status: 409, body: { error: 'run_not_resumable' } };
  throw error;
}

/** Deploying and maintaining a backend from the console: admin only (research: local file/process
 * management with nothing to forward to, so the local service itself is the authority here). */
export async function handleDeploy(
  method: string,
  pathname: string,
  readBody: () => Promise<unknown>,
  deps: EngineDeps
): Promise<DeployReply | undefined> {
  if (isNonAdminConnection(deps)) return { status: 403, body: { error: 'forbidden' } };
  const environment = deps.environmentStore.active();
  if (!environment) return { status: 409, body: { error: 'no_active_environment' } };

  if (method === 'GET' && pathname === '/api/deploy/preflight') {
    const names = defaultNames(environment);
    return { status: 200, body: { environment, names, ...(await preflight(deps, names)) } };
  }

  if (method === 'POST' && pathname === '/api/deploy/plan') {
    const body = (await readBody()) as
      { accountId?: unknown; accountName?: unknown; names?: unknown } | undefined;
    if (body?.accountId !== undefined && typeof body.accountId !== 'string')
      return bad('accountId');
    if (body?.names !== undefined) {
      const names = body.names as Record<string, unknown>;
      if (
        typeof names?.worker !== 'string' ||
        typeof names?.database !== 'string' ||
        typeof names?.bucket !== 'string'
      )
        return bad('names');
    }
    try {
      const plan = buildPlan(deps, {
        environment,
        ...(typeof body?.accountId === 'string' ? { accountId: body.accountId } : {}),
        ...(typeof body?.accountName === 'string' ? { accountName: body.accountName } : {}),
        ...(body?.names ? { names: body.names as never } : {})
      });
      return { status: 200, body: plan };
    } catch (error) {
      return bad(error instanceof Error ? error.message : 'names');
    }
  }

  if (method === 'POST' && pathname === '/api/deploy/runs') {
    const body = (await readBody()) as { planId?: unknown } | undefined;
    if (typeof body?.planId !== 'string') return bad('planId');
    try {
      const run = startRun(deps, body.planId);
      return { status: 200, body: run };
    } catch (error) {
      return errorReply(error);
    }
  }

  const runMatch = /^\/api\/deploy\/runs\/([^/]+)$/.exec(pathname);
  if (method === 'GET' && runMatch) {
    const run = getRun(deps, runMatch[1]!);
    if (!run) return { status: 404, body: { error: 'run_not_found' } };
    return { status: 200, body: { ...run, canReveal: deps.vault.has(run.id) } };
  }

  const resumeMatch = /^\/api\/deploy\/runs\/([^/]+)\/resume$/.exec(pathname);
  if (method === 'POST' && resumeMatch) {
    try {
      return { status: 200, body: resumeRun(deps, resumeMatch[1]!) };
    } catch (error) {
      return errorReply(error);
    }
  }

  const cleanupMatch = /^\/api\/deploy\/runs\/([^/]+)\/cleanup$/.exec(pathname);
  if (method === 'POST' && cleanupMatch) {
    const body = (await readBody()) as { confirm?: unknown } | undefined;
    if (body?.confirm !== true) return bad('confirm');
    try {
      return { status: 200, body: await cleanupRun(deps, cleanupMatch[1]!) };
    } catch (error) {
      return errorReply(error);
    }
  }

  const revealMatch = /^\/api\/deploy\/runs\/([^/]+)\/reveal$/.exec(pathname);
  if (method === 'POST' && revealMatch) {
    const secrets = deps.vault.reveal(revealMatch[1]!);
    if (!secrets) return { status: 410, body: { error: 'gone' } };
    return { status: 200, body: { secrets } };
  }

  return undefined;
}
