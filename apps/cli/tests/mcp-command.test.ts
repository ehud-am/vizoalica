import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { Vault } from '../../local-ops-api/src/environments/vault.js';
import { main } from '../src/main.js';
import { configPath, snippet, withServer } from '../src/mcp/clients.js';
import { previousRange, resolveRange } from '../src/mcp/range.js';
import { defaultLaunch, mcpCommand, type McpDeps } from '../src/mcp-command.js';
import { skillCommand } from '../src/skill-command.js';
import { fakeWorkers, defaultBackends, SECRETS } from './mcp-support.js';
import { tempHome, writePrivate } from './support.js';

const LAUNCH = { command: '/usr/local/bin/node', args: ['/opt/vizoalica/dist/cli.mjs', 'mcp'] };

function deps(overrides: Partial<McpDeps> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const value: McpDeps = {
    home: tempHome(),
    version: '9.9.0',
    assetDir: '/assets/dist',
    out: (text) => void out.push(text),
    err: (text) => void err.push(text),
    interactive: false,
    ask: vi.fn(async () => 'n'),
    vault: new Vault(vi.fn() as never),
    platform: 'linux',
    launch: LAUNCH,
    ...overrides
  };
  return { deps: value, out, err, text: () => out.join(''), errors: () => err.join('') };
}

describe('ranges', () => {
  const now = new Date('2026-09-27T12:00:30Z');
  it('resolves each preset in UTC, ending at the current complete minute', () => {
    expect(resolveRange({ preset: 'last_24_hours' }, now)).toEqual({
      startUtc: '2026-09-26T12:00:00.000Z',
      endUtc: '2026-09-27T12:00:00.000Z'
    });
    expect(resolveRange({ preset: 'today' }, now).startUtc).toBe('2026-09-27T00:00:00.000Z');
    expect(resolveRange({ preset: 'yesterday' }, now)).toEqual({
      startUtc: '2026-09-26T00:00:00.000Z',
      endUtc: '2026-09-27T00:00:00.000Z'
    });
    expect(resolveRange({ preset: 'last_30_days' }, now).startUtc).toBe('2026-08-28T12:00:00.000Z');
    expect(resolveRange({}, now).startUtc).toBe('2026-09-20T12:00:00.000Z');
    // Right at midnight "today" is the last minute, not an empty range.
    expect(resolveRange({ preset: 'today' }, new Date('2026-09-27T00:00:10Z')).startUtc).toBe(
      '2026-09-26T23:59:00.000Z'
    );
  });

  it('takes dates and times, caps the end at now, and refuses bad input', () => {
    expect(resolveRange({ start: '2026-09-01', end: '2026-09-02' }, now)).toEqual({
      startUtc: '2026-09-01T00:00:00.000Z',
      endUtc: '2026-09-02T00:00:00.000Z'
    });
    expect(resolveRange({ start: '2026-09-27T10:15:45Z' }, now)).toEqual({
      startUtc: '2026-09-27T10:15:00.000Z',
      endUtc: '2026-09-27T12:00:00.000Z'
    });
    expect(resolveRange({ start: '2026-09-20', end: '2027-01-01' }, now).endUtc).toBe(
      '2026-09-27T12:00:00.000Z'
    );
    expect(() => resolveRange({ end: '2026-09-02' }, now)).toThrow('start is required with end.');
    expect(() => resolveRange({ start: '2026-09-02', end: 'later' }, now)).toThrow(
      'end must be a date'
    );
    expect(() => resolveRange({ start: '2026-09-02', end: '2026-09-01' }, now)).toThrow(
      'End must be after start.'
    );
    expect(() => resolveRange({ start: '2026-07-01', end: '2026-08-15' }, now)).toThrow(
      'at most 30 days'
    );
  });

  it('finds the period just before', () => {
    expect(
      previousRange({ startUtc: '2026-09-20T00:00:00.000Z', endUtc: '2026-09-27T00:00:00.000Z' })
    ).toEqual({
      startUtc: '2026-09-13T00:00:00.000Z',
      endUtc: '2026-09-20T00:00:00.000Z'
    });
  });
});

