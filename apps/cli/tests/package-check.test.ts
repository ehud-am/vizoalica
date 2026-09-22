import { describe, expect, it } from 'vitest';
import {
  ALLOWED_FILES,
  REQUIRED_FILES,
  checkManifest,
  compareFileList,
  scanPackage
} from '../../../scripts/lib/package-check.mjs';

const good = [
  'package.json',
  'README.md',
  'LICENSE',
  'CHANGELOG.md',
  'dist/cli.mjs',
  'dist/console/index.html',
  'dist/console/assets/index-abc.js',
  'dist/console/brand/mark.svg',
  'dist/sdk/vizoalica.js',
  'dist/sdk/vizoalica-loader.js',
  'dist/schema/0001_initial.sql'
];

describe('compareFileList', () => {
  it('accepts exactly the allowlist', () => {
    expect(compareFileList(good)).toEqual({ extra: [], missing: [] });
    expect(compareFileList([...good, 'dist/schema/0002_x.sql', 'dist/worker/index.mjs'])).toEqual({
      extra: [],
      missing: []
    });
  });

  it('flags every extra file', () => {
    const { extra } = compareFileList([
      ...good,
      'deploy/cloudflare/wrangler.production.toml',
      'dist/console/assets/nested/x.js',
      'src/index.ts',
      '.env'
    ]);
    expect(extra).toEqual([
      'deploy/cloudflare/wrangler.production.toml',
      'dist/console/assets/nested/x.js',
      'src/index.ts',
      '.env'
    ]);
  });

  it('flags every missing required file, including the first schema change', () => {
    const { missing } = compareFileList(
      good.filter((path) => path !== 'dist/cli.mjs' && !path.includes('schema'))
    );
    expect(missing).toEqual(['dist/cli.mjs', 'dist/schema/0001_*.sql']);
    expect(REQUIRED_FILES.every((path) => ALLOWED_FILES.some((pattern) => pattern === path))).toBe(
      true
    );
  });
});

describe('scanPackage', () => {
  it('flags secret-looking files by name', () => {
    const names = [
      'wrangler.production.toml',
      '.env',
      '.env.local',
      'local-operations.json',
      'ops.json',
      'server.pem',
      'x.key'
    ];
    const findings = scanPackage(names.map((path) => ({ path })));
    expect(findings.map((finding) => finding.path)).toEqual(names);
  });

  it('flags keys, account ids, tokens, private keys, and local paths in content', () => {
    const key = `vzk_abcdefghijkl_${'A'.repeat(43)}`;
    const cases: Array<[string, string]> = [
      [key, 'an access key'],
      ['account_id: "0123456789abcdef0123456789abcdef"', 'a Cloudflare account identifier'],
      [`CLOUDFLARE_API_TOKEN="${'a'.repeat(40)}"`, 'a Cloudflare API token'],
      ['-----BEGIN RSA PRIVATE KEY-----', 'a private key'],
      ['/Users/harness/projects/x', 'an absolute local path'],
      ['/home/runner/work/x', 'an absolute local path']
    ];
    for (const [content, problem] of cases)
      expect(scanPackage([{ path: 'dist/cli.mjs', content }]), content).toEqual([
        { path: 'dist/cli.mjs', problem: `contains ${problem}` }
      ]);
  });

  it('lets placeholders and documentation examples through', () => {
    expect(
      scanPackage([
        { path: 'README.md', content: 'vzk_… and /Users/name/x and /home/user/x and /home/you/' },
        { path: 'dist/cli.mjs', content: 'const a = "0123456789abcdef0123456789abcdef";' },
        { path: 'binary.png' }
      ])
    ).toEqual([]);
  });
});

describe('checkManifest', () => {
  const manifest = {
    name: 'vizoalica',
    version: '0.6.3',
    license: 'MIT',
    bin: { vizoalica: 'dist/cli.mjs' },
    engines: { node: '>=22' },
    files: ['dist/'],
    publishConfig: { access: 'public', provenance: true }
  };

  it('accepts the publishable manifest', () => {
    expect(checkManifest(manifest)).toEqual([]);
  });

  it('names every problem', () => {
    const problems = checkManifest({
      name: 'other',
      version: 'x',
      private: true,
      dependencies: { left: '1' },
      scripts: { postinstall: 'x' },
      engines: { node: '>=18' },
      bin: {},
      files: [],
      publishConfig: {},
      license: 'ISC'
    });
    expect(problems).toHaveLength(11);
    expect(checkManifest({ ...manifest, engines: undefined })).toContain(
      'engines.node must be ">=22"'
    );
    expect(checkManifest({ ...manifest, dependencies: {}, scripts: {} })).toEqual([]);
  });
});
