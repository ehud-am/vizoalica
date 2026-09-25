// Packs the built package, checks its contents, installs the tarball into a throwaway prefix and home,
// starts the console from it, and checks what a first-time user would meet. Run after `pnpm package:build`.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createServer, connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkManifest, compareFileList, scanPackage } from './lib/package-check.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const packageDir = join(root, 'apps', 'cli', 'package');
const scratch = mkdtempSync(join(tmpdir(), 'vizoalica-package-check-'));
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}`);
};

// A clean environment: nothing from the caller's npm or Vizoalica configuration leaks in.
const home = join(scratch, 'home');
const prefix = join(scratch, 'prefix');
const env = {
  PATH: process.env.PATH,
  HOME: home,
  npm_config_cache: join(scratch, 'npm-cache'),
  npm_config_update_notifier: 'false',
  npm_config_audit: 'false',
  npm_config_fund: 'false'
};
const run = (command, args, options = {}) =>
  spawnSync(command, args, { encoding: 'utf8', env, ...options });

function listFiles(directory, base = directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path, base) : [path.slice(base.length + 1)];
  });
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** A raw HTTP request, so the path is sent exactly as written (fetch would tidy `..` away). */
function rawGet(port, path) {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1');
    let data = '';
    socket.on('data', (chunk) => (data += chunk));
    socket.on('error', reject);
    socket.on('close', () => resolve(Number(/^HTTP\/1\.1 (\d+)/.exec(data)?.[1] ?? 0)));
    socket.write(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`);
  });
}

