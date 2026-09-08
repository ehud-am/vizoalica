import { resolve } from 'node:path';
import { actorId, option, result } from '../cli.js';
import { assertOperatorPath, validateProfile, writePrivateJson } from '../config.js';
import type { DeploymentProfile, DeploymentResult } from '../types.js';
import { DeploymentFailure } from '../types.js';
import type { CommandContext } from './shared.js';
import { recordResult } from './shared.js';

export async function configure(
  options: Record<string, string | boolean>,
  context: CommandContext
): Promise<DeploymentResult> {
  const profilePath = assertOperatorPath(
    resolve(context.cwd, option(options, 'profile')!),
    context.repositoryRoot
  );
  const provider = option(options, 'provider');
  if (provider !== 'onecli' && provider !== 'cloudflare-native')
    throw new DeploymentFailure(
      'invalid_profile',
      'Provider must be onecli or cloudflare-native.',
      2,
      'review'
    );
  const profile = validateProfile({
    schemaVersion: 1,
    provider,
    environment: option(options, 'environment'),
    wranglerConfigPath: resolve(context.cwd, option(options, 'wrangler-config')!),
    cloudflare: { accountId: option(options, 'account-id') },
    ...(provider === 'onecli'
      ? {
          onecli: {
            project: option(options, 'onecli-project'),
            agentId: option(options, 'onecli-agent-id'),
            agentIdentifier: option(options, 'onecli-agent'),
            connectionId: option(options, 'onecli-connection')
          }
        }
      : {}),
    auditRetentionDays: Number(option(options, 'audit-retention-days', false) ?? 90)
  }) as DeploymentProfile;
  await writePrivateJson(profilePath, profile, options.replace === true);
  const value = result('configure', {
    details: { provider, environment: profile.environment, actorId: actorId(context.env) }
  });
  await recordResult(profile, profilePath, value, context);
  return value;
}