describe('client configuration files', () => {
  it('adds or replaces the server in a JSON file, keeping everything else', () => {
    const fresh = withServer('cursor', undefined, LAUNCH);
    expect(fresh.replaced).toBe(false);
    expect(JSON.parse(fresh.after)).toEqual({ mcpServers: { vizoalica: LAUNCH } });
    expect(JSON.parse(withServer('cursor', '  ', LAUNCH).after)).toEqual({
      mcpServers: { vizoalica: LAUNCH }
    });
    const existing = JSON.stringify({
      theme: 'dark',
      mcpServers: { other: { command: 'x' }, vizoalica: { command: 'old' } }
    });
    const replaced = withServer('claude-desktop', existing, LAUNCH);
    expect(replaced.replaced).toBe(true);
    expect(JSON.parse(replaced.after)).toEqual({
      theme: 'dark',
      mcpServers: { other: { command: 'x' }, vizoalica: LAUNCH }
    });
    expect(() => withServer('cursor', '[]', LAUNCH)).toThrow('does not contain a JSON object');
    expect(() => withServer('cursor', '{"mcpServers": 3}', LAUNCH)).toThrow('"mcpServers"');
    expect(() => withServer('cursor', '{', LAUNCH)).toThrow();
  });

  it("adds or replaces only the vizoalica tables in Codex's TOML", () => {
    const block =
      '[mcp_servers.vizoalica]\ncommand = "/usr/local/bin/node"\nargs = ["/opt/vizoalica/dist/cli.mjs", "mcp"]\n';
    expect(withServer('codex', undefined, LAUNCH)).toEqual({ after: block, replaced: false });
    const other = 'model = "o4"\n\n[mcp_servers.other]\ncommand = "x"\n';
    expect(withServer('codex', other, LAUNCH).after).toBe(`${other}\n${block}`);
    const before = [
      'model = "o4"',
      '[mcp_servers.vizoalica]',
      'command = "old"',
      '[mcp_servers.vizoalica.env]',
      'A = "1"',
      '[[profiles]]',
      'name = "p"',
      '[mcp_servers.other] # keep',
      'command = "x"',
      ''
    ].join('\n');
    const result = withServer('codex', before, LAUNCH);
    expect(result.replaced).toBe(true);
    expect(result.after).toBe(
      [
        'model = "o4"',
        '[mcp_servers.vizoalica]',
        'command = "/usr/local/bin/node"',
        'args = ["/opt/vizoalica/dist/cli.mjs", "mcp"]',
        '',
        '[[profiles]]',
        'name = "p"',
        '[mcp_servers.other] # keep',
        'command = "x"',
        ''
      ].join('\n')
    );
  });

  it('knows where each client keeps its servers, and prints a fallback', () => {
    expect(configPath('claude-desktop', '/h', 'darwin')).toBe(
      '/h/Library/Application Support/Claude/claude_desktop_config.json'
    );
    expect(configPath('claude-desktop', '/h', 'linux')).toBe(
      '/h/.config/Claude/claude_desktop_config.json'
    );
    expect(configPath('codex', '/h', 'linux')).toBe('/h/.codex/config.toml');
    expect(configPath('cursor', '/h', 'linux')).toBe('/h/.cursor/mcp.json');
    expect(snippet('claude-code', { command: '/a b/node', args: ["it's", 'mcp'] })).toBe(
      `claude mcp add --scope user vizoalica -- '/a b/node' 'it'\\''s' mcp`
    );
    expect(snippet('codex', LAUNCH)).toContain('[mcp_servers.vizoalica]');
    expect(snippet('cursor', LAUNCH)).toContain('"mcpServers"');
    expect(defaultLaunch()).toEqual({ command: process.execPath, args: [process.argv[1], 'mcp'] });
  });
});

