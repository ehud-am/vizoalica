import { WorkerClient } from '../remote-client/worker-client.js';
import { workerJson, jsonInit, assertSafeIds } from './websites.js';

export type AccessKeySummary = {
  id: string;
  label: string;
  role: 'analyst' | 'owner';
  scope: { projectId: string | null; sourceId: string | null };
  createdAt: string;
  revokedAt: string | null;
};
export type IssuedAccessKey = AccessKeySummary & { key: string };

export function validateIssueBody(body: unknown): {
  label: string;
  role: 'analyst' | 'owner';
  projectId?: string;
  sourceId?: string;
} {
  const value = body as
    { label?: unknown; role?: unknown; projectId?: unknown; sourceId?: unknown } | undefined;
  const label = typeof value?.label === 'string' ? value.label.trim() : '';
  if (!label || label.length > 64 || /[\u0000-\u001f]/.test(label))
    throw new Error('invalid_request');
  if (value?.role !== 'analyst' && value?.role !== 'owner') throw new Error('invalid_request');
  if (value.projectId !== undefined && typeof value.projectId !== 'string')
    throw new Error('invalid_request');
  if (value.sourceId !== undefined && typeof value.sourceId !== 'string')
    throw new Error('invalid_request');
  return {
    label,
    role: value.role,
    ...(value.projectId !== undefined ? { projectId: value.projectId } : {}),
    ...(value.sourceId !== undefined ? { sourceId: value.sourceId } : {})
  };
}

export const listAccessKeys = (client: WorkerClient) =>
  workerJson(client, '/v1/admin/access-keys') as Promise<AccessKeySummary[]>;

export const issueAccessKey = (client: WorkerClient, body: ReturnType<typeof validateIssueBody>) =>
  workerJson(client, '/v1/admin/access-keys', jsonInit('POST', body)) as Promise<IssuedAccessKey>;

export function revokeAccessKey(client: WorkerClient, id: string) {
  assertSafeIds(id);
  return workerJson(client, `/v1/admin/access-keys/${encodeURIComponent(id)}`, jsonInit('DELETE'));
}

/** Only the name changes; the role and access of a key are fixed when it is created. */
export function validateRenameBody(body: unknown): { label: string } {
  const label =
    typeof (body as { label?: unknown } | undefined)?.label === 'string'
      ? (body as { label: string }).label.trim()
      : '';
  if (!label || label.length > 64 || /[\u0000-\u001f]/.test(label))
    throw new Error('invalid_request');
  return { label };
}

export function renameAccessKey(client: WorkerClient, id: string, body: { label: string }) {
  assertSafeIds(id);
  return workerJson(
    client,
    `/v1/admin/access-keys/${encodeURIComponent(id)}`,
    jsonInit('PATCH', body)
  ) as Promise<AccessKeySummary>;
}

/** A new secret for the same key: same name, role, and access. The old secret stops at once. */
export function rotateAccessKey(client: WorkerClient, id: string) {
  assertSafeIds(id);
  return workerJson(
    client,
    `/v1/admin/access-keys/${encodeURIComponent(id)}/rotate`,
    jsonInit('POST', {})
  ) as Promise<IssuedAccessKey>;
}
