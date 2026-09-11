import { describe, expect, it } from 'vitest';
import {
  consoleArguments,
  normalizeWorkerUrl,
  pagesDeployArguments,
  parseGateway,
  parseOptions,
  validateConsoleConfig,
  type OpsConfig
} from '../../../../scripts/vizoalica-ops.js';

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
    origin: 'https://vizoalica-site.pages.dev',
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

  it('always supplies the host-reachable gateway to OneCLI', () => {
    expect(consoleArguments(config)).toEqual([
      'run',
      '--project',
      'example-project',
      '--agent',
      'vizoalica-console',
      '--gateway',
      '127.0.0.1:10255',
      '--',
      'pnpm',
      'local-ops-api:dev',
      'serve',
      '/tmp/vizoalica/local-operations.json'
    ]);
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