describe('vizoalica mcp install', () => {
  it('lists the clients when none is named', async () => {
    const t = deps();
    expect(await mcpCommand(['install'], t.deps)).toBe(0);
    expect(t.text()).toContain('vizoalica mcp install --client codex');
    expect(t.text()).toContain('/usr/local/bin/node /opt/vizoalica/dist/cli.mjs mcp');
  });

  it('writes a new Cursor file, then leaves it alone when nothing changed', async () => {
    const t = deps();
    expect(await mcpCommand(['install', '--client', 'cursor'], t.deps)).toBe(0);
    const path = join(t.deps.home, '.cursor', 'mcp.json');
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ mcpServers: { vizoalica: LAUNCH } });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(t.text()).toContain('Added the "vizoalica" server');
    expect(t.text()).toContain('Restart Cursor');
    expect(await mcpCommand(['install', '--client=cursor'], t.deps)).toBe(0);
    expect(t.text()).toContain('already runs the Vizoalica MCP server');
  });

  it("asks before replacing another vizoalica entry, and keeps the file's permissions", async () => {
    const t = deps();
    const path = configPath('claude-desktop', t.deps.home, 'linux');
    mkdirSync(join(t.deps.home, '.config', 'Claude'), { recursive: true });
    writeFileSync(path, JSON.stringify({ mcpServers: { vizoalica: { command: 'old' } } }), {
      mode: 0o644
    });
    expect(await mcpCommand(['install', '--client', 'claude-desktop'], t.deps)).toBe(1);
    expect(t.errors()).toContain('Add --yes to replace it.');
    const asked = deps({ home: t.deps.home, interactive: true, ask: vi.fn(async () => 'no') });
    expect(await mcpCommand(['install', '--client', 'claude-desktop'], asked.deps)).toBe(0);
    expect(asked.text()).toBe('Nothing changed.\n');
    const yes = deps({ home: t.deps.home, interactive: true, ask: vi.fn(async () => 'y') });
    expect(await mcpCommand(['install', '--client', 'claude-desktop'], yes.deps)).toBe(0);
    expect(yes.text()).toContain('Updated the "vizoalica" server');
    expect(JSON.parse(readFileSync(path, 'utf8')).mcpServers.vizoalica).toEqual(LAUNCH);
    expect(statSync(path).mode & 0o777).toBe(0o644);
    writeFileSync(path, JSON.stringify({ mcpServers: { vizoalica: { command: 'old' } } }));
    expect(await mcpCommand(['install', '--client', 'claude-desktop', '--yes'], t.deps)).toBe(0);
  });

  it('prints the change without making it, and explains an unreadable file', async () => {
    const t = deps();
    expect(await mcpCommand(['install', '--client', 'codex', '--print'], t.deps)).toBe(0);
    expect(t.text()).toContain(
      `${join(t.deps.home, '.codex', 'config.toml')}\n[mcp_servers.vizoalica]`
    );
    const cursor = join(t.deps.home, '.cursor');
    mkdirSync(cursor, { recursive: true });
    writeFileSync(join(cursor, 'mcp.json'), '{ not json');
    expect(await mcpCommand(['install', '--client', 'cursor'], t.deps)).toBe(1);
    expect(t.errors()).toMatch(/could not be read: .*\nAdd this yourself:\n\{/);
  });

  it("uses Claude Code's own command, and says what to run when it cannot", async () => {
    const calls: string[][] = [];
    const t = deps({ runClaude: (args) => (calls.push(args), { status: 0 }) });
    expect(await mcpCommand(['install', '--client', 'claude-code'], t.deps)).toBe(0);
    expect(calls).toEqual([
      ['mcp', 'add', '--scope', 'user', 'vizoalica', '--', ...[LAUNCH.command, ...LAUNCH.args]]
    ]);
    expect(t.text()).toContain('Restart Claude Code');
    calls.length = 0;
    expect(await mcpCommand(['install', '--client', 'claude-code', '--yes'], t.deps)).toBe(0);
    expect(calls[0]).toEqual(['mcp', 'remove', '--scope', 'user', 'vizoalica']);
    const missing = deps({ runClaude: () => ({ status: null, error: new Error('ENOENT') }) });
    expect(await mcpCommand(['install', '--client', 'claude-code'], missing.deps)).toBe(1);
    expect(missing.errors()).toContain('The "claude" command was not found.');
    expect(missing.errors()).toContain('claude mcp add --scope user vizoalica --');
    const exists = deps({ runClaude: () => ({ status: 1 }) });
    expect(await mcpCommand(['install', '--client', 'claude-code'], exists.deps)).toBe(1);
    expect(exists.errors()).toContain('add --yes to replace it');
    const print = deps();
    expect(await mcpCommand(['install', '--client', 'claude-code', '--print'], print.deps)).toBe(0);
    expect(print.text()).toBe(
      `claude mcp add --scope user vizoalica -- ${LAUNCH.command} ${LAUNCH.args.join(' ')}\n`
    );
  });

  it('refuses unknown clients and arguments', async () => {
    const t = deps();
    expect(await mcpCommand(['install', '--client', 'vim'], t.deps)).toBe(1);
    expect(t.errors()).toContain(
      '--client must be one of: claude-code, claude-desktop, codex, cursor'
    );
    expect(await mcpCommand(['install', '--force'], t.deps)).toBe(1);
    expect(await mcpCommand(['serve'], t.deps)).toBe(1);
    expect(await mcpCommand(['help'], t.deps)).toBe(0);
    expect(t.text()).toContain('Usage: vizoalica mcp');
  });
});

