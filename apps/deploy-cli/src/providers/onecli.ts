import { sanitizedCloudflareEnvironment } from '../process.js';
import type { CredentialHealth, DeploymentProfile, OperationId, ProcessResult } from '../types.js';
import { DeploymentFailure } from '../types.js';
import type { CredentialProvider, ProviderContext } from './provider.js';
import { operationTimeoutMs, wranglerArguments } from './provider.js';

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new DeploymentFailure(
      'provider_unavailable',
      'OneCLI returned an invalid response.',
      3,
      'retry',
      true
    );
  }
}

function objects(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(objects);
  if (!value || typeof value !== 'object') return [];
  const item = value as Record<string, unknown>;
  return [item, ...Object.values(item).flatMap(objects)];
}

function stringField(item: Record<string, unknown>, ...names: string[]): string | undefined {
  for (const name of names) if (typeof item[name] === 'string') return item[name] as string;
  return undefined;
}

function hasIdentity(value: unknown, id: string): boolean {
  return objects(value).some((item) => Object.values(item).includes(id));
}

function cloudflareConnectionIds(value: unknown): string[] {
  return [
    ...new Set(
      objects(value)
        .filter((item) =>
          String(item.provider ?? item.type ?? '')
            .toLowerCase()
            .includes('cloudflare')
        )
        .map((item) => stringField(item, 'connectionId', 'connection_id', 'id'))
        .filter((id): id is string => Boolean(id))
    )
  ];
}

function mapInspectionFailure(text: string): DeploymentFailure {
  const value = text.toLowerCase();
  if (/not found|no such|missing/.test(value))
    return new DeploymentFailure('connection_missing', 'Connection unavailable.', 4, 'connect');
  if (/revoked|expired/.test(value))
    return new DeploymentFailure('credential_revoked', 'Credential revoked.', 4, 'reauthorize');
  if (/unauthenticated|login|not authenticated/.test(value))
    return new DeploymentFailure(
      'onecli_unauthenticated',
      'OneCLI authentication unavailable.',
      3,
      'connect'
    );
  if (/denied|forbidden|grant/.test(value))
    return new DeploymentFailure('grant_denied', 'Connection grant denied.', 4, 'attach');
  return new DeploymentFailure('provider_unavailable', 'OneCLI is unavailable.', 3, 'retry', true);
}

export class OneCliProvider implements CredentialProvider {
  async inspect(profile: DeploymentProfile, context: ProviderContext): Promise<CredentialHealth> {
    const reference = profile.onecli;
    if (!reference)
      throw new DeploymentFailure('invalid_profile', 'OneCLI reference missing.', 2, 'review');
    const invoke = async (args: string[]): Promise<unknown> => {
      const result = await context.executor({
        executable: 'onecli',
        args,
        cwd: context.cwd,
        env: sanitizedCloudflareEnvironment(process.env, profile.cloudflare.accountId),
        timeoutMs: 15_000,
        ...(context.signal ? { signal: context.signal } : {})
      });
      if (result.interrupted)
        throw new DeploymentFailure(
          'operation_interrupted',
          'Inspection interrupted.',
          7,
          'retry',
          true
        );
      if (result.exitCode !== 0) throw mapInspectionFailure(`${result.stdout}\n${result.stderr}`);
      return parseJson(result.stdout);
    };
    const help = await invoke(['help']);
    const version =
      objects(help)
        .map((item) => stringField(item, 'version'))
        .find(Boolean) ?? '0.0.0';
    const [major, minor] = version.split('.').map(Number);
    if ((major ?? 0) < 2 || ((major ?? 0) === 2 && (minor ?? 0) < 11))
      throw new DeploymentFailure('onecli_missing', 'OneCLI is too old.', 3, 'review');
    const connections = await invoke(['apps', 'connections', 'list', '--provider', 'cloudflare']);
    const agents = await invoke([
      'agents',
      'list',
      '--with-grants',
      '--project',
      reference.project
    ]);
    const grants = await invoke([
      'agents',
      'grants',
      'list',
      '--id',
      reference.agentId,
      '--project',
      reference.project
    ]);
    const credentials = await invoke([
      'agents',
      'credentials',
      '--id',
      reference.agentId,
      '--project',
      reference.project
    ]);
    const connection = objects(connections).find(
      (item) => stringField(item, 'id', 'connectionId', 'connection_id') === reference.connectionId
    );
    if (
      !connection ||
      !String(connection.provider ?? connection.type ?? '')
        .toLowerCase()
        .includes('cloudflare')
    )
      throw new DeploymentFailure('connection_missing', 'Connection unavailable.', 4, 'connect');
    const agent = objects(agents).find(
      (item) => stringField(item, 'id', 'agentId') === reference.agentId
    );
    if (
      !agent ||
      stringField(agent, 'identifier', 'agentIdentifier', 'slug') !== reference.agentIdentifier
    )
      throw new DeploymentFailure('agent_mismatch', 'Agent identity mismatch.', 5, 'review');
    if (!hasIdentity(grants, reference.connectionId))
      throw new DeploymentFailure('grant_denied', 'Connection is not attached.', 4, 'attach');
    if (!hasIdentity(credentials, reference.connectionId))
      throw new DeploymentFailure(
        'credential_revoked',
        'Credential is not effective.',
        4,
        'reauthorize'
      );
    const eligible = cloudflareConnectionIds(credentials);
    if (eligible.length !== 1 || eligible[0] !== reference.connectionId)
      throw new DeploymentFailure(
        'ambiguous_connection',
        'Cloudflare connection is ambiguous.',
        5,
        'narrow_ambiguity'
      );
    return {
      status: 'ready',
      provider: 'onecli',
      connectionId: reference.connectionId,
      agentId: reference.agentId,
      checkedAt: new Date().toISOString()
    };
  }

  async run(
    profile: DeploymentProfile,
    operation: OperationId,
    context: ProviderContext
  ): Promise<ProcessResult> {
    const reference = profile.onecli;
    if (!reference)
      throw new DeploymentFailure('invalid_profile', 'OneCLI reference missing.', 2, 'review');
    return context.executor({
      executable: 'onecli',
      args: [
        'run',
        '--project',
        reference.project,
        '--agent',
        reference.agentIdentifier,
        '--',
        'pnpm',
        'exec',
        'wrangler',
        ...wranglerArguments(operation, profile, context.target)
      ],
      cwd: context.cwd,
      env: {
        ...sanitizedCloudflareEnvironment(process.env, profile.cloudflare.accountId),
        // Wrangler requires a token before sending requests; OneCLI supplies the real header.
        CLOUDFLARE_API_TOKEN: 'onecli-managed'
      },
      timeoutMs: operationTimeoutMs(operation),
      ...(context.stdin ? { stdin: context.stdin } : {}),
      ...(context.signal ? { signal: context.signal } : {})
    });
  }
}

export { cloudflareConnectionIds, objects };
