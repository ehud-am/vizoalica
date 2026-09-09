import { describe, expect, it, vi, afterEach } from 'vitest';
import { OneCliProvider, cloudflareConnectionIds, objects } from '../../src/providers/onecli.js';
import { failureForProcess, wranglerArguments } from '../../src/providers/provider.js';
import { onecliExecutor, onecliProfile, ok, target } from '../support.js';

const context = (executor = onecliExecutor()) => ({ cwd: process.cwd(), target, executor });

describe('OneCLI provider contract', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('replaces ambient tokens only for wrapped Wrangler and uses operation budgets', async () => {
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'real-sentinel');
    vi.stubEnv('CF_API_TOKEN', 'alias-sentinel');
    const executor = onecliExecutor();
    const provider = new OneCliProvider();
    await provider.inspect(onecliProfile, context(executor));
    for (const [request] of executor.mock.calls) {
      expect(request.env?.CLOUDFLARE_API_TOKEN).toBeUndefined();
      expect(request.env?.CF_API_TOKEN).toBeUndefined();
    }
    for (const [operation, timeoutMs] of [
      ['cloudflare.identity.read', 60_000],
      ['worker.bundle.dry_run', 120_000],
      ['d1.migrations.apply', 300_000],
      ['worker.deploy', 300_000]
    ] as const) {
      await provider.run(onecliProfile, operation, context(executor));
      const request = executor.mock.calls.at(-1)![0];
      expect(request.env?.CLOUDFLARE_API_TOKEN).toBe('onecli-managed');
      expect(request.env?.CF_API_TOKEN).toBeUndefined();
      expect(request.timeoutMs).toBe(timeoutMs);
      expect(JSON.stringify(request)).not.toContain('real-sentinel');
    }
  });
  it('validates version, connection, agent, grant, and effective credential', async () => {
    await expect(new OneCliProvider().inspect(onecliProfile, context())).resolves.toMatchObject({
      status: 'ready',
      connectionId: 'connection-1',
      agentId: 'agent-1'
    });
  });

  it.each([
    [
      'help',
      { exitCode: 0, stdout: '{"version":"2.10.9"}', stderr: '', interrupted: false },
      'onecli_missing'
    ],
    ['connections list', ok('[]'), 'connection_missing'],
    ['agents list', ok('[{"id":"agent-1","identifier":"wrong"}]'), 'agent_mismatch'],
    ['grants list', ok('[]'), 'grant_denied'],
    ['agents credentials', ok('[]'), 'credential_revoked'],
    [
      'agents credentials',
      ok(
        '[{"connectionId":"connection-1","provider":"cloudflare"},{"connectionId":"connection-2","provider":"cloudflare"}]'
      ),
      'ambiguous_connection'
    ]
  ])('fails closed for invalid provider state: %s', async (pattern, response, code) => {
    await expect(
      new OneCliProvider().inspect(
        onecliProfile,
        context(onecliExecutor({ [pattern as string]: response as never }))
      )
    ).rejects.toMatchObject({ code });
  });

  it('maps unavailable, unauthenticated, denied, revoked, and interruption safely', async () => {
    for (const [stderr, code] of [
      ['login required', 'onecli_unauthenticated'],
      ['grant denied', 'grant_denied'],
      ['credential revoked', 'credential_revoked'],
      ['service unavailable', 'provider_unavailable']
    ]) {
      await expect(
        new OneCliProvider().inspect(
          onecliProfile,
          context(
            onecliExecutor({
              help: { exitCode: 1, stdout: '', stderr, interrupted: false }
            })
          )
        )
      ).rejects.toMatchObject({ code });
    }
    await expect(
      new OneCliProvider().inspect(
        onecliProfile,
        context(
          onecliExecutor({ help: { exitCode: 1, stdout: '', stderr: '', interrupted: true } })
        )
      )
    ).rejects.toMatchObject({ code: 'operation_interrupted' });
  });

  it('wraps only the selected agent and closed Wrangler operation', async () => {
    const executor = onecliExecutor();
    await new OneCliProvider().run(onecliProfile, 'worker.deploy', context(executor));
    expect(executor).toHaveBeenLastCalledWith(
      expect.objectContaining({
        executable: 'onecli',
        args: expect.arrayContaining(['run', '--agent', 'deploy-agent', 'wrangler', 'deploy'])
      })
    );
    expect(wranglerArguments('d1.migrations.apply', onecliProfile, target)).toContain('--remote');
    expect(() => wranglerArguments('worker.health.verify', onecliProfile, target)).toThrow();
  });

  it('handles nested OneCLI JSON and process failure categories', () => {
    expect(objects({ data: [{ id: 'x' }] })).toHaveLength(2);
    expect(cloudflareConnectionIds({ data: [{ id: 'x', provider: 'cloudflare' }] })).toEqual(['x']);
    expect(
      failureForProcess({ ...ok(), exitCode: 1, stderr: 'permission denied' }, 'worker.deploy')
    ).toMatchObject({ code: 'insufficient_permission' });
    expect(
      failureForProcess({ ...ok(), exitCode: 1, stderr: 'network timeout' }, 'worker.deploy')
    ).toMatchObject({ code: 'cloudflare_unavailable' });
    expect(failureForProcess({ ...ok(), exitCode: 1 }, 'd1.migrations.apply')).toMatchObject({
      code: 'migration_failed'
    });
  });
});