describe('vizoalica mcp (the server)', () => {
  it('is not meant to be typed in a terminal', async () => {
    const t = deps({ interactive: true });
    expect(await mcpCommand([], t.deps)).toBe(1);
    expect(t.errors()).toContain('is started by an AI client');
  });

  it('speaks MCP on stdin and stdout, and nothing else goes to stdout', async () => {
    const home = tempHome();
    writePrivate(home, 'environments.json', {
      version: 1,
      environments: {
        prod: { url: 'https://prod.workers.test', role: 'admin', secret: SECRETS.prod }
      }
    });
    const { fetchMock } = fakeWorkers(defaultBackends());
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const lines: string[] = [];
    stdout.on('data', (chunk: Buffer) =>
      lines.push(...chunk.toString().split('\n').filter(Boolean))
    );
    const trace: string[] = [];
    const t = deps({
      home,
      stdio: { stdin, stdout },
      fetch: fetchMock as never,
      trace: (line) => void trace.push(line)
    });
    const running = mcpCommand([], t.deps);
    const send = (message: object) => stdin.write(`${JSON.stringify(message)}\n`);
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 't', version: '1' }
      }
    });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'list_websites', arguments: {} }
    });
    await vi.waitFor(() => expect(lines).toHaveLength(2));
    const replies = lines.map(
      (line) =>
        JSON.parse(line) as {
          id: number;
          result: { serverInfo?: { name: string }; content?: Array<{ text: string }> };
        }
    );
    expect(replies[0]!.result.serverInfo!.name).toBe('vizoalica');
    expect(replies[1]!.result.content![0]!.text).toMatch(/^Environment: prod \(admin/);
    stdin.end();
    stdin.emit('close');
    expect(await running).toBe(0);
    expect(trace.join('\n')).toContain('MCP server 9.9.0');
    expect(lines.join('')).not.toContain(SECRETS.prod);
  });

  it('sends --verbose output to stderr', async () => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await main(['mcp', 'help', '--verbose'], {
      env: {},
      home: tempHome(),
      version: '9.9.0',
      assetDir: '/assets/dist',
      out: (text) => void out.push(text),
      err: (text) => void err.push(text),
      openBrowser: () => undefined,
      waitForStop: async () => undefined,
      interactive: false,
      ask: async () => '',
      readStdin: async () => '',
      vault: new Vault(vi.fn() as never),
      nodeVersion: '22.0.0',
      platform: 'linux'
    });
    expect(code).toBe(0);
    expect(err.join('')).toContain('vizoalica 9.9.0, Node.js 22.0.0');
    expect(out.join('')).not.toContain('Node.js 22.0.0');
    const help: string[] = [];
    await main(['help'], {
      env: {},
      home: tempHome(),
      version: '9.9.0',
      assetDir: '/assets/dist',
      out: (text) => void help.push(text),
      err: () => undefined,
      openBrowser: () => undefined,
      waitForStop: async () => undefined,
      interactive: false,
      ask: async () => '',
      readStdin: async () => '',
      vault: new Vault(vi.fn() as never),
      nodeVersion: '22.0.0',
      platform: 'linux'
    });
    expect(help.join('')).toContain('mcp install');
    expect(help.join('')).toContain('skill install');
  });
});

