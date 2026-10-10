import { resolve } from 'node:path';
import { option, result } from '../cli.js';
import { assertOperatorPath, loadWranglerTarget } from '../config.js';
import { createPlan, saveArtifact } from '../plan.js';
import type { DeploymentResult } from '../types.js';
import type { CommandContext } from './shared.js';
import { profileFor, recordResult } from './shared.js';

export async function planDeployment(
  options: Record<string, string | boolean>,
  context: CommandContext
): Promise<DeploymentResult> {
  const { profile, profilePath } = await profileFor(options, context);
  const out = assertOperatorPath(
    resolve(context.cwd, option(options, 'out')!),
    context.repositoryRoot
  );
  const { target, content } = await loadWranglerTarget(profile.wranglerConfigPath);
  const plan = createPlan(profile, target, content, context.now());
  await saveArtifact(out, plan, options.replace === true);
  const value = result('plan', {
    planId: plan.planId,
    details: {
      out,
      mutations: plan.operations.filter((item) => item.mutation).map((item) => item.id)
    }
  });
  await recordResult(profile, profilePath, value, context);
  return value;
}
