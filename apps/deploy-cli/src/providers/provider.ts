import type {
  CredentialHealth,
  DeploymentProfile,
  OperationId,
  ProcessExecutor,
  ProcessResult,
  WranglerTarget
} from '../types.js';
import { DeploymentFailure } from '../types.js';

export interface ProviderContext {
  cwd: string;
  target: WranglerTarget;
  executor: ProcessExecutor;
  signal?: AbortSignal;
}

export interface CredentialProvider {
  inspect(profile: DeploymentProfile, context: ProviderContext): Promise<CredentialHealth>;
  run(
    profile: DeploymentProfile,
    operation: OperationId,
    context: ProviderContext
  ): Promise<ProcessResult>;
}

export function wranglerArguments(
  operation: OperationId,
  profile: DeploymentProfile,
  target: WranglerTarget
): string[] {
  const config = ['--config', profile.wranglerConfigPath];
  switch (operation) {
    case 'cloudflare.identity.read':
      return ['whoami'];
    case 'd1.database.read':
      return ['d1', 'info', target.databaseName, ...config];
    case 'r2.bucket.read':
      return ['r2', 'bucket', 'info', target.bucketName, ...config];
    case 'worker.secrets.read':
      return ['secret', 'list', ...config, '--format', 'json'];
    case 'worker.bundle.dry_run':
      return ['deploy', '--dry-run', ...config];
    case 'd1.migrations.apply':
      return ['d1', 'migrations', 'apply', target.databaseName, '--remote', ...config];
    case 'worker.deploy':
      return ['deploy', ...config];
    case 'worker.health.verify':
      throw new DeploymentFailure(
        'invalid_command',
        'Health verification is not a Wrangler operation.',
        2,
        'review'
      );
  }
}

export function failureForProcess(
  result: ProcessResult,
  operation: OperationId
): DeploymentFailure {
  if (result.interrupted)
    return new DeploymentFailure(
      'operation_interrupted',
      'Operation interrupted.',
      7,
      'retry',
      true
    );
  const text = `${result.stdout}\n${result.stderr}`.toLowerCase();
  if (/revoked|expired/.test(text))
    return new DeploymentFailure('credential_revoked', 'Credential unavailable.', 4, 'reauthorize');
  if (/forbidden|permission|unauthori[sz]ed|denied/.test(text))
    return new DeploymentFailure(
      'insufficient_permission',
      'Required capability denied.',
      4,
      'review'
    );
  if (/network|fetch failed|timed? out|unavailable/.test(text))
    return new DeploymentFailure(
      'cloudflare_unavailable',
      'Cloudflare unavailable.',
      3,
      'retry',
      true
    );
  const code =
    operation === 'd1.migrations.apply'
      ? 'migration_failed'
      : operation === 'worker.deploy'
        ? 'deploy_failed'
        : 'provider_unavailable';
  return new DeploymentFailure(
    code,
    'Provider operation failed.',
    code === 'provider_unavailable' ? 3 : 7,
    'retry',
    true
  );
}
