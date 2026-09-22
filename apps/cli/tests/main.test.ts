import { describe, expect, it } from 'vitest';
import { help, main, type MainDeps } from '../src/main.js';
import { fakeDeps } from './support.js';

function deps(overrides: Partial<MainDeps> = {}) {
  return Object.assign(fakeDeps(), {
    nodeVersion: '22.12.0',
    platform: 'darwin' as NodeJS.Platform,
    ...overrides
  });
}

describe('main', () => {
  it('prints the version', async () => {
    for (const flag of ['--version', '-v', 'version']) {
      const d = deps();
      expect(await main([flag], d)).toBe(0);
      expect(d.output.join('')).toBe('9.9.9\n');
    }
  });

  it('prints help for help, --help, and no command', async () => {
    for (const argv of [['help'], ['--help'], ['-h'], []]) {
      const d = deps();
      expect(await main(argv, d)).toBe(0);
      expect(d.output.join('')).toContain('vizoalica console');
    }
    expect(help()).toContain('--version');
    expect(help()).toContain('https://vizoalica.dev');
  });

  it('refuses an old Node with one plain message and no stack', async () => {
    const d = deps({ nodeVersion: '20.11.1' });
    expect(await main(['console'], d)).toBe(1);
    expect(d.errors.join('')).toContain('Node.js 22 or newer');
    expect(d.errors.join('')).toContain('20.11.1');
    expect(d.errors.join('')).not.toMatch(/\n\s+at /);
  });

  it('refuses other platforms plainly', async () => {
    const d = deps({ platform: 'win32' });
    expect(await main(['console'], d)).toBe(1);
    expect(d.errors.join('')).toContain('macOS and Linux');
    for (const platform of ['darwin', 'linux'] as const) {
      const ok = deps({ platform });
      ok.stop();
      expect(await main(['console', '--no-open'], ok)).toBe(0);
    }
  });

  it('rejects an unknown command with a hint', async () => {
    const d = deps();
    expect(await main(['frobnicate'], d)).toBe(1);
    expect(d.errors.join('')).toContain('Unknown command: frobnicate');
    expect(d.errors.join('')).toContain('vizoalica help');
  });

  it('points commands that need a checkout at the console and the checkout', async () => {
    for (const command of ['install', 'backend', 'rotate', 'deploy-pages']) {
      const d = deps();
      expect(await main([command], d)).toBe(2);
      expect(d.errors.join('')).toContain(`vizoalica ${command}`);
      expect(d.errors.join('')).toContain('vizoalica console');
      expect(d.errors.join('')).toContain('git clone');
    }
  });

  it('rejects unexpected console arguments', async () => {
    const d = deps();
    expect(await main(['console', '--bogus'], d)).toBe(1);
    expect(d.errors.join('')).toContain('Unexpected argument: --bogus');
  });

  it('opens the browser unless told not to, and stops on the first interrupt', async () => {
    const opened = deps();
    opened.stop();
    expect(await main(['console'], opened)).toBe(0);
    expect(opened.opened).toEqual(['http://127.0.0.1:4318']);
    expect(opened.closed.value).toBe(true);
    const quiet = deps();
    quiet.stop();
    expect(await main(['run', '--no-open'], quiet)).toBe(0);
    expect(quiet.opened).toEqual([]);
  });

  it('tells the user when the port is busy', async () => {
    const d = deps({
      listen: async () => {
        throw new Error('port_in_use');
      }
    });
    expect(await main(['console'], d)).toBe(1);
    expect(d.errors.join('')).toContain('A console is probably running already');
    expect(d.errors.join('')).toContain('http://127.0.0.1:4318');
  });
});
