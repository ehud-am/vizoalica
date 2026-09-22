import { spawn } from 'node:child_process';
import type { Run, RunOptions, RunResult } from '@vizoalica/ops-core';

/**
 * Kept equal to the root `package.json` devDependencies `wrangler` version (without the range
 * prefix) by `wrangler-pin.test.ts`, so a version bump there is a deliberate, tested change here too.
 */
export const PINNED_WRANGLER_VERSION = '4.134.0';

const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 5 * 60 * 1000;

function capped(current: string, chunk: Buffer): string {
  if (current.length >= MAX_OUTPUT_BYTES) return current;
  return current + chunk.toString('utf8');
}

/** Runs a command given as an argument array only, never through a shell. */
function commandRunner(cwd: string, command: readonly string[]): Run {
  const [file, ...baseArgs] = command;
  return (args, options: RunOptions = {}) =>
    new Promise((resolve) => {
      const child = spawn(file!, [...baseArgs, ...args], {
        cwd,
        shell: false,
        env: { ...process.env, ...options.env },
        stdio: [
          options.stdin !== undefined ? 'pipe' : options.interactive ? 'inherit' : 'ignore',
          'pipe',
          'pipe'
        ]
      });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS);
      if (options.stdin !== undefined) child.stdin!.end(options.stdin);
      child.stdout?.on('data', (chunk: Buffer) => {
        stdout = capped(stdout, chunk);
        if (options.echo) process.stdout.write(chunk);
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr = capped(stderr, chunk);
        if (options.echo) process.stderr.write(chunk);
      });
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

function wranglerCommand(): string[] {
  const override = process.env.VIZOALICA_WRANGLER;
  return override
    ? override.split(' ').filter(Boolean)
    : ['npm', 'exec', '--yes', `--package=wrangler@${PINNED_WRANGLER_VERSION}`, '--', 'wrangler'];
}

/**
 * The pinned Wrangler runner the console uses to deploy and maintain a backend: fetched on demand
 * through `npm exec` rather than bundled, so the install stays small for roles that never deploy.
 * `VIZOALICA_WRANGLER` overrides the whole command (an already-installed Wrangler, or a fake one in
 * tests), split on spaces.
 */
export function pinnedWrangler(cwd: string): Run {
  return commandRunner(cwd, wranglerCommand());
}

export type OneCliSettings = { project: string; agent: string; gateway: string };

/** The pinned Wrangler run through OneCLI, the same wrapping mechanism used for the admin secret. */
export function onecliWrangler(cwd: string, settings: OneCliSettings): Run {
  return commandRunner(cwd, [
    'onecli',
    'run',
    '--project',
    settings.project,
    '--agent',
    settings.agent,
    '--gateway',
    settings.gateway,
    '--',
    ...wranglerCommand()
  ]);
}

/**
 * The runner for one environment's deploy and update runs, built from its own Cloudflare credential
 * (research R25): a stored API token is passed as `CLOUDFLARE_API_TOKEN` on every call; OneCLI mode
 * wraps every call through the same OneCLI settings the admin secret's wrapping already reads from
 * `ops.json` in the environments home directory (OneCLI is one machine-wide tool configuration, not
 * saved per environment).
 */
export function runnerForCredential(
  cwd: string,
  credential: { mode: 'token'; token: string } | { mode: 'onecli' },
  onecli?: OneCliSettings
): Run {
  if (credential.mode === 'token') {
    const base = pinnedWrangler(cwd);
    const token = credential.token;
    return (args, options = {}) =>
      base(args, { ...options, env: { ...options.env, CLOUDFLARE_API_TOKEN: token } });
  }
  if (!onecli)
    throw new Error(
      'onecli_settings_not_found: this environment uses OneCLI for Cloudflare, but no OneCLI settings were found on this computer'
    );
  return onecliWrangler(cwd, onecli);
}