describe('vizoalica skill', () => {
  function packaged() {
    const assetDir = tempHome();
    const source = join(assetDir, 'skill', 'vizoalica');
    mkdirSync(join(source, 'reference'), { recursive: true });
    writeFileSync(join(source, 'SKILL.md'), '---\nname: vizoalica\n---\nv2\n');
    writeFileSync(join(source, 'reference', 'setup.md'), 'setup');
    return assetDir;
  }
  function skillDeps(
    assetDir: string,
    overrides: Partial<Parameters<typeof skillCommand>[1]> = {}
  ) {
    const out: string[] = [];
    const err: string[] = [];
    return {
      deps: {
        home: tempHome(),
        assetDir,
        out: (text: string) => void out.push(text),
        err: (text: string) => void err.push(text),
        interactive: false,
        ask: vi.fn(async () => 'n'),
        ...overrides
      },
      text: () => out.join(''),
      errors: () => err.join('')
    };
  }

  it('prints where the packaged skill is, or that it is missing', async () => {
    const assetDir = packaged();
    const t = skillDeps(assetDir);
    expect(await skillCommand(['path'], t.deps)).toBe(0);
    expect(t.text()).toBe(`${join(assetDir, 'skill', 'vizoalica')}\n`);
    const missing = skillDeps('/nowhere');
    expect(await skillCommand(['path'], missing.deps)).toBe(1);
    expect(await skillCommand(['install', '--client', 'codex'], missing.deps)).toBe(1);
    expect(missing.errors()).toContain('was not found next to this command');
  });

  it('installs for Claude Code and Codex, asking before replacing a different version', async () => {
    const assetDir = packaged();
    const t = skillDeps(assetDir);
    expect(await skillCommand(['install', '--client', 'claude-code'], t.deps)).toBe(0);
    const target = join(t.deps.home, '.claude', 'skills', 'vizoalica');
    expect(readFileSync(join(target, 'reference', 'setup.md'), 'utf8')).toBe('setup');
    expect(t.text()).toContain('Installed the Vizoalica skill for Claude Code');
    // The same version again: replaced without a question.
    expect(await skillCommand(['install', '--client=claude-code'], t.deps)).toBe(0);
    writeFileSync(join(target, 'SKILL.md'), 'changed');
    expect(await skillCommand(['install', '--client', 'claude-code'], t.deps)).toBe(1);
    expect(t.errors()).toContain('Add --yes to replace it');
    const no = skillDeps(assetDir, { home: t.deps.home, interactive: true });
    expect(await skillCommand(['install', '--client', 'claude-code'], no.deps)).toBe(0);
    expect(no.text()).toBe('Nothing changed.\n');
    const yes = skillDeps(assetDir, {
      home: t.deps.home,
      interactive: true,
      ask: vi.fn(async () => 'yes')
    });
    expect(await skillCommand(['install', '--client', 'claude-code'], yes.deps)).toBe(0);
    expect(readFileSync(join(target, 'SKILL.md'), 'utf8')).toContain('v2');
    writeFileSync(join(target, 'SKILL.md'), 'changed');
    expect(await skillCommand(['install', '--client', 'claude-code', '--yes'], t.deps)).toBe(0);
    const codex = skillDeps(assetDir);
    expect(await skillCommand(['install', '--client', 'codex'], codex.deps)).toBe(0);
    expect(
      readFileSync(join(codex.deps.home, '.codex', 'skills', 'vizoalica', 'SKILL.md'), 'utf8')
    ).toContain('v2');
  });

  it('explains the other clients and bad arguments', async () => {
    const t = skillDeps(packaged());
    expect(await skillCommand([], t.deps)).toBe(0);
    expect(t.text()).toContain('Usage: vizoalica skill');
    expect(await skillCommand(['install', '--client', 'claude-desktop'], t.deps)).toBe(1);
    expect(t.errors()).toContain('upload vizoalica-skill.zip');
    expect(await skillCommand(['install'], t.deps)).toBe(1);
    expect(await skillCommand(['install', '--force'], t.deps)).toBe(1);
    expect(await skillCommand(['remove'], t.deps)).toBe(1);
  });

  it('ships a skill whose metadata AI clients accept', () => {
    const text = readFileSync(
      join(__dirname, '..', '..', '..', 'skills', 'vizoalica', 'SKILL.md'),
      'utf8'
    );
    const front = /^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(text);
    expect(front?.[1]).toBe('vizoalica');
    expect(front![2]!.length).toBeLessThanOrEqual(1024);
    expect(front![2]).not.toMatch(/[<>]/);
    for (const link of text.matchAll(/\]\((reference\/[^)]+)\)/g))
      expect(
        statSync(join(__dirname, '..', '..', '..', 'skills', 'vizoalica', link[1]!)).isFile()
      ).toBe(true);
  });
});
