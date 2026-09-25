import { makeTrace, noTrace, type Trace } from '../../local-ops-api/src/trace.js';
import { consoleCommand, type ConsoleDeps } from './console-command.js';
import { deployCommand } from './deploy-command.js';
import { envCommand, type EnvDeps } from './env-command.js';

export type MainDeps = ConsoleDeps &
  Pick<EnvDeps, 'interactive' | 'ask' | 'readStdin' | 'vault' | 'fetch'> & {
    /** Tests replace Wrangler and waiting for the deploy command. */
    deployTestHooks?: Partial<
      Pick<import('./deploy-command.js').DeployDeps, 'run' | 'sleep' | 'healthAttempts'>
    >;
    nodeVersion: string;
    platform: NodeJS.Platform;
  };

/** Commands that still need a source checkout of the repository. */
const CHECKOUT_COMMANDS = new Set([
  'install',
  'backend',
  'connect',
  'rotate',
  'purge-deleted',
  'demo',
  'setup',
  'doctor',
  'verify',
  'status',
  'show',
  'deploy-pages'
]);

export function help(): string {
  return [
    'Vizoalica: privacy-first analytics that runs in your own Cloudflare account',
    '',
    'Usage: vizoalica <command>',
    '',
    '  env <command>         Create and manage your environments (dev, stage, prod, ...):',
    '                        add (offers to deploy its backend), list, update, remove, check',
    '  deploy <name>         Deploy the backend for an environment in your Cloudflare account',
    '                        (--apply to create it). Run "vizoalica deploy" for details',
    '  console [--no-open]   Start the console: websites, results, and access for the',
    '                        environment you pick',
    '  help                  Show this help',
    '  --verbose             With any command: print what it is doing, for troubleshooting',
    '                        (never secrets)',
    '  --version             Print the installed version',
    '',
    'Start with: vizoalica env add <name> (deploys a backend or connects an existing one),',
    'then: vizoalica console',
    'Documentation: https://vizoalica.dev'
  ].join('\n');
}

/** Runs the command line and returns the exit code; every failure is a plain message. */
export async function main(args: readonly string[], deps: MainDeps): Promise<number> {
  const verbose = args.includes('--verbose');
  const argv = args.filter((item) => item !== '--verbose');
  const trace: Trace = verbose ? makeTrace(deps.out) : noTrace;
  const [command, ...rest] = argv;
  trace(`vizoalica ${deps.version}, Node.js ${deps.nodeVersion}, ${deps.platform}`);
  trace(`Command: ${argv.length > 0 ? argv.join(' ') : '(none)'}`);
  trace(
    `Settings folder: ${deps.home}/.config/vizoalica; packaged files: ${deps.assetDir}; terminal: ${deps.interactive ? 'yes' : 'no'}`
  );
  trace(
    `Environment variables: CLOUDFLARE_API_TOKEN ${deps.env.CLOUDFLARE_API_TOKEN?.trim() ? 'set' : 'not set'}, VIZOALICA_WRANGLER ${deps.env.VIZOALICA_WRANGLER ? `set (${deps.env.VIZOALICA_WRANGLER})` : 'not set'}, VIZOALICA_PORT ${deps.env.VIZOALICA_PORT ?? 'not set'}`
  );
  if (command === '--version' || command === '-v' || command === 'version') {
    deps.out(`${deps.version}\n`);
    return 0;
  }
  if (Number(deps.nodeVersion.split('.')[0]) < 22) {
    deps.err(
      `Vizoalica needs Node.js 22 or newer, and this is Node.js ${deps.nodeVersion}.\nInstall a current Node.js from https://nodejs.org, then run this again.\n`
    );
    return 1;
  }
  if (deps.platform !== 'darwin' && deps.platform !== 'linux') {
    deps.err('Vizoalica runs on macOS and Linux. On Windows, use it inside WSL.\n');
    return 1;
  }
  if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
    deps.out(`${help()}\n`);
    return 0;
  }
  if (command === 'console' || command === 'run') {
    const flags = rest.filter((item) => item !== '--no-open');
    if (flags.length > 0) {
      deps.err(`Unexpected argument: ${flags[0]}\nUsage: vizoalica console [--no-open]\n`);
      return 1;
    }
    return consoleCommand({ open: !rest.includes('--no-open') }, { ...deps, trace });
  }
  const deploy = (args: readonly string[]) =>
    deployCommand(args, { ...deps, trace, ...(deps.deployTestHooks ?? {}) });
  if (command === 'env')
    return envCommand(rest, { ...deps, trace, deploy: (args) => deploy(args) });
  if (command === 'deploy') return deploy(rest);
  if (CHECKOUT_COMMANDS.has(command)) {
    deps.err(
      `"vizoalica ${command}" is not part of the installed package yet.\nTo use this command now, work from a source checkout:\n  git clone https://github.com/ehud-am/vizoalica && cd vizoalica && pnpm install && pnpm vizoalica ${command}\n`
    );
    return 2;
  }
  deps.err(`Unknown command: ${command}\nRun "vizoalica help" to see what is available.\n`);
  return 1;
}
