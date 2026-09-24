import { describe, expect, it } from 'vitest';
import {
  oneCliNodeOptions,
  SILENCE_ENV_PROXY_WARNING,
  normalizeWorkerUrl,
  pagesDeployArguments,
  parseGateway,
  parseOptions,
  purgeArguments,
  verifyArguments,
  validateConsoleConfig,
  type OpsConfig
} from '../../../../scripts/vizoalica.js';

const config: OpsConfig = {
  version: 1,
  workerUrl: 'https://analytics.example.workers.dev',
  consoleConfigPath: '/tmp/vizoalica/local-operations.json',
  onecli: {
    project: 'example-project',
    agent: 'vizoalica-console',
    gateway: '127.0.0.1:10255'
  },
  pages: {
    siteDir: '/tmp/vizoalica-site',
    project: 'vizoalica-site',
    branch: 'main',
    assetsDir: '.',
    origin: 'https://example-site.pages.dev',
    analyticsProjectId: 'project-id',
    sourceId: 'source-id'
  }
};

describe('operations CLI safety', () => {
  it('rejects secret-bearing flags', () => {
    expect(() => parseOptions(['setup', '--admin-secret', 'never-store-this'])).toThrow(
      'Secret values are never accepted'
    );
  });

  it('accepts only an HTTPS Worker origin', () => {
    expect(normalizeWorkerUrl('https://analytics.example.workers.dev/')).toBe(
      'https://analytics.example.workers.dev'
    );
    expect(() => normalizeWorkerUrl('http://analytics.example.workers.dev')).toThrow('https://');
    expect(() => normalizeWorkerUrl('https://analytics.example.workers.dev/path')).toThrow(
      'origin'
    );
  });

  it('rejects the Docker-only gateway hostname', () => {
    expect(parseGateway('127.0.0.1:10255')).toEqual({ host: '127.0.0.1', port: 10255 });
    expect(() => parseGateway('gateway:10255')).toThrow('Docker-only');
  });

  it('verifies administrator access through the selected OneCLI agent', () => {
    expect(verifyArguments(config)).toEqual([
      'run',
      '--project',
      'example-project',
      '--agent',
      'vizoalica-console',
      '--gateway',
      '127.0.0.1:10255',
      '--',
      'node',
      SILENCE_ENV_PROXY_WARNING,
      '--import',
      'tsx',
      'scripts/verify-operator-access.ts',
      'https://analytics.example.workers.dev'
    ]);
  });

  it('purges soft-deleted data through OneCLI, deleting only when --apply is passed', () => {
    const tail = ['scripts/purge-deleted.ts', 'https://analytics.example.workers.dev'];
    expect(purgeArguments(config, false).slice(-3)).toEqual(['tsx', ...tail]);
    expect(purgeArguments(config, true).slice(-4)).toEqual(['tsx', ...tail, '--apply']);
    expect(purgeArguments(config, false).slice(0, 8)).toEqual(verifyArguments(config).slice(0, 8));
  });

  it('silences only the expected env-proxy warning under OneCLI, keeping any NODE_OPTIONS already set', () => {
    expect(SILENCE_ENV_PROXY_WARNING).toBe('--disable-warning=UNDICI-EHPA');
    expect(oneCliNodeOptions(undefined)).toBe('--disable-warning=UNDICI-EHPA');
    expect(oneCliNodeOptions('')).toBe('--disable-warning=UNDICI-EHPA');
    expect(oneCliNodeOptions('--max-old-space-size=512')).toBe(
      '--max-old-space-size=512 --disable-warning=UNDICI-EHPA'
    );
    expect(verifyArguments(config)).toContain(SILENCE_ENV_PROXY_WARNING);
  });

  it('keeps Pages uploads on native Wrangler', () => {
    expect(pagesDeployArguments(config)).toEqual([
      'exec',
      'wrangler',
      'pages',
      'deploy',
      '.',
      '--cwd',
      '/tmp/vizoalica-site',
      '--project-name',
      'vizoalica-site',
      '--branch',
      'main'
    ]);
  });

  it('fails closed when the placeholder client file is missing', () => {
    expect(
      validateConsoleConfig('/tmp/vizoalica-missing-client-config.json', config.workerUrl)
    ).toBe(false);
  });
});
