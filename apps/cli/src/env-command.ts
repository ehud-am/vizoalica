import { join } from 'node:path';
import { assertEnvironmentName } from '@vizoalica/ops-core';
import {
  definitionsOf,
  environmentsPath,
  normalizeRemoteUrl,
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
import { noTrace, type Trace } from '../../local-ops-api/src/trace.js';
import type { FetchLike, Vault } from '../../local-ops-api/src/environments/vault.js';
import { expectedSchemaFrom } from '../../local-ops-api/src/setup/state.js';
import { Cancelled, tracedAsk, type Ask } from './prompt.js';

export type EnvDeps = {
  home: string;
  version: string;
  assetDir: string;
  out: (text: string) => void;
  err: (text: string) => void;
  /** Whether questions can be asked; without a terminal, everything must come from flags or stdin. */
  interactive: boolean;
  /** Asks one question. Lines before the last explain it; the last line is the prompt. */
  ask: Ask;
  readStdin: () => Promise<string>;
  vault: Vault;
  /** Runs `vizoalica deploy <args>`; lets `env add` offer to create the backend. */
  deploy?: ((args: string[]) => Promise<number>) | undefined;
  /** `--verbose`: what is happening, for troubleshooting. Never a secret or an answer. */
  trace?: Trace | undefined;
  /** Tests replace the network. */
  fetch?: FetchLike;
};

const USAGE = [
  'Usage: vizoalica env <command>',
  '',
  '  list                     Show every environment and whether it works',
  '  add [name]               Create an environment: deploys its backend now if you say so,',
  '                           or connects it to a backend that already exists',
  '  update <name>            Change an environment',
  '  remove <name> [--yes]    Forget an environment (nothing in Cloudflare is deleted)',
  '  check [name]             Verify one or all environments; fails if one is unusable',
  '',
  'Options for add and update:',
  '  --deploy                  add: create the backend now (else asked; --url means it exists already)',
  '  --connect                 add: the backend already exists (else asked; needs --url)',
  '  --onecli | --no-onecli    Let OneCLI hold the secrets, or keep them in a private file (else asked)',
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
  'With --deploy, these are passed to "vizoalica deploy": --yes, --account, --secrets-file,',
  '--resume, --save-cloudflare, --cloudflare-token-stdin. In a terminal, add asks for anything',
  'not given as an option, explaining each question. Add --verbose to see each step.',
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
  '--account',
  '--secrets-file',
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
  '--yes',
  '--deploy',
  '--connect',
  '--onecli',
  '--no-onecli',
  '--resume',
  '--save-cloudflare'
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
  const trace = deps.trace ?? noTrace;
  if (deps.trace) deps = { ...deps, ask: tracedAsk(deps.ask, deps.trace) };
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
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
    ...(deps.trace ? { trace: deps.trace } : {})
  };
  const loaded = readEnvironments(path);
  if (loaded.status === 'broken') {
    trace(`The environments file is broken: ${loaded.reason}`);
    deps.err(`The environments file cannot be used:\n  ${path}\n${loaded.reason}\n`);
    return 1;
  }
  trace(
    `Environments file: ${path} (${loaded.entries.length === 0 ? 'no entries yet' : loaded.entries.map((entry) => entry.name).join(', ')})`
  );
  trace(
    `Expected database schema: ${verifyDeps.expectedSchema ?? 'unknown'}; running: env ${command}`
  );

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

  if (command === 'add' || command === 'update') {
    try {
      return await saveCommand(command, flags, loaded, path, deps, verifyDeps);
    } catch (error) {
      if (error instanceof Cancelled) {
        deps.err(`\n${error.message}\n`);
        return 130;
      }
      deps.err(`${error instanceof Error ? error.message : 'Something went wrong.'}\n`);
      return 1;
    }
  }

  const name = flags.positional[0];
  if (!name || flags.positional.length > 1) {
    deps.err(`Usage: vizoalica env ${command} <name>\n`);
    return 1;
  }
  if (command !== 'remove') {
    deps.err(`Unknown command: env ${command}\n\n${USAGE}\n`);
    return 1;
  }
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

/** A wrong answer is asked again; after this many, the command gives up. */
const MAX_TRIES = 5;

/** One missing value: what it is for, how to answer, and the option that gives it without a terminal. */
type Question = {
  /** Names the value in "Missing …" when there is no terminal. */
  label: string;
  /** Printed on the lines above the prompt: what the value is and where to find it. */
  about: string;
  prompt: string;
  option: string;
  secret?: boolean;
  /** Used for an empty answer; without one, an answer is required. */
  fallback?: string;
  /** What is wrong with an answer, which is then asked for again. */
  check?: (answer: string) => string | undefined;
};

type YesNo = Pick<Question, 'label' | 'about' | 'prompt' | 'option'>;

function asker(deps: EnvDeps) {
  const value = async (question: Question): Promise<string> => {
    if (!deps.interactive)
      throw new Error(`Missing ${question.label}. Give it with ${question.option}.`);
    for (let attempt = 0; attempt < MAX_TRIES; attempt += 1) {
      const text = attempt === 0 ? `\n${question.about}\n${question.prompt}` : question.prompt;
      const answer = (await deps.ask(text, { secret: question.secret === true })).trim();
      const chosen = answer === '' ? (question.fallback ?? '') : answer;
      const problem =
        chosen === '' && question.fallback === undefined
          ? 'An answer is needed.'
          : question.check?.(chosen);
      if (problem === undefined) return chosen;
      deps.err(`  ${problem}\n`);
    }
    throw new Error(`No usable answer for ${question.label}, so nothing was changed.`);
  };
  const yesNo = async (question: YesNo, fallback: boolean): Promise<boolean> => {
    const answer = await value({
      ...question,
      prompt: `${question.prompt} (${fallback ? 'Y/n' : 'y/N'}): `,
      fallback: fallback ? 'y' : 'n',
      check: (answer) => (/^(y|yes|n|no)$/i.test(answer) ? undefined : 'Answer y or n.')
    });
    return /^y/i.test(answer);
  };
  return { value, yesNo };
}

function nameProblem(name: string, loaded: Extract<LoadResult, { status: 'ok' }>) {
  try {
    assertEnvironmentName(name);
  } catch (error) {
    return (error as Error).message;
  }
  return loaded.entries.some((entry) => entry.name === name)
    ? `"${name}" already exists. Choose another name, or change it with: vizoalica env update ${name}`
    : undefined;
}

function urlProblem(url: string): string | undefined {
  try {
    normalizeRemoteUrl(url);
    return undefined;
  } catch (error) {
    return `The address ${(error as Error).message}.`;
  }
}

function parseRole(answer: string): Role | undefined {
  const lower = answer.trim().toLowerCase();
  if (/^\d+$/.test(lower)) return ROLES[Number(lower) - 1];
  return ROLES.find((role) => role === lower);
}

const wordProblem = (answer: string) =>
  /\s/.test(answer) ? 'It is one word, with no spaces.' : undefined;
const gatewayProblem = (answer: string) =>
  /^[^\s:/]+:\d{1,5}$/.test(answer)
    ? undefined
    : 'Give it as host:port, for example localhost:10255.';

const DEPLOY_ONLY = ['--account', '--secrets-file', '--resume', '--save-cloudflare'] as const;
const ONECLI_VALUES = ['--onecli-workspace', '--onecli-agent', '--onecli-gateway'] as const;

/** Options that cannot be given together, found before anything is asked. */
function conflict(command: 'add' | 'update', flags: Flags): string | undefined {
  const has = (flag: string) => flags.switches.has(flag) || flags.values.has(flag);
  const pairs: [string, string][] = [
    ['--deploy', '--connect'],
    ['--onecli', '--no-onecli'],
    ['--no-onecli', '--secret-onecli'],
    ['--no-onecli', '--cloudflare-onecli'],
    ['--secret-stdin', '--secret-onecli'],
    ['--secret-stdin', '--onecli'],
    ['--cloudflare-token-stdin', '--cloudflare-onecli'],
    ['--no-cloudflare', '--cloudflare-token-stdin'],
    ['--no-cloudflare', '--cloudflare-onecli']
  ];
  for (const [a, b] of pairs) if (has(a) && has(b)) return `Choose one of ${a} and ${b}.`;
  if (has('--secret-stdin') && has('--cloudflare-token-stdin'))
    return 'Only one value can be read from stdin. Give the other another way.';
  if (command === 'update') {
    for (const flag of ['--deploy', '--connect', ...DEPLOY_ONLY])
      if (has(flag)) return `${flag} is only for env add.`;
    if (
      ONECLI_VALUES.some(has) &&
      !has('--onecli') &&
      !has('--secret-onecli') &&
      !has('--cloudflare-onecli')
    )
      return 'Say what OneCLI holds: --secret-onecli (or --onecli) for the secret, --cloudflare-onecli for the Cloudflare token.';
  }
  if (has('--deploy')) {
    if (has('--url'))
      return '--deploy creates a new backend, so it has no --url. Use --connect with --url.';
    for (const flag of ['--secret-stdin', '--secret-onecli', '--no-cloudflare'])
      if (has(flag))
        return `--deploy generates the secret and makes you the administrator, so it takes no ${flag}.`;
    if (flags.values.has('--role') && parseRole(flags.values.get('--role')!) !== 'admin')
      return '--deploy makes you the administrator, so the role is admin.';
  }
  if (has('--no-onecli') && ONECLI_VALUES.some(has))
    return '--no-onecli cannot be given with the --onecli-* options.';
  return undefined;
}

async function saveCommand(
  command: 'add' | 'update',
  flags: Flags,
  loaded: Extract<LoadResult, { status: 'ok' }>,
  path: string,
  deps: EnvDeps,
  verifyDeps: VerifyDeps
): Promise<number> {
  const trace = deps.trace ?? noTrace;
  const has = (flag: string) => flags.switches.has(flag);
  const ask = asker(deps);
  if (flags.positional.length > 1) {
    deps.err(`Usage: vizoalica env ${command} <name>\n`);
    return 1;
  }
  const clash = conflict(command, flags);
  if (clash) {
    deps.err(`${clash}\n`);
    return 1;
  }

  // The name: given, or asked (add only).
  let name = flags.positional[0];
  if (name === undefined) {
    if (command === 'update' || !deps.interactive) {
      deps.err(`Usage: vizoalica env ${command} <name>\n`);
      return 1;
    }
    name = await ask.value({
      label: 'the environment name',
      about:
        'Name this environment, for example dev, stage, or prod. It names its backend in Cloudflare too.\nLowercase letters, digits, and dashes, starting with a letter.',
      prompt: 'Environment name: ',
      option: '<name>',
      check: (answer) => nameProblem(answer, loaded)
    });
  }
  const existing = loaded.entries.find((entry) => entry.name === name);
  if (command === 'add') {
    const problem = nameProblem(name, loaded);
    if (problem) {
      deps.err(`${problem}\n`);
      return 1;
    }
  } else if (!existing) {
    deps.err(`There is no environment named "${name}". Add it with: vizoalica env add ${name}\n`);
    return 1;
  }
  const blocked = rewriteBlocker(loaded, name);
  if (blocked) {
    deps.err(blocked);
    return 1;
  }
  const current = existing && 'def' in existing ? existing.def : undefined;

  // Where OneCLI is: the options, else asked once, the first time it is needed.
  let onecli: OnecliRef | undefined;
  const onecliRef = async (): Promise<OnecliRef> => {
    if (onecli) return onecli;
    const about =
      'OneCLI keeps the secret in its local vault and hands it over when it is needed, so it is never\nsaved on this computer by Vizoalica. Say which OneCLI workspace and agent hold it.';
    let explained = false;
    const next = async (question: Omit<Question, 'about'> & { about: string }) => {
      const flag = question.option.split(' ')[0]!;
      const given = flags.values.get(flag);
      if (given !== undefined) {
        const problem = question.check?.(given);
        if (problem) throw new Error(`${flag}: ${problem}`);
        return given;
      }
      const answer = await ask.value({
        ...question,
        about: explained ? question.about : `${about}\n${question.about}`
      });
      explained = true;
      return answer;
    };
    onecli = {
      workspace: await next({
        label: 'the OneCLI workspace',
        about: 'The workspace (OneCLI calls it a project) that holds the secret.',
        prompt: 'OneCLI workspace: ',
        option: '--onecli-workspace <w>',
        check: wordProblem
      }),
      agent: await next({
        label: 'the OneCLI agent',
        about: 'The OneCLI agent allowed to use the secret.',
        prompt: 'OneCLI agent: ',
        option: '--onecli-agent <a>',
        check: wordProblem
      }),
      gateway: await next({
        label: 'the OneCLI gateway',
        about: 'Where the OneCLI gateway listens. Press Enter for localhost:10255.',
        prompt: 'OneCLI gateway (host:port) [localhost:10255]: ',
        option: '--onecli-gateway <host:port>',
        fallback: 'localhost:10255',
        check: gatewayProblem
      })
    };
    trace(
      `OneCLI: workspace ${onecli.workspace}, agent ${onecli.agent}, gateway ${onecli.gateway}`
    );
    return onecli;
  };
  // Giving the --onecli-* options to add means OneCLI holds the secrets.
  const onecliChosen =
    has('--onecli') || (command === 'add' && ONECLI_VALUES.some((flag) => flags.values.has(flag)));

  const fromStdin = async (what: string): Promise<string> => {
    if (deps.interactive) deps.out(`Reading the ${what} from stdin; end it with Ctrl-D.\n`);
    const value = (await deps.readStdin()).replace(/\r?\n$/, '');
    if (!value.trim()) throw new Error(`Nothing was read from stdin for the ${what}.`);
    return value;
  };

  // Deploy a new backend, or connect to one that exists.
  let deploying = false;
  if (command === 'add') {
    if (has('--deploy')) deploying = true;
    else if (has('--connect') || flags.values.has('--url')) deploying = false;
    else if (!deps.interactive) {
      deps.err(
        'Say where the backend is: --deploy to create it now, or --connect --url <address> for one that exists.\n'
      );
      return 1;
    } else if (!deps.deploy) deploying = false;
    else
      deploying = await ask.yesNo(
        {
          label: 'whether to deploy',
          about: `"${name}" needs a backend in your Cloudflare account: a Worker, a D1 database, and an R2 bucket.\nYes creates them now. No connects "${name}" to a backend that already exists (yours or a\nteammate's); you then give its address, your role, and your secret.`,
          prompt: `Deploy a new backend for "${name}" now?`,
          option: '--deploy or --connect'
        },
        true
      );
    if (deploying && !deps.deploy) throw new Error('Deploying is not available here.');
    trace(
      deploying
        ? `Deploying a new backend for "${name}"`
        : `Connecting "${name}" to an existing backend`
    );
  }
  if (!deploying) {
    const unused = DEPLOY_ONLY.find((flag) => flags.values.has(flag) || has(flag));
    if (unused) throw new Error(`${unused} is only used with --deploy.`);
  }

  if (deploying) {
    let useOnecli = onecliChosen || has('--cloudflare-onecli');
    if (!useOnecli && !has('--no-onecli') && !has('--cloudflare-token-stdin') && deps.interactive)
      useOnecli = await ask.yesNo(
        {
          label: 'whether OneCLI holds the Cloudflare API token',
          about:
            'Deploying needs a Cloudflare API token. OneCLI can hold it, so you never paste it here\n(recommended if you use OneCLI). Otherwise you paste it next, hidden, or it is read from\nCLOUDFLARE_API_TOKEN.',
          prompt: 'Should OneCLI hold your Cloudflare API token?',
          option: '--onecli or --no-onecli'
        },
        true
      );
    const ref = useOnecli ? await onecliRef() : undefined;
    trace(
      ref
        ? 'The Cloudflare API token is held by OneCLI'
        : 'The Cloudflare API token is not in OneCLI'
    );
    const pass = (flag: string): string[] =>
      flags.values.has(flag) ? [flag, flags.values.get(flag)!] : [];
    const carry = (flag: string): string[] => (has(flag) ? [flag] : []);
    const deployArgs = [
      name,
      '--apply',
      ...carry('--yes'),
      ...carry('--resume'),
      ...carry('--save-cloudflare'),
      ...carry('--cloudflare-token-stdin'),
      ...pass('--account'),
      ...pass('--secrets-file'),
      ...(ref
        ? [
            '--cloudflare-onecli',
            '--onecli-workspace',
            ref.workspace,
            '--onecli-agent',
            ref.agent,
            '--onecli-gateway',
            ref.gateway
          ]
        : [])
    ];
    trace(`Handing over to: vizoalica deploy ${deployArgs.join(' ')}`);
    return await deps.deploy!(deployArgs);
  }

  // The address.
  const urlFlag = flags.values.get('--url');
  if (urlFlag !== undefined && urlProblem(urlFlag))
    throw new Error(`--url: ${urlProblem(urlFlag)}`);
  const url =
    urlFlag ??
    current?.url ??
    (await ask.value({
      label: 'the Worker address',
      about: `The address of the "${name}" backend's Worker: its workers.dev address, or your own domain.\nJust the address, with no path, for example https://analytics.example.com.`,
      prompt: 'Worker address (https://…): ',
      option: '--url <https-address>',
      check: urlProblem
    }));

  // The role.
  const roleFlag = flags.values.get('--role');
  const flagRole = roleFlag === undefined ? undefined : parseRole(roleFlag);
  if (roleFlag !== undefined && !flagRole)
    throw new Error('--role must be admin, owner, or analyst.');
  const role: Role =
    flagRole ??
    current?.role ??
    parseRole(
      await ask.value({
        label: 'the role',
        about:
          'Your role on this backend decides which secret you give next:\n  1) admin    you run the backend and hold its administrator secret\n  2) owner    a website owner, with an access key\n  3) analyst  you read results, with an access key',
        prompt: 'Role (1-3, or admin, owner, analyst): ',
        option: '--role admin|owner|analyst',
        check: (answer) => (parseRole(answer) ? undefined : 'Type 1, 2, or 3, or the role name.')
      })
    )!;

  // The secret: stdin, OneCLI, kept (update), or asked.
  const secretName = role === 'admin' ? 'administrator secret' : 'access key';
  let secret: EnvironmentDef['secret'] | undefined = current?.secret;
  if (has('--secret-stdin')) secret = await fromStdin(secretName);
  else if (has('--secret-onecli') || onecliChosen) secret = { onecli: await onecliRef() };
  else if (secret === undefined) {
    const useOnecli =
      !has('--no-onecli') &&
      deps.interactive &&
      (await ask.yesNo(
        {
          label: `where the ${secretName} is`,
          about: `OneCLI can hold the ${secretName}, so it is never saved on this computer (recommended if\nyou use OneCLI and it already holds it). Otherwise you paste it next and it is kept in a file\nonly you can read.`,
          prompt: `Does OneCLI hold the ${secretName}?`,
          option: '--secret-onecli or --secret-stdin'
        },
        true
      ));
    secret = useOnecli
      ? { onecli: await onecliRef() }
      : await ask.value({
          label: `the ${secretName}`,
          about:
            role === 'admin'
              ? 'The administrator secret of this backend. Whoever deployed it has it in their\n~/.config/vizoalica/environments.json. Nothing is shown as you type or paste.'
              : `The ${role} access key an administrator made for you. Nothing is shown as you type or paste.`,
          prompt: role === 'admin' ? 'Administrator secret (hidden): ' : 'Access key (hidden): ',
          option: '--secret-stdin or --secret-onecli',
          secret: true,
          check: (answer) =>
            answer.length > 512 ? 'That is too long to be the secret.' : undefined
        });
  }
  trace(
    typeof secret === 'string'
      ? 'The secret is kept in the private file (not OneCLI)'
      : 'The secret is held by OneCLI'
  );

  // The Cloudflare API token: admin only, optional.
  const cloudflareFlag = ['--cloudflare-token-stdin', '--cloudflare-onecli'].find(has);
  if (cloudflareFlag && role !== 'admin')
    throw new Error(`${cloudflareFlag} is only for the admin role.`);
  let cloudflare: EnvironmentDef['cloudflare'] | undefined = current?.cloudflare;
  if (has('--no-cloudflare')) cloudflare = undefined;
  else if (has('--cloudflare-token-stdin'))
    cloudflare = { token: await fromStdin('Cloudflare API token') };
  else if (has('--cloudflare-onecli')) cloudflare = { token: { onecli: await onecliRef() } };
  else if (command === 'add' && role === 'admin' && deps.interactive) {
    const about =
      'Optional: a Cloudflare API token lets the console check and manage the Cloudflare side of this\nbackend. You can add it later with: vizoalica env update ' +
      name;
    if (onecli) {
      if (
        await ask.yesNo(
          {
            label: 'the Cloudflare API token',
            about,
            prompt: 'Does OneCLI hold a Cloudflare API token for it too?',
            option: '--cloudflare-onecli'
          },
          false
        )
      )
        cloudflare = { token: { onecli } };
    } else {
      const token = await ask.value({
        label: 'the Cloudflare API token',
        about: `${about}\nPress Enter to skip. Nothing is shown as you type or paste.`,
        prompt: 'Cloudflare API token (hidden, Enter to skip): ',
        option: '--cloudflare-token-stdin',
        secret: true,
        fallback: ''
      });
      if (token) cloudflare = { token };
    }
  }
  if (role !== 'admin') cloudflare = undefined;

  const def = parseEnvironment(name, {
    url,
    role,
    secret,
    ...(cloudflare ? { cloudflare } : {})
  });

  trace(
    `Address ${def.url}, role ${role}${has('--no-verify') ? ', not verifying (--no-verify)' : ''}`
  );
  if (!has('--no-verify')) {
    deps.out(`Checking "${name}" against its Worker…\n`);
    const state = await verifyEnvironment(name, def, verifyDeps);
    if (!state.usable) {
      const problems = state.problems.map((problem) => `  ${problem.message}\n`).join('');
      if (!deps.interactive) {
        deps.err(`Not saved: "${name}" does not work yet.\n${problems}`);
        deps.err('Fix that and run this again, or add --no-verify to save it anyway.\n');
        return 1;
      }
      deps.err(`"${name}" does not work yet:\n${problems}`);
      const save = await ask.yesNo(
        {
          label: 'whether to save anyway',
          about: `You can save it anyway and fix it later with: vizoalica env update ${name}\nUntil then it is listed as not working.`,
          prompt: `Save "${name}" anyway?`,
          option: '--no-verify'
        },
        false
      );
      if (!save) {
        deps.err('Not saved. Fix that and run this again.\n');
        return 1;
      }
    }
  } else deps.out('Saved without checking (--no-verify).\n');

  const all = definitionsOf(loaded);
  all[name] = def;
  writeEnvironments(path, all);
  trace(`Wrote ${path} (readable only by you), now ${Object.keys(all).length} environment(s)`);
  deps.out(`${command === 'add' ? 'Added' : 'Updated'} "${name}" (${def.role}, ${def.url}).\n`);
  return 0;
}
