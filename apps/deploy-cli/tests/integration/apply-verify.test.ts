import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { applyDeployment } from '../../src/commands/apply.js';
import { planDeployment } from '../../src/commands/plan.js';
import { preflight } from '../../src/commands/preflight.js';
import { verifyDeployment } from '../../src/commands/verify.js';
import { onecliExecutor, temporaryDeployment } from '../support.js';

async function approved() {
  const fixture = await temporaryDeployment();
  const plan = join(fixture.directory, 'plan.json');
  const receipt = join(fixture.directory, 'receipt.json');
  const planned = await planDeployment(
    { profile: fixture.profilePath, out: plan },
    fixture.context
  );
  await preflight({ profile: fixture.profilePath, plan, receipt }, fixture.context);
  return { ...fixture, plan, receipt, planId: planned.planId! };
}

describe('approved apply and verify', () => {
  it('rechecks access and account then applies migrations before Worker deploy', async () => {
    const fixture = await approved();
    const value = await applyDeployment(
      {
        profile: fixture.profilePath,
        plan: fixture.plan,
        receipt: fixture.receipt,
        approve: fixture.planId
      },
      fixture.context
    );
    expect(value.completedOperations).toEqual([
      'd1.migrations.apply',
      'worker.analytics_digest_secret.put',
      'worker.deploy'
    ]);
    const calls = (fixture.context.executor as ReturnType<typeof vi.fn>).mock.calls.map(
      ([request]) => request.args.join(' ')
    );
    expect(calls.findIndex((call) => call.includes('migrations apply'))).toBeLessThan(
      calls.findIndex((call) => call.includes('wrangler deploy --config'))
    );
  });

  it('rejects stale approval and reports partial completion safely', async () => {
    const fixture = await approved();
    await expect(
      applyDeployment(
        {
          profile: fixture.profilePath,
          plan: fixture.plan,
          receipt: fixture.receipt,
          approve: 'wrong'
        },
        fixture.context
      )
    ).rejects.toMatchObject({ code: 'approval_required' });
    fixture.context.executor = onecliExecutor({
      'wrangler deploy --config': { exitCode: 1, stdout: '', stderr: 'failed', interrupted: false }
    });
    const failed = await applyDeployment(
      {
        profile: fixture.profilePath,
        plan: fixture.plan,
        receipt: fixture.receipt,
        approve: fixture.planId
      },
      fixture.context
    );
    expect(failed).toMatchObject({
      ok: false,
      completedOperations: ['d1.migrations.apply', 'worker.analytics_digest_secret.put']
    });
    expect(failed.pendingOperations).toContain('worker.deploy');
    fixture.context.executor = onecliExecutor({
      'migrations apply': {
        exitCode: 1,
        stdout: '',
        stderr: 'permission denied',
        interrupted: false
      }
    });
    await expect(
      applyDeployment(
        {
          profile: fixture.profilePath,
          plan: fixture.plan,
          receipt: fixture.receipt,
          approve: fixture.planId
        },
        fixture.context
      )
    ).resolves.toMatchObject({ status: 'denied' });
    fixture.context.executor = onecliExecutor({
      'migrations apply': { exitCode: 130, stdout: '', stderr: '', interrupted: true }
    });
    await expect(
      applyDeployment(
        {
          profile: fixture.profilePath,
          plan: fixture.plan,
          receipt: fixture.receipt,
          approve: fixture.planId
        },
        fixture.context
      )
    ).resolves.toMatchObject({ status: 'interrupted' });
  });

  it('rejects existing schema during preflight and rechecks before apply', async () => {
    const fixture = await temporaryDeployment();
    const plan = join(fixture.directory, 'plan.json');
    const receipt = join(fixture.directory, 'receipt.json');
    const planned = await planDeployment(
      { profile: fixture.profilePath, out: plan },
      fixture.context
    );
    fixture.context.executor = onecliExecutor({
      'd1 execute': {
        exitCode: 0,
        stdout: JSON.stringify([{ results: [{ name: 'projects' }], success: true }]),
        stderr: '',
        interrupted: false
      }
    });
    await expect(
      preflight({ profile: fixture.profilePath, plan, receipt }, fixture.context)
    ).rejects.toMatchObject({ code: 'existing_schema' });

    fixture.context.executor = onecliExecutor();
    await preflight({ profile: fixture.profilePath, plan, receipt }, fixture.context);
    fixture.context.executor = onecliExecutor({
      'd1 execute': {
        exitCode: 0,
        stdout: JSON.stringify([{ results: [{ name: 'd1_migrations' }], success: true }]),
        stderr: '',
        interrupted: false
      }
    });
    await expect(
      applyDeployment(
        { profile: fixture.profilePath, plan, receipt, approve: planned.planId! },
        fixture.context
      )
    ).rejects.toMatchObject({ code: 'existing_schema' });
    const calls = (fixture.context.executor as ReturnType<typeof vi.fn>).mock.calls.map(
      ([request]) => request.args.join(' ')
    );
    expect(calls.some((call) => call.includes('migrations apply'))).toBe(false);
  });

  it('verifies only bounded HTTPS health responses', async () => {
    const fixture = await approved();
    await expect(
      verifyDeployment(
        { profile: fixture.profilePath, 'worker-url': 'http://worker.test' },
        fixture.context
      )
    ).rejects.toMatchObject({ code: 'invalid_worker_url' });
    await expect(
      verifyDeployment(
        { profile: fixture.profilePath, 'worker-url': 'https://user:pass@worker.test' },
        fixture.context
      )
    ).rejects.toMatchObject({ code: 'invalid_worker_url' });
    await expect(
      verifyDeployment(
        { profile: fixture.profilePath, 'worker-url': 'https://worker.test' },
        fixture.context
      )
    ).resolves.toMatchObject({ ok: true, completedOperations: ['worker.health.verify'] });
    fixture.context.fetch = vi.fn(
      async () => new Response('not-json', { status: 503 })
    ) as typeof fetch;
    await expect(
      verifyDeployment(
        { profile: fixture.profilePath, 'worker-url': 'https://worker.test' },
        fixture.context
      )
    ).rejects.toMatchObject({ code: 'health_check_failed' });
    fixture.context.fetch = vi.fn(async () => new Response('x'.repeat(5000))) as typeof fetch;
    await expect(
      verifyDeployment(
        { profile: fixture.profilePath, 'worker-url': 'https://worker.test' },
        fixture.context
      )
    ).rejects.toMatchObject({ code: 'health_check_failed' });
    fixture.context.fetch = vi.fn(async () => new Response(null)) as typeof fetch;
    await expect(
      verifyDeployment(
        { profile: fixture.profilePath, 'worker-url': 'https://worker.test' },
        fixture.context
      )
    ).rejects.toMatchObject({ code: 'health_check_failed' });
  });
});
