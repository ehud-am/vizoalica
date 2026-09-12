import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readAudit } from '../../src/audit.js';
import { planDeployment } from '../../src/commands/plan.js';
import { preflight } from '../../src/commands/preflight.js';
import { runCli } from '../../src/index.js';
import { onecliExecutor, temporaryDeployment } from '../support.js';

async function prepared() {
  const fixture = await temporaryDeployment();
  const plan = join(fixture.directory, 'plan.json');
  const receipt = join(fixture.directory, 'receipt.json');
  await planDeployment({ profile: fixture.profilePath, out: plan }, fixture.context);
  return { ...fixture, plan, receipt };
}

describe('deployment preflight', () => {
  it('checks identity, resources, secret names, and dry-run before writing a receipt', async () => {
    const fixture = await prepared();
    const value = await preflight(
      { profile: fixture.profilePath, plan: fixture.plan, receipt: fixture.receipt },
      fixture.context
    );
    expect(value.completedOperations).toHaveLength(6);
    expect(value.details?.expiresAt).toBe('2026-09-07T12:15:00.000Z');
  });

  it.each([
    ['whoami', 'other account', 'account_mismatch'],
    ['secret list', '[]', 'insufficient_permission']
  ])('fails closed for %s mismatch', async (pattern, stdout, code) => {
    const fixture = await prepared();
    fixture.context.executor = onecliExecutor({
      [pattern]: { exitCode: 0, stdout, stderr: '', interrupted: false }
    });
    await expect(
      preflight(
        { profile: fixture.profilePath, plan: fixture.plan, receipt: fixture.receipt },
        fixture.context
      )
    ).rejects.toMatchObject({ code });
  });

  it('maps provider and Cloudflare failures without upstream text', async () => {
    const fixture = await prepared();
    fixture.context.executor = onecliExecutor({
      'd1 info': {
        exitCode: 1,
        stdout: '',
        stderr: 'permission denied SECRET-SENTINEL',
        interrupted: false
      }
    });
    await expect(
      preflight(
        { profile: fixture.profilePath, plan: fixture.plan, receipt: fixture.receipt },
        fixture.context
      )
    ).rejects.toMatchObject({ code: 'insufficient_permission' });
  });

  it('records safe audit evidence for a denied command', async () => {
    const fixture = await prepared();
    fixture.context.executor = onecliExecutor({
      whoami: { exitCode: 0, stdout: 'different account', stderr: '', interrupted: false }
    });
    const denied = await runCli(
      [
        'check',
        '--profile',
        fixture.profilePath,
        '--plan',
        fixture.plan,
        '--receipt',
        fixture.receipt
      ],
      fixture.context
    );
    expect(denied.exitCode).not.toBe(0);
    const audit = await readAudit(`${fixture.profilePath}.deployment-audit.ndjson`);
    expect(audit.at(-1)).toMatchObject({ action: 'preflight', outcome: 'denied' });
  });
});
