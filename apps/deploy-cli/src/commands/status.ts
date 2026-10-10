import { auditPathFor, readAudit } from '../audit.js';
import { option, result } from '../cli.js';
import type { DeploymentResult } from '../types.js';
import type { CommandContext } from './shared.js';
import { profileFor } from './shared.js';

export async function deploymentStatus(
  options: Record<string, string | boolean>,
  context: CommandContext
): Promise<DeploymentResult> {
  const { profilePath } = await profileFor(options, context);
  const requestedPlan = option(options, 'plan-id', false);
  const records = (await readAudit(auditPathFor(profilePath))).filter(
    (item) => !requestedPlan || item.planId === requestedPlan
  );
  const latest = records.at(-1);
  return result('status', {
    ...(latest?.planId ? { planId: latest.planId } : {}),
    ...(latest?.completedOperations ? { completedOperations: latest.completedOperations } : {}),
    ...(latest?.pendingOperations ? { pendingOperations: latest.pendingOperations } : {}),
    details: latest
      ? { outcome: latest.outcome, action: latest.action, occurredAt: latest.occurredAt }
      : { outcome: 'unknown' }
  });
}
