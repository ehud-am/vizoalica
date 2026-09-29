import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SECRETS, type Run } from '@vizoalica/ops-core';
import {
  addEnvironment,
  environmentsPath,
  readEnvironments,
  type EnvironmentDef
} from '../../local-ops-api/src/environments/file.js';
import { noTrace, type Trace } from '../../local-ops-api/src/trace.js';
import type { FetchLike, Vault } from '../../local-ops-api/src/environments/vault.js';
import { verifyEnvironment } from '../../local-ops-api/src/environments/verify.js';
import { expectedSchemaFrom } from '../../local-ops-api/src/setup/state.js';
import {
  chooseAccount,
  cloudflareAccess,
  rememberAccount,
  rememberedAccount,
  revealSecrets,
  secretsFileProblem
} from './cloudflare-access.js';
import { tracedAsk } from './prompt.js';
import { applyDeploy, checkAccess, DeployError, type ApplyResult } from './deploy/apply.js';
import { buildPlan, describePlan, describeUpdate } from './deploy/plan.js';
import { wranglerCommand, wranglerFor } from './deploy/wrangler.js';

export type DeployDeps = {
  home: string;
  version: string;
  assetDir: string;
  env: NodeJS.ProcessEnv;
  out: (text: string) => void;
  err: (text: string) => void;
  interactive: boolean;
  ask: (question: string, options?: { secret?: boolean }) => Promise<string>;
  readStdin: () => Promise<string>;
  vault: Vault;
  /** Tests replace Wrangler, the network, and waiting. */
  run?: Run | undefined;
  fetch?: FetchLike | undefined;
  sleep?: ((ms: number) => Promise<void>) | undefined;
  healthAttempts?: number | undefined;
  /** `--verbose`: what is happening, for troubleshooting. Never a secret or an answer. */
  trace?: Trace | undefined;
};

const USAGE = [
  'Usage: vizoalica deploy <name> [--apply | --update] [options]',
  '',
  'Creates the backend for the environment <name>: a D1 database, an R2 bucket, and a Worker, all named',
  '<name>-vizoalica-…, then adds <name> to your environments. Or updates one it created to this version.',
  '',
  '  (no option)           Show what would be created; nothing is created',
  '  --apply               Create it now in your Cloudflare account',
  '  --update              Deploy this version over the existing backend: its data and secrets are kept,',
  '                        and the database changes this version needs are applied',
  '',
  'Options for --apply and --update:',
  '  --yes                       Do not ask for confirmation (required without a terminal)',
  '  --account <id>              The Cloudflare account, when the credential can see more than one',
  '  --cloudflare-token-stdin    Read the Cloudflare API token from stdin (else $CLOUDFLARE_API_TOKEN, else asked)',
  '  --save-cloudflare           Keep the Cloudflare credential in the new environment (admin only, optional)',
  '  --secrets-file <path>       Also write every generated secret to a new private file, as a backup',
  '  --resume                    Continue after a failure: reuse the database or bucket an earlier run created',
  '',
  'Advanced: keep the Cloudflare API token in a vault (OneCLI):',
  '  --cloudflare-onecli         Run Wrangler under OneCLI, which holds the token; needs the --onecli-* options',
  '  --onecli-workspace <w> --onecli-agent <a> --onecli-gateway <host:port>',
  '',
  '--update uses the Cloudflare credential saved with the environment, if there is one.',
  '',
  'The Cloudflare API token needs: Workers Scripts: Edit, D1: Edit, Workers R2 Storage: Edit, Account Settings: Read.'
].join('\n');

const VALUE_FLAGS = new Set([
  '--account',
  '--secrets-file',
  '--onecli-workspace',
  '--onecli-agent',
  '--onecli-gateway'
]);
const SWITCHES = new Set([
  '--apply',
  '--update',
  '--yes',
  '--resume',
  '--save-cloudflare',
  '--cloudflare-token-stdin',
  '--cloudflare-onecli'
]);

type Flags = { values: Map<string, string>; switches: Set<string>; positional: string[] };

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

/** The packaged Worker, its Wrangler template, and the migrations must all be there. */
function assertAssets(assetDir: string): void {
  if (
    !existsSync(join(assetDir, 'worker', 'index.mjs')) ||
    !existsSync(join(assetDir, 'worker', 'wrangler.template.toml')) ||
    !existsSync(join(assetDir, 'schema'))
  )
    throw new Error(
      'The Worker files were not found next to this command, so it cannot deploy. Reinstall it: npm install -g vizoalica'
    );
}

