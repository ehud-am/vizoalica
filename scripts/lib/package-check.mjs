// Pure checks on the npm package contents; scripts/check-package.mjs runs them on a real tarball.

/** The only files the tarball may contain. `*` matches within one path segment. */
export const ALLOWED_FILES = [
  'package.json',
  'README.md',
  'LICENSE',
  'CHANGELOG.md',
  'dist/cli.mjs',
  'dist/console/index.html',
  'dist/console/assets/*',
  'dist/console/brand/*',
  'dist/sdk/vizoalica.js',
  'dist/sdk/vizoalica-loader.js',
  'dist/schema/*.sql',
  'dist/worker/index.mjs',
  'dist/worker/wrangler.template.toml'
];

/** Files a working package cannot be without. */
export const REQUIRED_FILES = [
  'package.json',
  'README.md',
  'LICENSE',
  'CHANGELOG.md',
  'dist/cli.mjs',
  'dist/console/index.html',
  'dist/sdk/vizoalica.js',
  'dist/sdk/vizoalica-loader.js',
  'dist/worker/index.mjs',
  'dist/worker/wrangler.template.toml'
];

const toRegExp = (pattern) =>
  new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+')}$`);

export function compareFileList(actual, allowed = ALLOWED_FILES, required = REQUIRED_FILES) {
  const patterns = allowed.map(toRegExp);
  const extra = actual.filter((path) => !patterns.some((pattern) => pattern.test(path)));
  const missing = required.filter((path) => !actual.includes(path));
  const schema = actual.filter((path) => /^dist\/schema\/[^/]+\.sql$/.test(path));
  if (!schema.some((path) => path.startsWith('dist/schema/0001_')))
    missing.push('dist/schema/0001_*.sql');
  return { extra, missing };
}

const SECRET_FILE = [
  /\.production\.toml$/,
  /(^|\/)\.env(\..*)?$/,
  /(^|\/)local-operations\.json$/,
  /(^|\/)ops\.json$/,
  /\.pem$/,
  /\.key$/
];
const SECRET_CONTENT = [
  { name: 'an access key', pattern: /vzk_[a-z0-9]{12}_[A-Za-z0-9_-]{43}/ },
  {
    name: 'a Cloudflare account identifier',
    pattern: /(account[_ -]?id)["'\s:=]{1,8}[0-9a-f]{32}\b/i
  },
  {
    name: 'a Cloudflare API token',
    pattern: /\bCLOUDFLARE_API_TOKEN["'\s:=]{1,8}[A-Za-z0-9_-]{30,}/
  },
  { name: 'a private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    name: 'an absolute local path',
    pattern: /(?:\/Users\/|\/home\/)(?!name\b|user\b|you\b|username\b|\$)[A-Za-z0-9._-]+\//
  }
];

/** Findings for every file that looks like a secret or carries a local detail. */
export function scanPackage(files) {
  const findings = [];
  for (const file of files) {
    if (SECRET_FILE.some((pattern) => pattern.test(file.path)))
      findings.push({ path: file.path, problem: 'a file that must never be published' });
    if (file.content === undefined) continue;
    for (const { name, pattern } of SECRET_CONTENT)
      if (pattern.test(file.content))
        findings.push({ path: file.path, problem: `contains ${name}` });
  }
  return findings;
}

export function checkManifest(manifest) {
  const problems = [];
  if (manifest.name !== 'vizoalica') problems.push('name must be "vizoalica"');
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.version ?? ''))
    problems.push('version must be a semantic version');
  if (manifest.private === true) problems.push('the package must not be private');
  if (manifest.dependencies && Object.keys(manifest.dependencies).length > 0)
    problems.push('the package must have no dependencies');
  if (manifest.scripts && Object.keys(manifest.scripts).length > 0)
    problems.push('the package must have no install scripts');
  if (!manifest.engines?.node || !/>=\s*22/.test(manifest.engines.node))
    problems.push('engines.node must be ">=22"');
  if (manifest.bin?.vizoalica !== 'dist/cli.mjs')
    problems.push('bin.vizoalica must be dist/cli.mjs');
  if (!Array.isArray(manifest.files) || manifest.files.length === 0)
    problems.push('files must be an allowlist');
  if (manifest.publishConfig?.access !== 'public')
    problems.push('publishConfig.access must be public');
  if (manifest.publishConfig?.provenance !== true)
    problems.push('publishConfig.provenance must be true');
  if (manifest.license !== 'MIT') problems.push('license must be MIT');
  return problems;
}
