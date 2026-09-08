import { describe, expect, it, vi } from 'vitest';
import { CloudflareNativeProvider } from '../../src/providers/cloudflare-native.js';
import { nativeProfile, ok, target } from '../support.js';

describe('Cloudflare-native compatibility', () => {
  it('preserves direct pnpm Wrangler execution only when explicitly selected', async () => {
    const executor = vi.fn(async () => ok('ready'));
    const provider = new CloudflareNativeProvider();
    await expect(
      provider.inspect(nativeProfile, { cwd: process.cwd(), target, executor })
    ).resolves.toMatchObject({
      provider: 'cloudflare-native',
      status: 'ready'
    });
    const previous = process.env.CF_API_TOKEN;
    process.env.CF_API_TOKEN = 'native-token-sentinel';
    try {
      await provider.run(nativeProfile, 'worker.bundle.dry_run', {
        cwd: process.cwd(),
        target,
        executor,
        signal: new AbortController().signal
      });
    } finally {
      if (previous === undefined) delete process.env.CF_API_TOKEN;
      else process.env.CF_API_TOKEN = previous;
    }
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        executable: 'pnpm',
        args: expect.arrayContaining(['exec', 'wrangler', '--dry-run']),
        env: expect.objectContaining({ CF_API_TOKEN: 'native-token-sentinel' })
      })
    );
  });
});