export async function deployCommand(args: readonly string[], deps: DeployDeps): Promise<number> {
  if (deps.trace) deps = { ...deps, ask: tracedAsk(deps.ask, deps.trace) };
  if (args.length === 0 || args[0] === 'help' || args[0] === '--help') {
    deps.out(`${USAGE}\n`);
    return args.length === 0 ? 1 : 0;
  }
  const flags = parseFlags(args);
  if (typeof flags === 'string') {
    deps.err(`${flags}\n`);
    return 1;
  }
  const name = flags.positional[0];
  if (!name || flags.positional.length > 1) {
    deps.err('Give the environment name: vizoalica deploy <name> [--apply]\n');
    return 1;
  }
  const trace = deps.trace ?? noTrace;
  let plan;
  try {
    plan = buildPlan(name, flags.values.get('--account'));
    trace(
      `Plan for "${name}": database ${plan.names.database}, bucket ${plan.names.bucket}, Worker ${plan.names.worker}, account ${plan.accountId ?? 'not chosen yet'}`
    );
  } catch (error) {
    deps.err(`${error instanceof Error ? error.message : 'Invalid name.'}\n`);
    return 1;
  }

  const update = flags.switches.has('--update');
  if (update && (flags.switches.has('--apply') || flags.switches.has('--resume'))) {
    deps.err(
      '--update deploys over an existing backend; it does not go with --apply or --resume.\n'
    );
    return 1;
  }

  const path = environmentsPath(join(deps.home, '.config', 'vizoalica'));
  const loaded = readEnvironments(path);
  if (loaded.status === 'broken') {
    deps.err(`The environments file cannot be used:\n  ${path}\n${loaded.reason}\n`);
    return 1;
  }
  trace(`Environments file: ${path} (${loaded.entries.length} entries)`);
  const existing = loaded.entries.find((entry) => entry.name === name);
  if (existing && !update) {
    deps.err(
      `"${name}" is already an environment on this computer, so a new backend would not be added to it.\nTo deploy this version over its backend: vizoalica deploy ${name} --update\nTo create a new one, choose another name, or remove it first with: vizoalica env remove ${name}\n`
    );
    return 1;
  }
  const def = existing && 'def' in existing ? existing.def : undefined;
  if (update && def && def.role !== 'admin') {
    deps.err(
      `On this computer "${name}" is used as ${def.role}. Only its administrator can update its backend.\n`
    );
    return 1;
  }

  if (!update && !flags.switches.has('--apply')) {
    deps.out(`${describePlan(plan)}\nNothing was created. Run again with --apply to create it.\n`);
    return 0;
  }

  trace(`Packaged Worker files: ${deps.assetDir}`);
  try {
    assertAssets(deps.assetDir);
  } catch (error) {
    deps.err(`${(error as Error).message}\n`);
    return 1;
  }
  return applyCommand(name, flags, path, deps, update ? { def } : undefined);
}

