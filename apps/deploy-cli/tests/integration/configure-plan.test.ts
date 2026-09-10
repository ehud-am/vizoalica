import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArguments } from '../../src/cli.js';
import { configure } from '../../src/commands/configure.js';
import { planDeployment } from '../../src/commands/plan.js';
import { loadPlan } from '../../src/plan.js';
import { temporaryDeployment } from '../support.js';

describe('configure and plan', () => {
  it('creates private non-secret profiles and deterministic closed plans', async () => {
    const fixture = await temporaryDeployment();
    const profilePath = join(fixture.directory, 'configured.json');
    const configured = await configure(
      {
        profile: profilePath,
        provider: 'onecli',
        environment: 'staging',
        'wrangler-config': fixture.configPath,
        'account-id': fixture.profile.cloudflare.accountId,
        'onecli-project': 'vizoalica',
        'onecli-agent-id': 'agent-1',
        'onecli-agent': 'deploy-agent',
        'onecli-connection': 'connection-1'
      },
      fixture.context
    );
    expect(configured.ok).toBe(true);
    expect((await stat(profilePath)).mode & 0o777).toBe(0o600);
    const profileText = await readFile(profilePath, 'utf8');
    expect(profileText).not.toMatch(/api.?token/i);
    const savedProfile = JSON.parse(profileText) as { analyticsDigestPath: string };
    expect((await stat(savedProfile.analyticsDigestPath)).mode & 0o777).toBe(0o600);
    expect(await readFile(savedProfile.analyticsDigestPath, 'utf8')).toMatch(
      /^[A-Za-z0-9_-]{43}\n$/
    );
    expect(profileText).not.toContain(
      (await readFile(savedProfile.analyticsDigestPath, 'utf8')).trim()
    );
    const out = join(fixture.directory, 'plan.json');
    const planned = await planDeployment({ profile: profilePath, out }, fixture.context);
    expect(planned.details?.mutations).toEqual([
      'worker.analytics_digest_secret.put',
      'd1.migrations.apply',
      'worker.deploy'
    ]);
    expect((await loadPlan(out)).operations).toHaveLength(9);
  });

  it('requires replacement and rejects secret or passthrough options', async () => {
    const fixture = await temporaryDeployment();
    await expect(
      configure(
        {
          profile: fixture.profilePath,
          provider: 'cloudflare-native',
          environment: 'staging',
          'wrangler-config': fixture.configPath,
          'account-id': fixture.profile.cloudflare.accountId
        },
        fixture.context
      )
    ).rejects.toThrow(/replace/);
    expect(() => parseArguments(['configure', '--api-token', 'bad'])).toThrow();
    expect(() => parseArguments(['plan', 'positional'])).toThrow();
  });
});
