import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { digest, loadWranglerTarget, readJsonFile, writePrivateJson } from './config.js';
import type {
  DeploymentPlan,
  DeploymentProfile,
  PlannedOperation,
  PreflightReceipt,
  WranglerTarget
} from './types.js';
import { DeploymentFailure } from './types.js';

export function operationsFor(target: WranglerTarget): PlannedOperation[] {
  return [
    { id: 'cloudflare.identity.read', resource: 'account', mutation: false, approval: 'none' },
    { id: 'd1.database.read', resource: target.databaseName, mutation: false, approval: 'none' },
    { id: 'r2.bucket.read', resource: target.bucketName, mutation: false, approval: 'none' },
    { id: 'worker.secrets.read', resource: target.workerName, mutation: false, approval: 'none' },
    {
      id: 'worker.analytics_digest_secret.put',
      resource: target.workerName,
      mutation: true,
      approval: 'deployment'
    },
    { id: 'worker.bundle.dry_run', resource: target.workerName, mutation: false, approval: 'none' },
    {
      id: 'd1.migrations.apply',
      resource: target.databaseName,
      mutation: true,
      approval: 'deployment'
    },
    { id: 'worker.deploy', resource: target.workerName, mutation: true, approval: 'deployment' },
    { id: 'worker.health.verify', resource: target.workerName, mutation: false, approval: 'none' }
  ];
}

export function createPlan(
  profile: DeploymentProfile,
  target: WranglerTarget,
  configContent: string,
  now = new Date()
): DeploymentPlan {
  const base = {
    schemaVersion: 1 as const,
    profileDigest: digest(profile),
    wranglerConfigDigest: digest(configContent),
    createdAt: now.toISOString(),
    provider: profile.provider,
    environment: profile.environment,
    accountId: profile.cloudflare.accountId,
    ...(profile.onecli ? { connectionId: profile.onecli.connectionId } : {}),
    operations: operationsFor(target)
  };
  return { ...base, planId: digest(base) };
}

export async function loadPlan(path: string): Promise<DeploymentPlan> {
  const value = await readJsonFile<DeploymentPlan>(path);
  const { planId, ...base } = value;
  if (
    value.schemaVersion !== 1 ||
    !planId ||
    digest(base) !== planId ||
    !Array.isArray(value.operations)
  ) {
    throw new DeploymentFailure('invalid_plan', 'The deployment plan is invalid.', 2, 'review');
  }
  return value;
}

export async function assertCurrentPlan(
  profile: DeploymentProfile,
  plan: DeploymentPlan
): Promise<WranglerTarget> {
  const { target, content } = await loadWranglerTarget(profile.wranglerConfigPath);
  if (
    plan.profileDigest !== digest(profile) ||
    plan.wranglerConfigDigest !== digest(content) ||
    plan.provider !== profile.provider ||
    plan.accountId !== profile.cloudflare.accountId ||
    plan.connectionId !== profile.onecli?.connectionId
  ) {
    throw new DeploymentFailure(
      'plan_changed',
      'Deployment inputs changed after planning.',
      6,
      'review'
    );
  }
  return target;
}

export function createReceipt(
  profile: DeploymentProfile,
  plan: DeploymentPlan,
  actorId: string,
  now = new Date()
): PreflightReceipt {
  const expires = new Date(now.getTime() + 15 * 60 * 1000);
  return {
    schemaVersion: 1,
    receiptId: randomUUID(),
    planId: plan.planId,
    profileDigest: plan.profileDigest,
    wranglerConfigDigest: plan.wranglerConfigDigest,
    provider: profile.provider,
    actorId,
    accountId: profile.cloudflare.accountId,
    ...(profile.onecli ? { connectionId: profile.onecli.connectionId } : {}),
    issuedAt: now.toISOString(),
    expiresAt: expires.toISOString()
  };
}

export function validateReceipt(
  receipt: PreflightReceipt,
  profile: DeploymentProfile,
  plan: DeploymentPlan,
  actorId: string,
  now = new Date()
): void {
  if (new Date(receipt.expiresAt).getTime() <= now.getTime())
    throw new DeploymentFailure('receipt_expired', 'The preflight receipt expired.', 6, 'retry');
  if (
    receipt.schemaVersion !== 1 ||
    receipt.planId !== plan.planId ||
    receipt.profileDigest !== plan.profileDigest ||
    receipt.wranglerConfigDigest !== plan.wranglerConfigDigest ||
    receipt.provider !== profile.provider ||
    receipt.actorId !== actorId ||
    receipt.accountId !== profile.cloudflare.accountId ||
    receipt.connectionId !== profile.onecli?.connectionId
  ) {
    throw new DeploymentFailure(
      'receipt_mismatch',
      'The preflight receipt does not match.',
      6,
      'review'
    );
  }
}

export async function loadReceipt(path: string): Promise<PreflightReceipt> {
  return readJsonFile<PreflightReceipt>(path);
}

export async function saveArtifact(path: string, value: unknown, replace = false): Promise<void> {
  await writePrivateJson(path, value, replace);
}

export async function digestFile(path: string): Promise<string> {
  return digest(await readFile(path, 'utf8'));
}
