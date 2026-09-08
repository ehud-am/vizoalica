import { randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AuditRecord, DeploymentProfile, DeploymentResult } from './types.js';

export function auditPathFor(profilePath: string): string {
  return `${profilePath}.deployment-audit.ndjson`;
}

export function auditRecord(
  profile: DeploymentProfile,
  result: DeploymentResult,
  actorId: string
): AuditRecord {
  const action: AuditRecord['action'] =
    result.command === 'check'
      ? 'preflight'
      : result.status === 'denied'
        ? 'deny'
        : result.status === 'interrupted'
          ? 'interrupt'
          : result.command === 'status'
            ? 'plan'
            : result.command;
  return {
    eventId: randomUUID(),
    occurredAt: result.occurredAt,
    actorId,
    provider: profile.provider,
    environment: profile.environment,
    accountId: profile.cloudflare.accountId,
    ...(profile.onecli ? { connectionId: profile.onecli.connectionId } : {}),
    ...(result.planId ? { planId: result.planId } : {}),
    action,
    outcome: result.status,
    ...(result.error ? { errorCode: result.error.code } : {}),
    ...(result.completedOperations.length
      ? { completedOperations: result.completedOperations }
      : {}),
    ...(result.pendingOperations.length ? { pendingOperations: result.pendingOperations } : {})
  };
}

export async function readAudit(path: string): Promise<AuditRecord[]> {
  const text = await readFile(path, 'utf8').catch(() => '');
  return text
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as AuditRecord];
      } catch {
        return [];
      }
    });
}

export async function appendAudit(
  path: string,
  record: AuditRecord,
  retentionDays: number,
  now = new Date()
): Promise<void> {
  const cutoff = now.getTime() - retentionDays * 86_400_000;
  const records = (await readAudit(path)).filter(
    (item) => new Date(item.occurredAt).getTime() >= cutoff
  );
  records.push(record);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${process.pid}.tmp`;
  const handle = await open(temp, 'w', 0o600);
  try {
    await handle.writeFile(`${records.map((item) => JSON.stringify(item)).join('\n')}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temp, path);
  await chmod(path, 0o600);
}
