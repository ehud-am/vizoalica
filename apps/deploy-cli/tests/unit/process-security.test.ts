import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { executeProcess, sanitizedCloudflareEnvironment } from '../../src/process.js';
import { redact, safeMessage } from '../../src/redaction.js';

describe('safe process boundary', () => {
  it('removes ambient Cloudflare credentials and pins only account metadata', () => {
    const result = sanitizedCloudflareEnvironment(
      { PATH: '/bin', CF_API_TOKEN: 'sentinel', CLOUDFLARE_API_KEY: 'key', CF_API_EMAIL: 'mail' },
      'account'
    );
    expect(result).toEqual({ PATH: '/bin', CLOUDFLARE_ACCOUNT_ID: 'account' });
  });

  it('redacts headers, variables, long tokens, and explicit sentinels', () => {
    const output = redact(
      `Authorization: Bearer abc.def\nCF_API_TOKEN=visible ${'a'.repeat(45)} custom-value`,
      ['custom-value']
    );
    expect(output).not.toContain('abc.def');
    expect(output).not.toContain('visible');
    expect(output).not.toContain('custom-value');
    expect(safeMessage('unknown')).toContain('failed safely');
  });

  it('uses argument arrays without shell interpretation', async () => {
    const marker = join('/tmp', `vizoalica-shell-${process.pid}`);
    const response = await executeProcess({
      executable: process.execPath,
      args: ['-e', 'console.log(process.argv[1])', `;touch ${marker}`],
      cwd: process.cwd()
    });
    expect(response.stdout).toContain(`;touch ${marker}`);
    await expect(access(marker)).rejects.toThrow();
  });

  it('bounds output and interrupts timed-out processes', async () => {
    const bounded = await executeProcess({
      executable: process.execPath,
      args: ['-e', `process.stdout.write('x'.repeat(100000))`],
      cwd: process.cwd()
    });
    expect(Buffer.byteLength(bounded.stdout)).toBeLessThanOrEqual(64 * 1024);
    const timed = await executeProcess({
      executable: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      cwd: process.cwd(),
      timeoutMs: 10
    });
    expect(timed.interrupted).toBe(true);
  });
});