try {
  check(
    existsSync(join(packageDir, 'package.json')),
    'the package was built (run pnpm package:build first)'
  );
  if (failures.length) throw new Error('nothing to check');
  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
  for (const problem of checkManifest(manifest)) check(false, `manifest: ${problem}`);
  check(checkManifest(manifest).length === 0, 'the manifest is publishable');

  // 1. The tarball contains exactly the allowlist and nothing that looks like a secret.
  const packed = run('npm', ['pack', '--json', '--pack-destination', scratch], { cwd: packageDir });
  check(packed.status === 0, 'npm pack succeeds');
  if (packed.status !== 0) throw new Error(packed.stderr);
  const [{ filename, files }] = JSON.parse(packed.stdout);
  const tarball = join(scratch, filename);
  const names = files.map((file) => file.path);
  const { extra, missing } = compareFileList(names);
  check(
    extra.length === 0,
    `the tarball has no files outside the allowlist${extra.length ? `: ${extra.join(', ')}` : ''}`
  );
  check(
    missing.length === 0,
    `the tarball has every required file${missing.length ? `; missing: ${missing.join(', ')}` : ''}`
  );
  const unpack = join(scratch, 'unpacked');
  run('mkdir', ['-p', unpack]);
  run('tar', ['-xzf', tarball, '-C', unpack]);
  const textFile = /\.(mjs|js|css|html|svg|json|md|sql|toml|txt)$/;
  const scanned = names.map((path) => ({
    path,
    content: textFile.test(path) ? readFileSync(join(unpack, 'package', path), 'utf8') : undefined
  }));
  const findings = scanPackage(scanned);
  for (const finding of findings) check(false, `${finding.path} ${finding.problem}`);
  check(findings.length === 0, 'nothing in the tarball looks like a secret or a local path');

  // 2. It installs into an empty prefix and reports its version.
  run('mkdir', ['-p', home]);
  const installed = run('npm', [
    'install',
    '--global',
    '--prefix',
    prefix,
    '--ignore-scripts',
    tarball
  ]);
  check(
    installed.status === 0,
    `the tarball installs globally${installed.status === 0 ? '' : `: ${installed.stderr}`}`
  );
  if (installed.status !== 0) throw new Error('install failed');
  const bin = join(prefix, 'bin', 'vizoalica');
  const reported = run(bin, ['--version']);
  check(reported.stdout.trim() === manifest.version, `--version prints ${manifest.version}`);
  check(run(bin, ['help']).stdout.includes('vizoalica console'), 'help names the console command');
  check(run(bin, ['help']).stdout.includes('env <command>'), 'help names the env command');
  check(run(bin, ['help']).stdout.includes('deploy <name>'), 'help names the deploy command');
  const planned = run(bin, ['deploy', 'smoke'], { env });
  check(
    planned.status === 0 &&
      planned.stdout.includes('smoke-vizoalica-worker') &&
      planned.stdout.includes('Nothing was created'),
    '`deploy` without --apply shows the resources without creating anything'
  );
  check(
    !existsSync(join(home, '.config', 'vizoalica', 'environments.json')),
    'a plan writes no environment'
  );
  const listed = run(bin, ['env', 'list'], { env });
  check(
    listed.status === 0 && listed.stdout.includes('vizoalica env add'),
    'env list works with no environments and says how to add one'
  );

  // 3. The console starts from the installed package with no saved settings and serves what a new user needs.
  const port = await freePort();
  const child = spawn(bin, ['console', '--no-open'], {
    env: { ...env, VIZOALICA_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const exited = new Promise((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal }))
  );
  const started = await Promise.race([
    new Promise((resolve) => {
      const timer = setInterval(() => {
        if (output.includes('Vizoalica console:')) {
          clearInterval(timer);
          resolve(true);
        }
      }, 50);
    }),
    exited.then(() => false),
    new Promise((resolve) => setTimeout(() => resolve(false), 15_000))
  ]);
  check(started === true, `the console starts${started === true ? '' : `: ${output}`}`);
  if (started === true) {
    const base = `http://127.0.0.1:${port}`;
    const page = await fetch(`${base}/`);
    const html = await page.text();
    check(page.status === 200 && html.includes('<div id="root">'), 'GET / returns the console');
    check(
      page.headers.get('content-security-policy')?.includes("frame-ancestors 'none'") === true,
      'the console page sets its security headers'
    );
    const asset = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
    check(
      asset !== undefined && (await fetch(`${base}${asset}`)).status === 200,
      'the console script is served'
    );
    const session = await fetch(`${base}/api/session`, {
      method: 'POST',
      headers: { origin: base }
    });
    const cookie = session.headers.get('set-cookie')?.split(';')[0] ?? '';
    check(
      session.status === 204 && cookie !== '',
      'a session can be opened from the console address'
    );
    const listing = await fetch(`${base}/api/environments`, { headers: { origin: base, cookie } });
    const body = listing.status === 200 ? await listing.json() : {};
    check(
      body.selected === null && Array.isArray(body.environments) && body.environments.length === 0,
      'with no environments, the console lists none and selects none'
    );
    const state = await fetch(`${base}/api/setup/state`, { headers: { origin: base, cookie } });
    check(state.status === 409, 'no data screen is served without a usable environment');
    for (const name of ['vizoalica.js', 'vizoalica-loader.js']) {
      const sdk = await fetch(`${base}/api/sdk/${name}`);
      check(
        sdk.status === 200 && (sdk.headers.get('content-type') ?? '').startsWith('text/javascript'),
        `${name} is served as JavaScript`
      );
    }
    for (const path of [
      '/../../../etc/passwd',
      '/%2e%2e/%2e%2e/etc/passwd',
      '/assets/..%2f..%2fpackage.json',
      '/api/sdk/..%2fcli.mjs'
    ])
      check((await rawGet(port, path)) === 404, `path traversal is refused: ${path}`);
    check(
      (await fetch(`${base}/`, { method: 'POST' })).status === 405,
      'the console refuses writes to a page'
    );
    check(
      !existsSync(join(home, '.config', 'vizoalica', 'local-operations.json')) &&
        !existsSync(join(home, '.config', 'vizoalica', 'environments.json')),
      'starting the console writes no credential and no environment'
    );
    child.kill('SIGINT');
    const result = await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 5000))
    ]);
    check(result !== 'timeout' && result.code === 0, 'one interrupt stops the console cleanly');
    if (result === 'timeout') child.kill('SIGKILL');
  } else child.kill('SIGKILL');
} catch (error) {
  if (error.message !== 'nothing to check') check(false, error.message);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\n${failures.length} check${failures.length === 1 ? '' : 's'} failed.`);
  process.exit(1);
}
console.log('\nThe package is ready to publish.');
