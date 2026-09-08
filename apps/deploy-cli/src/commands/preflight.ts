import { resolve } from 'node:path';
import { actorId, option, result } from '../cli.js';
import { assertOperatorPath } from '../config.js';
import { assertCurrentPlan, createReceipt, loadPlan, saveArtifact } from '../plan.js';
import { failureForProcess } from '../providers/provider.js';
import type { DeploymentResult, OperationId } from '../types.js';
import { DeploymentFailure } from '../types.js';
import type { CommandContext } from './shared.js';
import { profileFor, providerFor, recordResult } from './shared.js';

const CHECKS: OperationId[] = [
  'cloudflare.identity.read',
  'd1.database.read',
  'r2.bucket.read',
  'worker.secrets.read',
  'worker.bundle.dry_run'
];

export async function preflight(
  options: Record<string, string | boolean>,
  context: CommandContext
): Promise<DeploymentResult> {
  const { profile, profilePath } = await profileFor(options, context);
  const plan = await loadPlan(resolve(context.cwd, option(options, 'plan')!));
  const target = await assertCurrentPlan(profile, plan);
  const provider = providerFor(profile);
  await provider.inspect(profile, { cwd: context.cwd, target, executor: context.executor });
  const completed: OperationId[] = [];
  for (const operation of CHECKS) {
    const processResult = await provider.run(profile, operation, {
      cwd: context.cwd,
      target,
      executor: context.executor
    });
    if (processResult.exitCode !== 0 || processResult.interrupted)
      throw failureForProcess(processResult, operation);
    if (
      operation === 'cloudflare.identity.read' &&
      !`${processResult.stdout}\n${processResult.stderr}`.includes(profile.cloudflare.accountId)
    ) {
      throw new DeploymentFailure(
        'account_mismatch',
        'Cloudflare account mismatch.',
        5,
        'correct_account'
      );
    }
    if (
      operation === 'worker.secrets.read' &&
      (!processResult.stdout.includes('VIZOALICA_TOKEN_SECRET') ||
        !processResult.stdout.includes('VIZOALICA_ADMIN_SECRET'))
    ) {
      throw new DeploymentFailure(
        'insufficient_permission',
        'Required Worker secrets are unavailable.',
        4,
        'review'
      );
    }
    completed.push(operation);
  }
  const receiptPath = assertOperatorPath(
    resolve(context.cwd, option(options, 'receipt')!),
    context.repositoryRoot
  );
  const receipt = createReceipt(profile, plan, actorId(context.env), context.now());
  await saveArtifact(receiptPath, receipt, options.replace === true);
  const value = result('check', {
    planId: plan.planId,
    completedOperations: completed,
    details: { receipt: receiptPath, expiresAt: receipt.expiresAt }
  });
  await recordResult(profile, profilePath, value, context);
  return value;
}