/** `update` is set for --update, with this computer's definition of the environment when it has one. */
async function applyCommand(
  name: string,
  flags: Flags,
  environmentsFile: string,
  deps: DeployDeps,
  update?: { def: EnvironmentDef | undefined }
): Promise<number> {
  const secretsFile = flags.values.get('--secrets-file');
  const fileProblem = secretsFile ? secretsFileProblem(secretsFile) : undefined;
  if (fileProblem) {
    deps.err(`${fileProblem}\n`);
    return 1;
  }
  if (!deps.interactive && !flags.switches.has('--yes')) {
    deps.err('Without a terminal, confirm with --yes.\n');
    return 1;
  }

  const trace = deps.trace ?? noTrace;
  const credential = await cloudflareAccess(
    flags,
    deps,
    'Deploying needs a Cloudflare API token with Workers Scripts: Edit, D1: Edit,\nWorkers R2 Storage: Edit, and Account Settings: Read.',
    update?.def?.cloudflare?.token
  );
  if (typeof credential === 'string') {
    deps.err(`${credential}\n`);
    return 1;
  }
  const { access, onecli } = credential;
  const run = deps.run ?? wranglerFor(access, deps.env);
  trace(
    `Wrangler: ${deps.run ? '(replaced for a test)' : wranglerCommand(deps.env).join(' ')}${onecli ? ', run under OneCLI' : ''}`
  );

  try {
    deps.out('Checking Cloudflare access…\n');
    const accounts = await checkAccess(run);
    trace(
      `Cloudflare accounts this credential can see: ${accounts.map((a) => `${a.name} (${a.id})`).join(', ')}`
    );
    const remembered = update
      ? rememberedAccount(deps.home, buildPlan(name).names.worker)
      : undefined;
    const chosen = await chooseAccount(
      accounts,
      flags.values.get('--account') ??
        (remembered && accounts.some((account) => account.id === remembered)
          ? remembered
          : undefined),
      deps,
      update ? `Which one has the "${name}" backend?` : 'Which one gets the backend?'
    );
    const nothing = update ? 'Nothing was changed.' : 'Nothing was created.';
    if (typeof chosen === 'string') {
      deps.err(`${chosen} ${nothing}\n`);
      return 1;
    }
    const accountId = chosen.id;
    const plan = buildPlan(name, accountId);
    const accountName = accounts.find((account) => account.id === accountId)?.name ?? accountId;
    deps.out(
      `${update ? describeUpdate(plan, deps.version) : describePlan(plan)}\nCloudflare account: ${accountName}\n`
    );
    if (!flags.switches.has('--yes')) {
      const answer = (
        await deps.ask(
          update
            ? 'Update it now? Type "yes" to continue: '
            : 'Create these now? Type "yes" to continue: '
        )
      )
        .trim()
        .toLowerCase();
      if (answer !== 'yes') {
        deps.err(`Not confirmed. ${nothing}\n`);
        return 1;
      }
    }

    const result = await applyDeploy(
      {
        run,
        workerBundle: join(deps.assetDir, 'worker', 'index.mjs'),
        wranglerTemplate: join(deps.assetDir, 'worker', 'wrangler.template.toml'),
        schemaDir: join(deps.assetDir, 'schema'),
        version: deps.version,
        configDir: join(deps.home, '.config', 'vizoalica', 'deploy'),
        log: (line) => deps.out(`${line}\n`),
        ...(deps.trace ? { trace: deps.trace } : {}),
        ...(deps.fetch ? { fetch: deps.fetch } : {}),
        ...(deps.sleep ? { sleep: deps.sleep } : {}),
        ...(deps.healthAttempts !== undefined ? { healthAttempts: deps.healthAttempts } : {})
      },
      plan,
      update ? { update: true } : { resume: flags.switches.has('--resume') }
    );

    rememberAccount(deps.home, plan.names.worker, accountId);
    if (update)
      return await finishUpdate(name, update.def, result, secretsFile, environmentsFile, deps);

    // Register the environment; the administrator secret goes only to the private file.
    const adminSecret = result.secrets[SECRETS.admin.name];
    const revealed = { ...result.secrets };
    let registered = false;
    if (adminSecret) {
      trace(
        `Adding "${name}" to ${environmentsFile}: admin secret goes to the file, never printed`
      );
      const def: EnvironmentDef = {
        url: result.workerUrl,
        role: 'admin',
        secret: adminSecret,
        ...(flags.switches.has('--save-cloudflare')
          ? { cloudflare: { token: onecli ? { onecli } : 'token' in access ? access.token : '' } }
          : {})
      };
      try {
        addEnvironment(environmentsFile, name, def);
        registered = true;
        delete revealed[SECRETS.admin.name];
      } catch (error) {
        deps.err(
          `The backend was created, but "${name}" could not be added: ${(error as Error).message}\n`
        );
      }
    } else
      deps.err(
        `The Worker already had its secrets, so none were generated. Add it with: vizoalica env add ${name} --url ${result.workerUrl} --role admin\n`
      );

    deps.out(`\nWorker: ${result.workerUrl}\nRendered configuration: ${result.configPath}\n`);
    if (registered) {
      const check = await verifyEnvironment(
        name,
        { url: result.workerUrl, role: 'admin', secret: adminSecret! },
        {
          version: deps.version,
          expectedSchema: expectedSchemaFrom(join(deps.assetDir, 'schema')),
          vault: deps.vault,
          ...(deps.fetch ? { fetch: deps.fetch } : {}),
          ...(deps.trace ? { trace: deps.trace } : {})
        }
      );
      deps.out(
        check.usable
          ? `Backend "${name}" is saved on this computer and works. Next: vizoalica console\n`
          : `Backend "${name}" is saved on this computer, but it does not verify yet (${check.problems[0]?.message ?? 'unknown'}). Try: vizoalica env check ${name}\n`
      );
    }
    // Last, so nothing scrolls it away, and it waits until they are saved.
    const handed = handOver(revealed, secretsFile);
    await revealSecrets(handed, secretsFile, deps, name);
    if (registered) {
      if (result.secrets[SECRETS.token.name] && !handed[SECRETS.token.name])
        deps.out(
          `\nWebsites that require signed tokens need the token secret. Get it when you first need it with: vizoalica rotate ${name} token\n`
        );
      return 0;
    }
    return adminSecret ? 1 : 0;
  } catch (error) {
    trace(
      `Stopped: ${error instanceof DeployError ? `${error.step}: ` : ''}${error instanceof Error ? error.message : 'unknown error'}`
    );
    if (error instanceof DeployError) {
      deps.err(`\nStopped at: ${error.step}\n${error.message}\n`);
      if (error.hint) deps.err(`${error.hint}\n`);
      if (!update && !/already exists/.test(error.message))
        deps.err(
          `Resources already created are kept. Continue with: vizoalica deploy ${name} --apply --resume\n`
        );
      return 1;
    }
    deps.err(`${error instanceof Error ? error.message : 'Something went wrong.'}\n`);
    return 1;
  }
}

