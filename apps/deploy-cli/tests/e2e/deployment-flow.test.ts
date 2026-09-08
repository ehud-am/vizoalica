import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/index.js';
import { temporaryDeployment } from '../support.js';

describe('deployment CLI end-to-end flow', () => {
  it('runs configure, plan, check, apply, verify, and status through fake provider binaries', async () => {
    const fixture = await temporaryDeployment();
    const profile = join(fixture.directory, 'flow-profile.json');
    const plan = join(fixture.directory, 'flow-plan.json');
    const receipt = join(fixture.directory, 'flow-receipt.json');
    expect(
      (
        await runCli(
          [
            'configure',
            '--profile',
            profile,
            '--provider',
            'onecli',
            '--environment',
            'staging',
            '--wrangler-config',
            fixture.configPath,
            '--account-id',
            fixture.profile.cloudflare.accountId,
            '--onecli-project',
            'vizoalica',
            '--onecli-agent-id',
            'agent-1',
            '--onecli-agent',
            'deploy-agent',
            '--onecli-connection',
            'connection-1'
          ],
          fixture.context
        )
      ).exitCode
    ).toBe(0);
    const planned = await runCli(
      ['plan', '--profile', profile, '--out', plan, '--json'],
      fixture.context
    );
    expect(planned).toMatchObject({ exitCode: 0, result: { ok: true } });
    const checked = await runCli(
      ['check', '--profile', profile, '--plan', plan, '--receipt', receipt, '--json'],
      fixture.context
    );
    expect(checked.exitCode).toBe(0);
    const applied = await runCli(
      [
        'apply',
        '--profile',
        profile,
        '--plan',
        plan,
        '--receipt',
        receipt,
        '--approve',
        planned.result!.planId!,
        '--json'
      ],
      fixture.context
    );
    expect(applied.exitCode).toBe(0);
    expect(
      (
        await runCli(
          ['verify', '--profile', profile, '--worker-url', 'https://worker.test', '--plan', plan],
          fixture.context
        )
      ).exitCode
    ).toBe(0);
    const status = await runCli(['status', '--profile', profile], fixture.context);
    expect(status.result?.details?.action).toBe('verify');
  });

  it('renders safe help, JSON errors, and stable exit codes', async () => {
    const fixture = await temporaryDeployment();
    expect((await runCli(['--help'], fixture.context)).output).toContain('Credential values');
    const failed = await runCli(['apply', '--json'], fixture.context);
    expect(failed.exitCode).toBe(2);
    expect(JSON.parse(failed.output)).toMatchObject({ ok: false });
  });
});
