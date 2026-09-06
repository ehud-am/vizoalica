import { chmodSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfigFile, writeConfigFile } from '../src/config.js';
import { startApi } from './support.js';
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});
describe('local access lifecycle', () => {
  it('expires sessions and rejects follow-up access', async () => {
    const api = await startApi(() => Response.json([]), -1);
    closers.push(api.close);
    expect((await api.call('/api/projects', { cookie: await api.session() })).status).toBe(401);
  });
  it('atomically writes user-only configuration and rejects permissive files', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'vizoalica-')), 'config.json');
    writeConfigFile(path, {
      VIZOALICA_REMOTE_URL: 'https://worker.test',
      VIZOALICA_ADMIN_SECRET: 'secret'
    });
    expect(loadConfigFile(path).adminSecret).toBe('secret');
    expect(readFileSync(path, 'utf8')).toContain('worker.test');
    chmodSync(path, 0o644);
    expect(() => loadConfigFile(path)).toThrow('0600');
  });
});
