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

export type SetupDetails = {
  workerUrl: string;
  projectId: string;
  sourceId: string;
  publicSourceKey: string;
  allowedOrigins: string[];
  readKey: string;
  guidance: string;
};

/** Issues a key limited to one website and packages everything a website owner needs to connect. */
export async function shareWebsite(
  client: WorkerClient,
  workerUrl: string,
  projectId: string,
  sourceId: string,
  role: 'owner' | 'analyst'
): Promise<SetupDetails> {
  assertSafeIds(projectId, sourceId);
  const source = (await workerJson(
    client,
    `/v1/admin/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}/snippet`
  )) as { publicSourceKey: string; allowedOrigins: string[] };
  const issued = (await issueAccessKey(client, {
    label: `Website setup: ${sourceId}`,
    role,
    projectId,
    sourceId
  })) as IssuedAccessKey;
  return {
    workerUrl,
    projectId,
    sourceId,
    publicSourceKey: source.publicSourceKey,
    allowedOrigins: source.allowedOrigins,
    readKey: issued.key,
    guidance:
      'Paste these details into the console when you first connect, or open the console and enter the access key and backend address by hand. Keep this file private.'
  };
}
