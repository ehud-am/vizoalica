import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { planDeployment } from '../../src/commands/plan.js';
import { preflight } from '../../src/commands/preflight.js';
import { onecliExecutor, temporaryDeployment } from '../support.js';

describe('OneCLI no-fallback guarantee', () => {
  it('never invokes native Wrangler or forwards hostile ambient credentials', async () => {
    const fixture = await temporaryDeployment();
    const plan = join(fixture.directory, 'plan.json');
    const receipt = join(fixture.directory, 'receipt.json');
    await planDeployment({ profile: fixture.profilePath, out: plan }, fixture.context);
    const base = onecliExecutor();
    fixture.context.executor = vi.fn(async (request) => {
      expect(request.executable).toBe('onecli');
      expect(request.env?.CF_API_TOKEN).toBeUndefined();
      expect(request.env?.CLOUDFLARE_API_KEY).toBeUndefined();
      return base(request);
    });
    const previous = process.env.CF_API_TOKEN;
    process.env.CF_API_TOKEN = 'HOSTILE-CREDENTIAL-SENTINEL';
    process.env.CLOUDFLARE_API_KEY = 'HOSTILE-KEY-SENTINEL';
    try {
      await preflight({ profile: fixture.profilePath, plan, receipt }, fixture.context);
    } finally {
      if (previous === undefined) delete process.env.CF_API_TOKEN;
      else process.env.CF_API_TOKEN = previous;
      delete process.env.CLOUDFLARE_API_KEY;
    }
  });
});
