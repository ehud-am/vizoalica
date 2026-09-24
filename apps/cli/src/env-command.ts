import { join } from 'node:path';
import {
  definitionsOf,
  environmentsPath,
  parseEnvironment,
  rewriteBlocker,
  readEnvironments,
  writeEnvironments,
  ROLES,
  type EnvironmentDef,
  type LoadResult,
  type OnecliRef,
  type Role
} from '../../local-ops-api/src/environments/file.js';
import {
  verifyEnvironment,
  type EnvironmentState,
  type VerifyDeps
} from '../../local-ops-api/src/environments/verify.js';
import type { FetchLike, Vault } from '../../local-ops-api/src/environments/vault.js';
import { expectedSchemaFrom } from '../../local-ops-api/src/setup/state.js';

export type EnvDeps = {
  home: string;
  version: string;
  assetDir: string;
  out: (text: string) => void;
  err: (text: string) => void;
  /** Whether questions can be asked; without a terminal, everything must come from flags or stdin. */
  interactive: boolean;
  ask: (question: string, options?: { secret?: boolean }) => Promise<string>;
  readStdin: () => Promise<string>;
  vault: Vault;
  /** Tests replace the network. */
  fetch?: FetchLike;
};

const USAGE = [
  'Usage: vizoalica env <command>',
  '',
  '  list                     Show every environment and whether it works',
  '  add <name>               Add an environment (asks for what is missing)',
  '  update <name>            Change an environment',
  '  remove <name> [--yes]    Forget an environment (nothing in Cloudflare is deleted)',
  '  check [name]             Verify one or all environments; fails if one is unusable',
  '',
  'Options for add and update:',
  '  --url <https-address>     The Worker address: workers.dev or your own domain',
  '  --role admin|owner|analyst',
  '  --secret-stdin            Read the secret (admin secret or access key) from stdin',
  '  --secret-onecli           OneCLI holds the secret (needs the --onecli-* options)',
  '  --cloudflare-token-stdin  Admin only: read a Cloudflare API token from stdin',
  '  --cloudflare-onecli       Admin only: OneCLI holds the Cloudflare API token',
  '  --no-cloudflare           Remove the Cloudflare API token',
  '  --onecli-workspace <w> --onecli-agent <a> --onecli-gateway <host:port>',
  '  --no-verify               Save without checking (for offline edits)',
  '',
  'The list is a plain file you can also edit by hand: ~/.config/vizoalica/environments.json'
].join('\n');

type Flags = {
  values: Map<string, string>;
  switches: Set<string>;
  positional: string[];
};

const VALUE_FLAGS = new Set([
  '--url',
  '--role',
  '--onecli-workspace',
  '--onecli-agent',
  '--onecli-gateway'
]);
const SWITCHES = new Set([
  '--secret-stdin',
  '--secret-onecli',
  '--cloudflare-token-stdin',
  '--cloudflare-onecli',
  '--no-cloudflare',
  '--no-verify',
  '--yes'
]);

function parseFlags(args: readonly string[]): Flags | string {
  const flags: Flags = { values: new Map(), switches: new Set(), positional: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (VALUE_FLAGS.has(arg)) {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('--')) return `${arg} needs a value.`;
      flags.values.set(arg, value);
      index += 1;
    } else if (SWITCHES.has(arg)) flags.switches.add(arg);
    else if (arg.startsWith('--')) return `Unknown option: ${arg}`;
    else flags.positional.push(arg);
  }
  return flags;
}

function describe(state: EnvironmentState): string {
  const parts = [
    state.role ?? '?',
    state.url ?? 'no address',
    state.secretSource ? `secret: ${state.secretSource}` : undefined,
    state.cloudflare !== 'none' ? `cloudflare: ${state.cloudflare}` : undefined
  ].filter(Boolean);
  return `${state.name}  (${parts.join(', ')})`;
}

function printState(state: EnvironmentState, out: (text: string) => void): void {
  out(`${state.usable ? '✓' : '✗'} ${describe(state)}\n`);
  for (const problem of state.problems) out(`    ${problem.message}\n`);
}

