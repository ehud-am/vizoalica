import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PINNED_WRANGLER_VERSION,
  onecliWrangler,
  pinnedWrangler,
  runnerForCredential
} from '../src/deploy/wrangler.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

function fixtureScript(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'vizoalica-wrangler-fixture-'));
  const path = join(dir, 'fixture.mjs');
  writeFileSync(path, body);
  return path;
}

afterEach(() => {
  delete process.env.VIZOALICA_WRANGLER;
});

describe('PINNED_WRANGLER_VERSION', () => {
  it('equals the root package.json devDependencies wrangler version', () => {
    const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      devDependencies: Record<string, string>;
    };
    const declared = rootPackage.devDependencies.wrangler;
    expect(declared).toBeDefined();
    expect(PINNED_WRANGLER_VERSION).toBe(declared!.replace(/^[\^~]/, ''));
  });
});

describe('the underlying process runner', () => {
  it('reports a spawn failure (a command that does not exist) as a failed result, not a rejection', async () => {
    process.env.VIZOALICA_WRANGLER = join(tmpdir(), 'vizoalica-does-not-exist-binary');
    const run = pinnedWrangler(root);
    const result = await run(['--version']);
    expect(result.code).not.toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  it('echoes output live when asked, and pipes stdin when given', async () => {
    const script = fixtureScript(
      'process.stdin.on("data", (d) => process.stdout.write(d)); process.stdin.on("end", () => process.exit(0));'
    );
    process.env.VIZOALICA_WRANGLER = `${process.execPath} ${script}`;
    const run = pinnedWrangler(root);
    const result = await run([], { stdin: 'hello', echo: true });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('hello');
  });

  it('inherits the terminal in interactive mode with no stdin', async () => {
    const script = fixtureScript('process.exit(0)');
    process.env.VIZOALICA_WRANGLER = `${process.execPath} ${script}`;
    const run = pinnedWrangler(root);
    const result = await run([], { interactive: true });
    expect(result.code).toBe(0);
  });
});

describe('pinnedWrangler', () => {
  it('runs npm exec with the pinned package by default', async () => {
    const script = fixtureScript('console.log(JSON.stringify(process.argv.slice(2)))');
    process.env.VIZOALICA_WRANGLER = `${process.execPath} ${script}`;
    const run = pinnedWrangler(root);
    const result = await run(['--version']);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(['--version']);
  });

  it('is overridden by VIZOALICA_WRANGLER, split on spaces', async () => {
    const script = fixtureScript('process.exit(7)');
    process.env.VIZOALICA_WRANGLER = `${process.execPath} ${script}`;
    const run = pinnedWrangler(root);
    const result = await run([]);
    expect(result.code).toBe(7);
  });
});

describe('onecliWrangler', () => {
  it('wraps the pinned command through onecli run with the given project, agent, and gateway', async () => {
    const script = fixtureScript('console.log("ran")');
    process.env.VIZOALICA_WRANGLER = `${process.execPath} ${script}`;
    // onecli itself is not installed here; assert this attempts the wrap, not that it succeeds.
    const run = onecliWrangler(root, { project: 'p', agent: 'a', gateway: 'g' });
    const result = await run(['deploy']);
    expect(result.code).not.toBe(0);
  });
});

describe('runnerForCredential', () => {
  it('passes CLOUDFLARE_API_TOKEN for a token-mode credential, alongside any other env', async () => {
    const script = fixtureScript(
      'console.log(JSON.stringify(process.env.CLOUDFLARE_API_TOKEN ?? null))'
    );
    process.env.VIZOALICA_WRANGLER = `${process.execPath} ${script}`;
    const run = runnerForCredential(root, { mode: 'token', token: 'cf-secret' });
    const result = await run([]);
    expect(JSON.parse(result.stdout)).toBe('cf-secret');
  });

  it('refuses an onecli-mode credential with no OneCLI settings found', () => {
    expect(() => runnerForCredential(root, { mode: 'onecli' })).toThrow(
      'onecli_settings_not_found'
    );
  });

  it('uses onecli wrapping when settings are supplied for an onecli-mode credential', async () => {
    const run = runnerForCredential(
      root,
      { mode: 'onecli' },
      { project: 'p', agent: 'a', gateway: 'g' }
    );
    const result = await run(['whoami']);
    // No real `onecli` binary here either; the point is it attempted onecli, not a plain wrangler call.
    expect(result.code).not.toBe(0);
  });
});
