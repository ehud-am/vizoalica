import { resolve } from 'node:path';
import { actorId, option, result } from '../cli.js';
import { assertCurrentPlan, loadPlan, loadReceipt, validateReceipt } from '../plan.js';
import { failureForProcess } from '../providers/provider.js';
import type { DeploymentResult, OperationId } from '../types.js';
import { DeploymentFailure } from '../types.js';
import type { CommandContext } from './shared.js';
import { profileFor, providerFor, recordResult } from './shared.js';

const MUTATIONS: OperationId[] = ['d1.migrations.apply', 'worker.deploy'];

export async function applyDeployment(
  options: Record<string, string | boolean>,
  context: CommandContext
): Promise<DeploymentResult> {
  const { profile, profilePath } = await profileFor(options, context);
  const plan = await loadPlan(resolve(context.cwd, option(options, 'plan')!));
  const approval = option(options, 'approve');
  if (approval !== plan.planId)
    throw new DeploymentFailure('approval_required', 'Exact plan approval required.', 6, 'review');
  const receipt = await loadReceipt(resolve(context.cwd, option(options, 'receipt')!));
  validateReceipt(receipt, profile, plan, actorId(context.env), context.now());
  const target = await assertCurrentPlan(profile, plan);
  const provider = providerFor(profile);
  await provider.inspect(profile, { cwd: context.cwd, target, executor: context.executor });
  const identity = await provider.run(profile, 'cloudflare.identity.read', {
    cwd: context.cwd,
    target,
    executor: context.executor
  });
  if (identity.exitCode !== 0 || identity.interrupted)
    throw failureForProcess(identity, 'cloudflare.identity.read');
  if (!`${identity.stdout}\n${identity.stderr}`.includes(profile.cloudflare.accountId))
    throw new DeploymentFailure(
      'account_mismatch',
      'Cloudflare account mismatch.',
      5,
      'correct_account'
    );
  const completed: OperationId[] = [];
  for (const operation of MUTATIONS) {
    const processResult = await provider.run(profile, operation, {
      cwd: context.cwd,
      target,
      executor: context.executor
    });
    if (processResult.exitCode !== 0 || processResult.interrupted) {
      const failure = failureForProcess(processResult, operation);
      const value = result('apply', {
        ok: false,
        status:
          failure.code === 'operation_interrupted'
            ? 'interrupted'
            : failure.exitCode === 4
              ? 'denied'
              : 'failed',
        planId: plan.planId,
        completedOperations: completed,
        pendingOperations: MUTATIONS.filter((item) => !completed.includes(item)),
        error: {
          code: failure.code,
          message: failure.message,
          ...(failure.remediation ? { remediation: failure.remediation } : {}),
          retrySafe: failure.retrySafe
        }
      });
      await recordResult(profile, profilePath, value, context);
      return value;
    }
    completed.push(operation);
  }
  const value = result('apply', { planId: plan.planId, completedOperations: completed });
  await recordResult(profile, profilePath, value, context);
  return value;
}