export async function envCommand(args: readonly string[], deps: EnvDeps): Promise<number> {
  const [command, ...rest] = args;
  if (command === undefined || command === 'help' || command === '--help') {
    deps.out(`${USAGE}\n`);
    return 0;
  }
  const flags = parseFlags(rest);
  if (typeof flags === 'string') {
    deps.err(`${flags}\n`);
    return 1;
  }
  const homeDir = join(deps.home, '.config', 'vizoalica');
  const path = environmentsPath(homeDir);
  const verifyDeps: VerifyDeps = {
    version: deps.version,
    expectedSchema: expectedSchemaFrom(join(deps.assetDir, 'schema')),
    vault: deps.vault,
    ...(deps.fetch ? { fetch: deps.fetch } : {})
  };
  const loaded = readEnvironments(path);
  if (loaded.status === 'broken') {
    deps.err(`The environments file cannot be used:\n  ${path}\n${loaded.reason}\n`);
    return 1;
  }

  if (command === 'list' || command === 'check') {
    const name = flags.positional[0];
    const entries = loaded.entries.filter((entry) => name === undefined || entry.name === name);
    if (name !== undefined && entries.length === 0) {
      deps.err(`There is no environment named "${name}".\n`);
      return 1;
    }
    if (entries.length === 0) {
      deps.out(`No environments yet. Add one with: vizoalica env add <name>\n(${path})\n`);
      return command === 'check' ? 1 : 0;
    }
    const states = await Promise.all(
      entries.map((entry) =>
        'def' in entry
          ? verifyEnvironment(entry.name, entry.def, verifyDeps)
          : Promise.resolve<EnvironmentState>({
              name: entry.name,
              cloudflare: 'none',
              usable: false,
              problems: [{ code: 'invalid', message: `The entry is not valid: ${entry.problem}.` }]
            })
      )
    );
    for (const state of states) printState(state, deps.out);
    return states.every((state) => state.usable) || command === 'list' ? 0 : 1;
  }

  const name = flags.positional[0];
  if (!name || flags.positional.length > 1) {
    deps.err(`Usage: vizoalica env ${command} <name>\n`);
    return 1;
  }

  if (command === 'remove') {
    if (!loaded.entries.some((entry) => entry.name === name)) {
      deps.err(`There is no environment named "${name}".\n`);
      return 1;
    }
    if (!flags.switches.has('--yes')) {
      if (!deps.interactive) {
        deps.err('Removing needs confirmation. Add --yes to confirm.\n');
        return 1;
      }
      const answer = await deps.ask(
        `Forget "${name}" on this computer? Nothing in Cloudflare is deleted. Type the name to confirm: `
      );
      if (answer.trim() !== name) {
        deps.err('Not removed.\n');
        return 1;
      }
    }
    const rewrite = rewriteBlocker(loaded, name);
    if (rewrite) {
      deps.err(rewrite);
      return 1;
    }
    const remaining = definitionsOf(loaded);
    delete remaining[name];
    writeEnvironments(path, remaining);
    deps.out(`Removed "${name}". Nothing in Cloudflare was deleted.\n`);
    return 0;
  }

  if (command !== 'add' && command !== 'update') {
    deps.err(`Unknown command: env ${command}\n\n${USAGE}\n`);
    return 1;
  }
  return saveCommand(command, name, flags, loaded, path, deps, verifyDeps);
}

