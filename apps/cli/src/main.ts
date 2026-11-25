import { makeTrace, noTrace, type Trace } from '../../local-ops-api/src/trace.js';
import { consoleCommand, type ConsoleDeps } from './console-command.js';
import { deployCommand } from './deploy-command.js';
import { envCommand, type EnvDeps } from './env-command.js';
import { mappingCommand } from './mapping-command.js';
import { learnCommand } from './learn-command.js';
import { specCommand } from './spec-command.js';
import { mcpCommand } from './mcp-command.js';
import { rotateCommand } from './rotate-command.js';
import { skillCommand } from './skill-command.js';

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
  'connect',
  'purge-deleted',
  'demo',
  'setup',
  'doctor',
  'verify',
  'status',
  'show'
]);

/** Retired commands, and what replaced them. */
const RETIRED: Record<string, string> = {
  install: 'Add an environment with `vizoalica env add <name>`, then run `vizoalica console`.',
  backend:
    'Create a backend with `vizoalica deploy <name> --apply`, and update one with `vizoalica deploy <name> --update`.'
};

export function help(): string {
  return [
    'Vizoalica: privacy-first analytics that runs in your own Cloudflare account',
    '',
    'Usage: vizoalica <command>',
    '',
    'Each command says what it changes: [read-only], [this computer], [Cloudflare] (your account, through',
    'Wrangler), [backend] (your Worker, with an admin or owner key), [AI client] (its config or skills folder),',
    'or [prints steps] (shows instructions and changes nothing).',
    '',
    '  env <command>         Manage your environments (dev, stage, prod, ...): list, check [read-only];',
    '                        add, update, remove [this computer]; add --deploy also [Cloudflare]',
    '  deploy <environment>  Create a backend (--apply) or bring one to this version (--update) [Cloudflare];',
    '                        with no option it shows the plan [read-only]. Run "vizoalica deploy"',
    '  rotate <environment> <secret>  Replace a secret: admin, token, digest, or all [Cloudflare]',
    '  console [--no-open]   Start the console on this computer: websites, results, access. Changes made',
    '                        in it go to the backend [backend]',
    '  mcp install           Let an AI assistant (Claude, Codex, Cursor) read your analytics and health,',
    '                        read-only, across every environment [AI client]. Run "vizoalica mcp help"',
    '  skill install         Teach an AI assistant how Vizoalica works [AI client]. Run "vizoalica skill"',
    '  mapping export|apply  Page names, groups and goals proposed by an assistant: export [read-only],',
    '                        apply [backend]. Run "vizoalica mapping"',
    "  spec <command>        A website's spec (ontology) as versioned files: show, diff [read-only];",
    '                        init, validate, render, pull, export [this computer]; apply, import [backend].',
    '                        Run "vizoalica spec"',
    '  learn <command>       The learning window, where a share of visits describe their pages for an',
    '                        assistant: status [read-only]; enable-guide, disable-guide [prints steps]',
    '                        (you set the Worker variables yourself). Run "vizoalica learn"',
    '  help                  Show this help; "vizoalica <command> --help" shows a command\'s help',
    '  --verbose             With any command: print what it is doing, for troubleshooting',
    '                        (never secrets)',
    '  --version             Print the installed version',
    '',
    'Options take their value after a space or an equals sign: --url <address> or --url=<address>.',
    '',
    'Start with: vizoalica env add <name> (deploys a backend or connects an existing one),',
    'then: vizoalica console',
    'Documentation: https://vizoalica.dev'
  ].join('\n');
}

/** `--option=value` means `--option value`; `<command> --help` or `-h` means `<command> help`. */
function normalize(rest: readonly string[]): string[] {
  const split = rest.flatMap((arg) => {
    const at = arg.startsWith('--') ? arg.indexOf('=') : -1;
    return at > 2 ? [arg.slice(0, at), arg.slice(at + 1)] : [arg];
  });
  return split.includes('--help') || split.includes('-h') ? ['help'] : split;
}

/** Runs the command line and returns the exit code; every failure is a plain message. */
export async function main(args: readonly string[], deps: MainDeps): Promise<number> {
  const verbose = args.includes('--verbose');
  const argv = args.filter((item) => item !== '--verbose');
  const [command, ...rawRest] = argv;
  const rest = normalize(rawRest);
  // The MCP server's stdout carries only protocol messages, so its trace goes to stderr.
  const trace: Trace = verbose ? makeTrace(command === 'mcp' ? deps.err : deps.out) : noTrace;
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
    if (rest[0] === 'help') {
      deps.out(
        'Usage: vizoalica console [--no-open]\n\nStarts the console on this computer (http://127.0.0.1:4318) and opens it in your browser; --no-open skips opening it.\nWebsite and access changes you make in it go to the selected backend. Stop it with Ctrl+C.\n'
      );
      return 0;
    }
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
  if (command === 'mcp') return mcpCommand(rest, { ...deps, trace });
  if (command === 'mapping') return mappingCommand(rest, { ...deps, trace });
  if (command === 'learn') return learnCommand(rest, { ...deps, trace });
  if (command === 'spec') return specCommand(rest, { ...deps, trace });
  if (command === 'skill') return skillCommand(rest, deps);
  if (command === 'rotate')
    return rotateCommand(rest, { ...deps, trace, ...(deps.deployTestHooks ?? {}) });
  if (RETIRED[command]) {
    deps.err(`"vizoalica ${command}" was retired. ${RETIRED[command]}\n`);
    return 2;
  }
  if (CHECKOUT_COMMANDS.has(command)) {
    deps.err(
      `"vizoalica ${command}" is not part of the installed package yet.\nTo use this command now, work from a source checkout:\n  git clone https://github.com/ehud-am/vizoalica && cd vizoalica && pnpm install && pnpm vizoalica ${command}\n`
    );
    return 2;
  }
  deps.err(`Unknown command: ${command}\nRun "vizoalica help" to see what is available.\n`);
  return 1;
}
