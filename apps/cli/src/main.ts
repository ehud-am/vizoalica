import { consoleCommand, serveCommand, type ConsoleDeps } from './console-command.js';

export type MainDeps = ConsoleDeps & {
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
    '  console [--no-open]   Start the console. It asks a few questions the first time and',
    '                        guides the rest: backend, websites, and results',
    '  help                  Show this help',
    '  --version             Print the installed version',
    '',
    'Start with: vizoalica console',
    'Documentation: https://vizoalica.dev'
  ].join('\n');
}

/** Runs the command line and returns the exit code; every failure is a plain message. */
export async function main(argv: readonly string[], deps: MainDeps): Promise<number> {
  const [command, ...rest] = argv;
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
    return consoleCommand({ open: !rest.includes('--no-open') }, deps);
  }
  if (command === 'serve') return serveCommand(rest[0], deps);
  if (CHECKOUT_COMMANDS.has(command)) {
    deps.err(
      `"vizoalica ${command}" is not part of the installed package yet.\nRun "vizoalica console"; it guides setup. To use this command now, work from a source checkout:\n  git clone https://github.com/ehud-am/vizoalica && cd vizoalica && pnpm install && pnpm vizoalica ${command}\n`
    );
    return 2;
  }
  deps.err(`Unknown command: ${command}\nRun "vizoalica help" to see what is available.\n`);
  return 1;
}