async function saveCommand(
  command: 'add' | 'update',
  name: string,
  flags: Flags,
  loaded: Extract<LoadResult, { status: 'ok' }>,
  path: string,
  deps: EnvDeps,
  verifyDeps: VerifyDeps
): Promise<number> {
  const existing = loaded.entries.find((entry) => entry.name === name);
  const current: EnvironmentDef | undefined =
    existing && 'def' in existing ? existing.def : undefined;
  if (command === 'add' && existing) {
    deps.err(`"${name}" already exists. Change it with: vizoalica env update ${name}\n`);
    return 1;
  }
  if (command === 'update' && !existing) {
    deps.err(`There is no environment named "${name}". Add it with: vizoalica env add ${name}\n`);
    return 1;
  }
  const blocked = rewriteBlocker(loaded, name);
  if (blocked) {
    deps.err(blocked);
    return 1;
  }
  if (flags.switches.has('--secret-stdin') && flags.switches.has('--cloudflare-token-stdin')) {
    deps.err('Only one value can be read from stdin. Give the other another way.\n');
    return 1;
  }

  const wantsOnecli =
    flags.switches.has('--secret-onecli') || flags.switches.has('--cloudflare-onecli');
  let onecli: OnecliRef | undefined;
  if (wantsOnecli) {
    const workspace = flags.values.get('--onecli-workspace');
    const agent = flags.values.get('--onecli-agent');
    const gateway = flags.values.get('--onecli-gateway');
    if (!workspace || !agent || !gateway) {
      deps.err('OneCLI needs --onecli-workspace, --onecli-agent, and --onecli-gateway.\n');
      return 1;
    }
    onecli = { workspace, agent, gateway };
  }

  const ask = async (question: string, secret = false): Promise<string> => {
    if (!deps.interactive)
      throw new Error(`Missing: ${question.replace(/[:?].*$/, '')}. Give it as an option.`);
    return (await deps.ask(question, { secret })).trim();
  };

  try {
    const url =
      flags.values.get('--url') ?? current?.url ?? (await ask('Worker address (https://…): '));
    let role = (flags.values.get('--role') as Role | undefined) ?? current?.role;
    if (!role) role = (await ask(`Role (${ROLES.join(', ')}): `)) as Role;
    if (!ROLES.includes(role)) throw new Error('The role must be admin, owner, or analyst.');

    let secret: EnvironmentDef['secret'] | undefined = current?.secret;
    if (flags.switches.has('--secret-stdin'))
      secret = (await deps.readStdin()).replace(/\r?\n$/, '');
    else if (flags.switches.has('--secret-onecli')) secret = { onecli: onecli! };
    else if (!secret)
      secret = await ask(
        role === 'admin' ? 'Administrator secret (hidden): ' : 'Access key (hidden): ',
        true
      );

    let cloudflare: EnvironmentDef['cloudflare'] | undefined = current?.cloudflare;
    if (flags.switches.has('--no-cloudflare')) cloudflare = undefined;
    else if (flags.switches.has('--cloudflare-token-stdin'))
      cloudflare = { token: (await deps.readStdin()).replace(/\r?\n$/, '') };
    else if (flags.switches.has('--cloudflare-onecli')) cloudflare = { token: { onecli: onecli! } };
    else if (command === 'add' && role === 'admin' && deps.interactive) {
      const token = await ask('Cloudflare API token (hidden, Enter to skip): ', true);
      if (token) cloudflare = { token };
    }
    if (role !== 'admin') cloudflare = undefined;

    const def = parseEnvironment(name, {
      url,
      role,
      secret,
      ...(cloudflare ? { cloudflare } : {})
    });

    if (!flags.switches.has('--no-verify')) {
      const state = await verifyEnvironment(name, def, verifyDeps);
      if (!state.usable) {
        deps.err(`Not saved: "${name}" does not work yet.\n`);
        for (const problem of state.problems) deps.err(`  ${problem.message}\n`);
        deps.err('Fix that and run this again, or add --no-verify to save it anyway.\n');
        return 1;
      }
    } else deps.out('Saved without checking (--no-verify).\n');

    const all = definitionsOf(loaded);
    all[name] = def;
    writeEnvironments(path, all);
    deps.out(`${command === 'add' ? 'Added' : 'Updated'} "${name}" (${def.role}, ${def.url}).\n`);
    return 0;
  } catch (error) {
    deps.err(`${error instanceof Error ? error.message : 'Something went wrong.'}\n`);
    return 1;
  }
}
