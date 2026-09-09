import type { CredentialHealth, DeploymentProfile, OperationId, ProcessResult } from '../types.js';
import type { CredentialProvider, ProviderContext } from './provider.js';
import { operationTimeoutMs, wranglerArguments } from './provider.js';

export class CloudflareNativeProvider implements CredentialProvider {
  async inspect(_profile: DeploymentProfile): Promise<CredentialHealth> {
    return { status: 'ready', provider: 'cloudflare-native', checkedAt: new Date().toISOString() };
  }

  async run(
    profile: DeploymentProfile,
    operation: OperationId,
    context: ProviderContext
  ): Promise<ProcessResult> {
    return context.executor({
      executable: 'pnpm',
      args: ['exec', 'wrangler', ...wranglerArguments(operation, profile, context.target)],
      cwd: context.cwd,
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: profile.cloudflare.accountId },
      timeoutMs: operationTimeoutMs(operation),
      ...(context.signal ? { signal: context.signal } : {})
    });
  }
}
