import { mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { appendAudit, readAudit } from '../../src/audit.js';
import { actorId, failureResult, option, parseArguments, render, result } from '../../src/cli.js';
import {
  assertOperatorPath,
  loadWranglerTarget,
  readJsonFile,
  validateProfile,
  writePrivateJson
} from '../../src/config.js';
import { deploymentStatus } from '../../src/commands/status.js';
import { verifyDeployment } from '../../src/commands/verify.js';
import { exitCodeFor, runCli } from '../../src/index.js';
import { createPlan, loadPlan, saveArtifact } from '../../src/plan.js';
import { OneCliProvider } from '../../src/providers/onecli.js';
import { failureForProcess, wranglerArguments } from '../../src/providers/provider.js';
import { DeploymentFailure } from '../../src/types.js';
import {
  accountId,
  nativeProfile,
  ok,
  onecliExecutor,
  onecliProfile,
  target,
  temporaryDeployment,
  wranglerToml
} from '../support.js';

describe('deployment edge branches', () => {
  it('covers CLI parsing, rendering, actor labels, and every exit category', () => {
    expect(parseArguments(['status', '--json']).options.json).toBe(true);
    expect(parseArguments(['status', '--', '--plan-id', 'plan']).options['plan-id']).toBe('plan');
    expect(option({ optional: true }, 'optional', false)).toBeUndefined();
    expect(() => option({}, 'required')).toThrow();
    expect(actorId({ VIZOALICA_DEPLOY_ACTOR: 'bad space' })).toBe('unknown');
    expect(render(result('status'), false)).toBe('status succeeded.');
    expect(render(failureResult('apply', new Error('raw')), false)).not.toContain('raw');
    expect(failureResult('apply', new DeploymentFailure('receipt_expired', '', 6)).status).toBe(
      'expired'
    );
    expect(
      failureResult('apply', new DeploymentFailure('operation_interrupted', '', 7)).status
    ).toBe('interrupted');
    expect(exitCodeFor('invalid_plan')).toBe(2);
    expect(exitCodeFor('provider_unavailable')).toBe(3);
    expect(exitCodeFor('grant_denied')).toBe(4);
    expect(exitCodeFor('account_mismatch')).toBe(5);
    expect(exitCodeFor('receipt_mismatch')).toBe(6);
    expect(exitCodeFor('deploy_failed')).toBe(7);
    expect(exitCodeFor('health_check_failed')).toBe(8);
  });

  it('rejects unsafe, malformed, linked, oversized, and incomplete files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vizoalica-edge-'));
    expect(() => assertOperatorPath(process.cwd(), process.cwd())).toThrow();
    expect(() => validateProfile(null)).toThrow();
    expect(() => validateProfile({ ...onecliProfile, schemaVersion: 2 })).toThrow();
    const malformed = join(directory, 'malformed.json');
    await writeFile(malformed, '{');
    await expect(readJsonFile(malformed)).rejects.toThrow();
    const oversized = join(directory, 'oversized.json');
    await writeFile(oversized, 'x'.repeat(65 * 1024));
    await expect(readJsonFile(oversized)).rejects.toThrow();
    const linked = join(directory, 'linked.json');
    await symlink(malformed, linked);
    await expect(readJsonFile(linked)).rejects.toThrow();
    const invalidToml = join(directory, 'invalid.toml');
    await writeFile(invalidToml, 'name = "worker"\nVIZOALICA_DEMO_MODE = "true"');
    await expect(loadWranglerTarget(invalidToml)).rejects.toThrow();
    await expect(loadWranglerTarget(join(directory, 'missing.toml'))).rejects.toThrow();
  });

  it('replaces private JSON, detects plan tampering, and tolerates malformed audit lines', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vizoalica-artifacts-'));
    const path = join(directory, 'state.json');
    await writePrivateJson(path, { value: 1 });
    await writePrivateJson(path, { value: 2 }, true);
    await expect(readJsonFile(path)).resolves.toEqual({ value: 2 });
    const planPath = join(directory, 'plan.json');
    const plan = createPlan(onecliProfile, target, wranglerToml);
    await saveArtifact(planPath, { ...plan, planId: 'tampered' });
    await expect(loadPlan(planPath)).rejects.toThrow();
    const auditPath = join(directory, 'audit.ndjson');
    await writeFile(auditPath, 'not-json\n');
    expect(await readAudit(auditPath)).toEqual([]);
    await appendAudit(
      auditPath,
      {
        eventId: 'event',
        occurredAt: new Date().toISOString(),
        actorId: 'actor',
        provider: 'onecli',
        environment: 'staging',
        accountId,
        action: 'deny',
        outcome: 'denied'
      },
      90
    );
    expect(await readAudit(auditPath)).toHaveLength(1);
  });

  it('covers the complete closed Wrangler operation catalog and failure mapping', () => {
    expect(wranglerArguments('cloudflare.identity.read', nativeProfile, target)).toEqual([
      'whoami'
    ]);
    expect(wranglerArguments('d1.database.read', nativeProfile, target)).toContain('info');
    expect(wranglerArguments('r2.bucket.read', nativeProfile, target)).toContain('bucket');
    expect(wranglerArguments('worker.secrets.read', nativeProfile, target)).toContain('secret');
    expect(wranglerArguments('worker.bundle.dry_run', nativeProfile, target)).toContain(
      '--dry-run'
    );
    expect(wranglerArguments('worker.deploy', nativeProfile, target)).toContain('deploy');
    expect(failureForProcess({ ...ok(), interrupted: true }, 'worker.deploy')).toMatchObject({
      code: 'operation_interrupted'
    });
    expect(
      failureForProcess({ ...ok(), exitCode: 1, stderr: 'expired' }, 'worker.deploy')
    ).toMatchObject({
      code: 'credential_revoked'
    });
    expect(failureForProcess({ ...ok(), exitCode: 1 }, 'worker.deploy')).toMatchObject({
      code: 'deploy_failed'
    });
  });

  it('covers OneCLI malformed data, newer versions, and missing references', async () => {
    const provider = new OneCliProvider();
    const context = {
      cwd: process.cwd(),
      target,
      executor: onecliExecutor({ help: ok('{') })
    };
    await expect(provider.inspect(onecliProfile, context)).rejects.toMatchObject({
      code: 'provider_unavailable'
    });
    await expect(
      provider.inspect({ ...onecliProfile, onecli: undefined }, context)
    ).rejects.toMatchObject({
      code: 'invalid_profile'
    });
    await expect(
      provider.run({ ...onecliProfile, onecli: undefined }, 'worker.deploy', context)
    ).rejects.toMatchObject({
      code: 'invalid_profile'
    });
    const current = onecliExecutor({ help: ok('{"version":"3.0.0"}') });
    await expect(
      provider.inspect(onecliProfile, { ...context, executor: current })
    ).resolves.toMatchObject({
      status: 'ready'
    });
  });

  it('covers empty status, health failures, plan-linked verification, and command failures', async () => {
    const fixture = await temporaryDeployment();
    await expect(
      deploymentStatus({ profile: fixture.profilePath, 'plan-id': 'missing' }, fixture.context)
    ).resolves.toMatchObject({
      details: { outcome: 'unknown' }
    });
    fixture.context.fetch = vi.fn(async () => {
      throw new Error('network secret');
    }) as typeof fetch;
    await expect(
      verifyDeployment(
        { profile: fixture.profilePath, 'worker-url': 'https://worker.test' },
        fixture.context
      )
    ).rejects.toMatchObject({ code: 'health_check_failed' });
    expect((await runCli(['unknown'], fixture.context)).exitCode).toBe(2);
    expect((await runCli([], fixture.context)).output).toContain('Commands:');
  });
});