/**
 * After --update: checks this computer's environment against the updated Worker, then hands over any secret
 * the Worker was missing and got now (only after an interrupted first deploy). A new administrator secret
 * adds the environment when this computer does not have it yet.
 */
async function finishUpdate(
  name: string,
  def: EnvironmentDef | undefined,
  result: ApplyResult,
  secretsFile: string | undefined,
  environmentsFile: string,
  deps: DeployDeps
): Promise<number> {
  const revealed = { ...result.secrets };
  const adminSecret = revealed[SECRETS.admin.name];
  let current = def;
  if (!current && adminSecret) {
    current = { url: result.workerUrl, role: 'admin', secret: adminSecret };
    try {
      addEnvironment(environmentsFile, name, current);
      delete revealed[SECRETS.admin.name];
      deps.out(`"${name}" was added to your environments.\n`);
    } catch (error) {
      current = undefined;
      deps.err(`"${name}" could not be added: ${(error as Error).message}\n`);
    }
  } else if (adminSecret)
    deps.err(
      `The Worker had no administrator secret, so a new one was made (below). Save it on this computer with: vizoalica env update ${name} --secret-stdin\n`
    );
  deps.out(`\nWorker: ${result.workerUrl} is now ${deps.version}.\n`);
  if (current) {
    const check = await verifyEnvironment(name, current, {
      version: deps.version,
      expectedSchema: expectedSchemaFrom(join(deps.assetDir, 'schema')),
      vault: deps.vault,
      ...(deps.fetch ? { fetch: deps.fetch } : {}),
      ...(deps.trace ? { trace: deps.trace } : {})
    });
    deps.out(
      check.usable
        ? `Environment "${name}" works with it.\n`
        : `Environment "${name}" does not verify yet (${check.problems[0]?.message ?? 'unknown'}). Try: vizoalica env check ${name}\n`
    );
  } else
    deps.out(
      `This computer has no "${name}" environment. Add it with: vizoalica env add ${name} --url ${result.workerUrl} --role admin\n`
    );
  await revealSecrets(handOver(revealed, secretsFile), secretsFile, deps, name);
  return 0;
}

/**
 * The generated secrets the person gets. With --secrets-file, every one not saved elsewhere goes to that
 * file as a backup. Without it, only an administrator secret that could not be saved on this computer is
 * shown: the Worker keeps the token and digest secrets, and `vizoalica rotate` makes a token secret to
 * hand over when a website first needs one.
 */
function handOver(
  secrets: Record<string, string>,
  secretsFile: string | undefined
): Record<string, string> {
  if (secretsFile) return secrets;
  const admin = secrets[SECRETS.admin.name];
  return admin === undefined ? {} : { [SECRETS.admin.name]: admin };
}
