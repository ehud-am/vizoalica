import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  definitionsOf,
  normalizeRemoteUrl,
  parseEnvironment,
  readEnvironments,
  writeEnvironments
} from '../src/environments/file.js';

const dir = () => mkdtempSync(join(tmpdir(), 'vizoalica-envfile-'));
const write = (path: string, value: unknown, mode = 0o600) => {
  writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value), { mode });
  chmodSync(path, mode);
};

describe('normalizeRemoteUrl', () => {
  it.each([
    ['https://dev.example.workers.dev', 'https://dev.example.workers.dev'],
    ['https://analytics.example.com/', 'https://analytics.example.com'],
    ['https://analytics.example.com:8443', 'https://analytics.example.com:8443'],
    ['http://localhost:8787', 'http://localhost:8787'],
    ['http://127.0.0.1:8787', 'http://127.0.0.1:8787']
  ])('accepts %s (workers.dev and custom domains alike)', (input, expected) => {
    expect(normalizeRemoteUrl(input)).toBe(expected);
  });

  it.each([
    'nonsense',
    'http://analytics.example.com',
    'https://user:pass@analytics.example.com',
    'https://analytics.example.com/base',
    'https://analytics.example.com/?a=1',
    'ftp://analytics.example.com'
  ])('rejects %s', (input) => {
    expect(() => normalizeRemoteUrl(input)).toThrow();
  });
});

describe('parseEnvironment', () => {
  const base = { url: 'https://a.example.com', role: 'admin', secret: 's' };

  it('accepts a literal secret, a OneCLI secret, and an admin Cloudflare token', () => {
    expect(parseEnvironment('prod', base)).toEqual({ ...base });
    const onecli = { workspace: 'acme', agent: 'vz', gateway: 'localhost:10255' };
    expect(
      parseEnvironment('prod', { ...base, secret: { onecli }, cloudflare: { token: 't' } })
    ).toEqual({
      ...base,
      secret: { onecli },
      cloudflare: { token: 't' }
    });
    expect(
      parseEnvironment('prod', { ...base, cloudflare: { token: { onecli } } }).cloudflare
    ).toEqual({ token: { onecli } });
  });

  it.each([
    ['Bad Name', base, 'name'],
    ['prod', 'text', 'object'],
    ['prod', { ...base, url: undefined }, '"url" is missing'],
    ['prod', { ...base, url: 'http://x.example.com' }, '"url"'],
    ['prod', { ...base, role: 'root' }, '"role"'],
    ['prod', { ...base, secret: undefined }, '"secret" is missing'],
    ['prod', { ...base, secret: '' }, 'non-empty'],
    ['prod', { ...base, secret: 'two\nlines' }, 'single'],
    ['prod', { ...base, secret: { onecli: { workspace: 'a' } } }, 'onecli.agent'],
    ['prod', { ...base, secret: { other: 1 } }, 'onecli'],
    ['prod', { ...base, role: 'analyst', cloudflare: { token: 't' } }, 'admin role'],
    ['prod', { ...base, cloudflare: 'nope' }, '"cloudflare"']
  ])('rejects %s %j', (name, value, message) => {
    expect(() => parseEnvironment(name, value)).toThrow(message);
  });
});

describe('readEnvironments', () => {
  it('treats a missing file, and a file with no environments, as none', () => {
    const home = dir();
    expect(readEnvironments(join(home, 'nope.json'))).toEqual({
      status: 'ok',
      path: join(home, 'nope.json'),
      entries: []
    });
    write(join(home, 'a.json'), { version: 1 });
    expect(readEnvironments(join(home, 'a.json'))).toMatchObject({ status: 'ok', entries: [] });
  });

  it('reads environments in name order and keeps a bad entry as a problem, not a failure', () => {
    const path = join(dir(), 'environments.json');
    write(path, {
      version: 1,
      environments: {
        prod: { url: 'https://a.example.com', role: 'admin', secret: 's' },
        broken: { url: 'nope', role: 'admin', secret: 's' },
        dev: { url: 'https://d.example.com', role: 'analyst', secret: 'k' }
      }
    });
    const result = readEnvironments(path);
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.entries.map((entry) => entry.name)).toEqual(['broken', 'dev', 'prod']);
    expect(result.entries[0]).toMatchObject({
      name: 'broken',
      problem: expect.stringContaining('"url"')
    });
    expect(Object.keys(definitionsOf(result))).toEqual(['dev', 'prod']);
  });

  it.each([
    ['not json', '{', 'not valid JSON'],
    ['an array', '[]', 'JSON object'],
    ['a future version', { version: 2 }, 'Unknown file version'],
    ['environments as a list', { environments: [] }, 'keyed by name']
  ])('reports a broken file: %s', (_label, content, reason) => {
    const path = join(dir(), 'environments.json');
    write(path, content);
    expect(readEnvironments(path)).toMatchObject({
      status: 'broken',
      reason: expect.stringContaining(reason)
    });
  });

  it('refuses a file other users can read, saying how to fix it', () => {
    const path = join(dir(), 'environments.json');
    write(path, { environments: {} }, 0o644);
    const result = readEnvironments(path);
    expect(result).toMatchObject({
      status: 'broken',
      reason: expect.stringContaining('chmod 600')
    });
  });

  it('does not follow a symbolic link', () => {
    const home = dir();
    write(join(home, 'real.json'), { environments: {} });
    symlinkSync(join(home, 'real.json'), join(home, 'environments.json'));
    expect(readEnvironments(join(home, 'environments.json'))).toMatchObject({ status: 'broken' });
  });
});

describe('writeEnvironments', () => {
  it('writes atomically with owner-only permissions and reads back what it wrote', () => {
    const path = join(dir(), 'nested', 'environments.json');
    const def = { url: 'https://a.example.com', role: 'admin' as const, secret: 's' };
    writeEnvironments(path, { prod: def });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
      version: 1,
      environments: { prod: def }
    });
    expect(definitionsOf(readEnvironments(path))).toEqual({ prod: def });
  });
});
