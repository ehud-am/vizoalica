import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';
import type { CommandContext } from '../src/commands/shared.js';
import type {
  DeploymentProfile,
  ProcessExecutor,
  ProcessRequest,
  ProcessResult,
  WranglerTarget
} from '../src/types.js';

export const accountId = '0123456789abcdef0123456789abcdef';

export const onecliProfile: DeploymentProfile = {
  schemaVersion: 1,
  provider: 'onecli',
  environment: 'staging',
  wranglerConfigPath: '/tmp/wrangler.toml',
  cloudflare: { accountId },
  onecli: {
    project: 'vizoalica',
    agentId: 'agent-1',
    agentIdentifier: 'deploy-agent',
    connectionId: 'connection-1'
  },
  auditRetentionDays: 90,
  analyticsDigestPath: '/tmp/vizoalica.analytics-digest'
};

export const nativeProfile: DeploymentProfile = {
  ...onecliProfile,
  provider: 'cloudflare-native',
  onecli: undefined
};

export const target: WranglerTarget = {
  workerName: 'vizoalica',
  databaseName: 'vizoalica-config',
  databaseId: accountId,
  bucketName: 'vizoalica-events',
  demoMode: false
};

export const wranglerToml = `name = "vizoalica"
database_name = "vizoalica-config"
database_id = "${accountId}"
bucket_name = "vizoalica-events"
VIZOALICA_DEMO_MODE = "false"
`;

export function ok(stdout = ''): ProcessResult {
  return { exitCode: 0, stdout, stderr: '', interrupted: false };
}

export function onecliExecutor(
  overrides: Partial<Record<string, ProcessResult>> = {}
): ProcessExecutor {
  return vi.fn(async (request: ProcessRequest) => {
    const key = request.args.join(' ');
    for (const [pattern, value] of Object.entries(overrides))
      if (key.includes(pattern)) return value;
    if (key === 'help') return ok(JSON.stringify({ version: '2.11.0' }));
    if (key.includes('connections list'))
      return ok(JSON.stringify([{ id: 'connection-1', provider: 'cloudflare' }]));
    if (key.includes('agents list'))
      return ok(JSON.stringify([{ id: 'agent-1', identifier: 'deploy-agent' }]));
    if (key.includes('grants list')) return ok(JSON.stringify([{ connectionId: 'connection-1' }]));
    if (key.includes('agents credentials'))
      return ok(JSON.stringify([{ connectionId: 'connection-1', provider: 'cloudflare' }]));
    if (key.includes('whoami')) return ok(`account ${accountId}`);
    if (key.includes('d1 execute')) return ok(JSON.stringify([{ results: [], success: true }]));
    if (key.includes('secret list'))
      return ok(
        JSON.stringify([{ name: 'VIZOALICA_TOKEN_SECRET' }, { name: 'VIZOALICA_ADMIN_SECRET' }])
      );
    return ok('ok');
  });
}

export async function temporaryDeployment(provider: 'onecli' | 'cloudflare-native' = 'onecli') {
  const directory = await mkdtemp(join(tmpdir(), 'vizoalica-deploy-'));
  const configPath = join(directory, 'wrangler.toml');
  const profilePath = join(directory, 'profile.json');
  await writeFile(configPath, wranglerToml);
  const profile = {
    ...(provider === 'onecli' ? onecliProfile : nativeProfile),
    wranglerConfigPath: configPath,
    analyticsDigestPath: join(directory, 'analytics-digest')
  };
  await writeFile(profile.analyticsDigestPath, `${'a'.repeat(43)}\n`, { mode: 0o600 });
  await writeFile(profilePath, JSON.stringify(profile));
  const context: CommandContext = {
    cwd: process.cwd(),
    repositoryRoot: process.cwd(),
    executor: onecliExecutor(),
    env: { USER: 'operator' },
    now: () => new Date('2026-09-07T12:00:00.000Z'),
    fetch: vi.fn(async () => Response.json({ ok: true })) as typeof fetch
  };
  return { directory, configPath, profilePath, profile, context };
}
