import { spawn } from 'node:child_process';
import type { Run, RunOptions, RunResult } from '@vizoalica/ops-core';
import type { OnecliRef } from '../../../local-ops-api/src/environments/file.js';
import { onecliArguments } from '../../../local-ops-api/src/environments/vault.js';

/** The Wrangler this command runs; fetched on demand with `npm exec`, so the package itself stays small. */
export const PINNED_WRANGLER_VERSION = '4.134.0';

const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 5 * 60 * 1000;

const capped = (current: string, chunk: Buffer): string =>
  current.length >= MAX_OUTPUT_BYTES ? current : current + chunk.toString('utf8');

/** Runs a command given as an argument array only, never through a shell. */
function commandRunner(command: readonly string[], baseEnv: NodeJS.ProcessEnv): Run {
  const [file, ...baseArgs] = command;
  return (args, options: RunOptions = {}) =>
    new Promise<RunResult>((resolve) => {
      const child = spawn(file!, [...baseArgs, ...args], {
        shell: false,
        env: { ...baseEnv, ...options.env },
        stdio: [options.stdin !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe']
      });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS);
      if (options.stdin !== undefined) child.stdin!.end(options.stdin);
      child.stdout?.on('data', (chunk: Buffer) => (stdout = capped(stdout, chunk)));
      child.stderr?.on('data', (chunk: Buffer) => (stderr = capped(stderr, chunk)));
      const finish = (result: RunResult) => {
        clearTimeout(timer);
        resolve(result);
      };
      child.on('error', (error) =>
        finish({ code: 1, stdout, stderr: `${stderr}${error.message}` })
      );
      child.on('close', (code) => finish({ code: code ?? 1, stdout, stderr }));
    });
}

/** `VIZOALICA_WRANGLER` replaces the whole command (an installed Wrangler, or a fake one in tests). */
export function wranglerCommand(env: NodeJS.ProcessEnv = process.env): string[] {
  const override = env.VIZOALICA_WRANGLER;
  return override
    ? override.split(' ').filter(Boolean)
    : ['npm', 'exec', '--yes', `--package=wrangler@${PINNED_WRANGLER_VERSION}`, '--', 'wrangler'];
}

/** How Wrangler reaches Cloudflare: an API token in its environment, or every call under `onecli run`. */
export type CloudflareAccess = { token: string } | { onecli: OnecliRef };

/**
 * The credential is only ever an environment variable of the child process (a token) or held by OneCLI;
 * it is never an argument, so it cannot show up in a process list.
 */
export function wranglerFor(access: CloudflareAccess, env: NodeJS.ProcessEnv = process.env): Run {
  // Ambient Cloudflare settings must not leak into a run that names its own credential.
  const clean = { ...env };
  delete clean.CLOUDFLARE_API_TOKEN;
  delete clean.CLOUDFLARE_API_KEY;
  delete clean.CLOUDFLARE_EMAIL;
  if ('token' in access) {
    const base = commandRunner(wranglerCommand(env), clean);
    return (args, options = {}) =>
      base(args, { ...options, env: { ...options.env, CLOUDFLARE_API_TOKEN: access.token } });
  }
  // The onecli arguments run a Node helper; for Wrangler the trailing helper is replaced by the command.
  const wrapped = onecliArguments(access.onecli);
  const separator = wrapped.indexOf('--');
  return commandRunner(
    ['onecli', ...wrapped.slice(0, separator + 1), ...wranglerCommand(env)],
    clean
  );
}
