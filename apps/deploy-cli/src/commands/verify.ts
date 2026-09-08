import { option, result } from '../cli.js';
import { loadPlan } from '../plan.js';
import type { DeploymentResult } from '../types.js';
import { DeploymentFailure } from '../types.js';
import type { CommandContext } from './shared.js';
import { profileFor, recordResult } from './shared.js';

async function boundedResponseText(response: Response, limit: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = limit - size;
    chunks.push(value.byteLength > remaining ? value.slice(0, remaining) : value);
    size += Math.min(value.byteLength, remaining);
    if (value.byteLength > remaining) {
      await reader.cancel();
      break;
    }
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function verifyDeployment(
  options: Record<string, string | boolean>,
  context: CommandContext
): Promise<DeploymentResult> {
  const { profile, profilePath } = await profileFor(options, context);
  const workerUrl = option(options, 'worker-url') ?? context.env.VIZOALICA_WORKER_URL;
  let url: URL;
  try {
    url = new URL(workerUrl ?? '');
  } catch {
    throw new DeploymentFailure('invalid_worker_url', 'Invalid Worker URL.', 8, 'review');
  }
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new DeploymentFailure('invalid_worker_url', 'Worker URL must be HTTPS.', 8, 'review');
  url.pathname = `${url.pathname.replace(/\/$/, '')}/healthz`;
  url.search = '';
  url.hash = '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await context.fetch(url, { signal: controller.signal, redirect: 'error' });
  } catch {
    throw new DeploymentFailure('health_check_failed', 'Health request failed.', 8, 'retry', true);
  } finally {
    clearTimeout(timer);
  }
  const text = await boundedResponseText(response, 4096);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new DeploymentFailure(
      'health_check_failed',
      'Invalid health response.',
      8,
      'retry',
      true
    );
  }
  if (
    !response.ok ||
    !body ||
    typeof body !== 'object' ||
    (body as Record<string, unknown>).ok !== true
  )
    throw new DeploymentFailure('health_check_failed', 'Unhealthy Worker.', 8, 'retry', true);
  const planPath = option(options, 'plan', false);
  const planId = planPath ? (await loadPlan(planPath)).planId : undefined;
  const value = result('verify', {
    ...(planId ? { planId } : {}),
    completedOperations: ['worker.health.verify'],
    details: { endpoint: url.toString() }
  });
  await recordResult(profile, profilePath, value, context);
  return value;
}
