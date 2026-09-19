import { resolve } from 'node:path';
import { appendAudit, auditPathFor, auditRecord } from '../audit.js';
import { actorId } from '../cli.js';
import { loadProfile } from '../config.js';
import { executeProcess } from '../process.js';
import { CloudflareNativeProvider } from '../providers/cloudflare-native.js';
import { OneCliProvider } from '../providers/onecli.js';
import type { CredentialProvider } from '../providers/provider.js';
import type { DeploymentProfile, DeploymentResult, ProcessExecutor } from '../types.js';
import { DeploymentFailure } from '../types.js';

export interface CommandContext {
  cwd: string;
  repositoryRoot: string;
  executor: ProcessExecutor;
  env: NodeJS.ProcessEnv;
  now: () => Date;
  fetch: typeof globalThis.fetch;
}

export const defaultContext: CommandContext = {
  cwd: process.cwd(),
  repositoryRoot: process.cwd(),
  executor: executeProcess,
  env: process.env,
  now: () => new Date(),
  fetch: globalThis.fetch
};

function resolveProfilePath(
  options: Record<string, string | boolean>,
  context: CommandContext
): string {
  const path =
    typeof options.profile === 'string' ? options.profile : context.env.VIZOALICA_DEPLOY_PROFILE;
  if (!path)
    throw new DeploymentFailure(
      'invalid_command',
      'A deployment profile path is required.',
      2,
      'review'
    );
  return resolve(context.cwd, path);
}

export async function profileFor(
  options: Record<string, string | boolean>,
  context: CommandContext
): Promise<{ profile: DeploymentProfile; profilePath: string }> {
  const profilePath = resolveProfilePath(options, context);
  return { profile: await loadProfile(profilePath), profilePath };
}

export function providerFor(profile: DeploymentProfile): CredentialProvider {
  return profile.provider === 'onecli' ? new OneCliProvider() : new CloudflareNativeProvider();
}

export async function recordResult(
  profile: DeploymentProfile,
  profilePath: string,
  value: DeploymentResult,
  context: CommandContext
): Promise<void> {
  await appendAudit(
    auditPathFor(profilePath),
    auditRecord(profile, value, actorId(context.env)),
    profile.auditRetentionDays,
    context.now()
  );
}
