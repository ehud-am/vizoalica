import { describe, expect, it } from 'vitest';
import { OneCliProvider } from '../../src/providers/onecli.js';
import { onecliExecutor, onecliProfile, ok, target } from '../support.js';

describe('credential lifecycle', () => {
  const context = (overrides = {}) => ({
    cwd: process.cwd(),
    target,
    executor: onecliExecutor(overrides)
  });

  it('continues after in-place rotation without changing the connection reference', async () => {
    const provider = new OneCliProvider();
    await expect(provider.inspect(onecliProfile, context())).resolves.toMatchObject({
      status: 'ready'
    });
    await expect(provider.inspect(onecliProfile, context())).resolves.toMatchObject({
      connectionId: 'connection-1'
    });
  });

  it('denies detach and revocation, then permits same-connection recovery', async () => {
    const provider = new OneCliProvider();
    await expect(
      provider.inspect(onecliProfile, context({ 'grants list': ok('[]') }))
    ).rejects.toMatchObject({
      code: 'grant_denied'
    });
    await expect(
      provider.inspect(onecliProfile, context({ 'agents credentials': ok('[]') }))
    ).rejects.toMatchObject({
      code: 'credential_revoked'
    });
    await expect(provider.inspect(onecliProfile, context())).resolves.toMatchObject({
      status: 'ready'
    });
  });

  it('keeps local and CI agent identities explicit', async () => {
    const ciProfile = {
      ...onecliProfile,
      onecli: { ...onecliProfile.onecli!, agentId: 'ci-agent', agentIdentifier: 'ci-deploy' }
    };
    const executor = onecliExecutor({
      'agents list': ok('[{"id":"ci-agent","identifier":"ci-deploy"}]')
    });
    await expect(
      new OneCliProvider().inspect(ciProfile, { cwd: process.cwd(), target, executor })
    ).resolves.toMatchObject({
      agentId: 'ci-agent'
    });
  });
});
