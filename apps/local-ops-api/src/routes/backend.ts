import { parseSecretKind } from '@vizoalica/ops-core';
import type { EngineDeps } from '../deploy/engine.js';
import { rotateSecret } from '../deploy/engine.js';
import { WorkerClient } from '../remote-client/worker-client.js';
import { jsonInit, workerJson } from './websites.js';

export type BackendReply = { status: number; body: unknown };

const bad = (field: string): BackendReply => ({
  status: 400,
  body: { error: 'invalid_request', field }
});

/** Rotate and purge, for the connected environment's Worker; admin only. */
export async function handleBackendMaintenance(
  method: string,
  pathname: string,
  readBody: () => Promise<unknown>,
  deps: EngineDeps
): Promise<BackendReply | undefined> {
  const connection = deps.environmentStore.current();
  if (!connection) return { status: 409, body: { error: 'backend_not_connected' } };
  if (connection.kind !== 'admin-secret') return { status: 403, body: { error: 'forbidden' } };

  const rotateMatch = /^\/api\/backend\/rotate\/([^/]+)$/.exec(pathname);
  if (method === 'POST' && rotateMatch) {
    const kind = parseSecretKind(rotateMatch[1]);
    if (!kind || kind === 'all') return bad('kind');
    const worker = deps.environmentStore.active();
    if (!worker) return { status: 409, body: { error: 'no_active_environment' } };
    try {
      const value = await rotateSecret(deps, worker, kind);
      return { status: 200, body: { kind, value } };
    } catch (error) {
      const code = error instanceof Error ? error.message : 'rotate_failed';
      return code.startsWith('no_rendered_config')
        ? { status: 409, body: { error: 'no_rendered_config' } }
        : { status: 502, body: { error: 'rotate_failed', message: code } };
    }
  }

  if (method === 'POST' && pathname === '/api/backend/purge-deleted') {
    const body = (await readBody()) as { apply?: unknown } | undefined;
    if (typeof body?.apply !== 'boolean') return bad('apply');
    const client = new WorkerClient(connection.remoteUrl, connection.credential);
    const summary = await workerJson(
      client,
      '/v1/admin/purge-deleted',
      jsonInit('POST', { dryRun: !body.apply })
    );
    return { status: 200, body: summary };
  }

  return undefined;
}
