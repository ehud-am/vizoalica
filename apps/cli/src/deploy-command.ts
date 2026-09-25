import { chmodSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SECRETS, type Run } from '@vizoalica/ops-core';
import {
  addEnvironment,
  environmentsPath,
  readEnvironments,
  type EnvironmentDef,
  type OnecliRef
} from '../../local-ops-api/src/environments/file.js';
import { noTrace, type Trace } from '../../local-ops-api/src/trace.js';
import type { FetchLike, Vault } from '../../local-ops-api/src/environments/vault.js';
import { verifyEnvironment } from '../../local-ops-api/src/environments/verify.js';
import { expectedSchemaFrom } from '../../local-ops-api/src/setup/state.js';
import { tracedAsk } from './prompt.js';
import { applyDeploy, checkAccess, DeployError } from './deploy/apply.js';
import { buildPlan, describePlan } from './deploy/plan.js';
import { wranglerCommand, wranglerFor, type CloudflareAccess } from './deploy/wrangler.js';

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
  'Usage: vizoalica deploy <name> [--apply] [options]',
  '',
  'Creates the backend for the environment <name>: a D1 database, an R2 bucket, and a Worker, all named',
  '<name>-vizoalica-…, then adds <name> to your environments.',
  '',
  '  (no option)           Show what would be created; nothing is created',
  '  --apply               Create it now in your Cloudflare account',
  '',
  'Options for --apply:',
  '  --yes                       Do not ask for confirmation (required without a terminal)',
  '  --account <id>              The Cloudflare account, when the credential can see more than one',
  '  --cloudflare-token-stdin    Read the Cloudflare API token from stdin (else $CLOUDFLARE_API_TOKEN, else asked)',
  '  --cloudflare-onecli         Run Wrangler under OneCLI, which holds the token; needs the --onecli-* options',
  '  --onecli-workspace <w> --onecli-agent <a> --onecli-gateway <host:port>',
  '  --save-cloudflare           Keep the Cloudflare credential in the new environment (admin only, optional)',
  '  --secrets-file <path>       Write the token and digest secrets to a new private file instead of printing them',
  '  --resume                    Continue after a failure: reuse the database or bucket an earlier run created',
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

  const path = environmentsPath(join(deps.home, '.config', 'vizoalica'));
  const loaded = readEnvironments(path);
  if (loaded.status === 'broken') {
    deps.err(`The environments file cannot be used:\n  ${path}\n${loaded.reason}\n`);
    return 1;
  }
  trace(`Environments file: ${path} (${loaded.entries.length} entries)`);
  if (loaded.entries.some((entry) => entry.name === name)) {
    deps.err(
      `"${name}" is already an environment on this computer, so a new backend would not be added to it.\nChoose another name, or remove it first with: vizoalica env remove ${name}\n`
    );
    return 1;
  }

  if (!flags.switches.has('--apply')) {
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
  return applyCommand(name, flags, path, deps);
}

async function applyCommand(
  name: string,
  flags: Flags,
  environmentsFile: string,
  deps: DeployDeps
): Promise<number> {
  const secretsFile = flags.values.get('--secrets-file');
  if (secretsFile && existsSync(secretsFile)) {
    deps.err(`${secretsFile} already exists. Choose a new file so nothing is overwritten.\n`);
    return 1;
  }
  if (!deps.interactive && !secretsFile) {
    deps.err(
      'The generated secrets are shown once. Without a terminal, say where to put them: --secrets-file <new file>.\n'
    );
    return 1;
  }
  if (!deps.interactive && !flags.switches.has('--yes')) {
    deps.err('Without a terminal, confirm with --yes.\n');
    return 1;
  }

  const trace = deps.trace ?? noTrace;
  // The Cloudflare credential: stdin, OneCLI, the environment variable, or a hidden prompt.
  let access: CloudflareAccess;
  let onecli: OnecliRef | undefined;
  if (flags.switches.has('--cloudflare-onecli')) {
    const workspace = flags.values.get('--onecli-workspace');
    const agent = flags.values.get('--onecli-agent');
    const gateway = flags.values.get('--onecli-gateway');
    if (!workspace || !agent || !gateway) {
      deps.err('OneCLI needs --onecli-workspace, --onecli-agent, and --onecli-gateway.\n');
      return 1;
    }
    onecli = { workspace, agent, gateway };
    access = { onecli };
    trace(
      `Cloudflare credential: held by OneCLI (workspace ${workspace}, agent ${agent}, gateway ${gateway})`
    );
  } else {
    let token: string | undefined;
    if (flags.switches.has('--cloudflare-token-stdin')) {
      trace('Cloudflare credential: an API token read from stdin');
      token = (await deps.readStdin()).replace(/\r?\n$/, '').trim();
    } else if (deps.env.CLOUDFLARE_API_TOKEN?.trim()) {
      trace('Cloudflare credential: the CLOUDFLARE_API_TOKEN environment variable');
      token = deps.env.CLOUDFLARE_API_TOKEN.trim();
    } else if (deps.interactive)
      token = (
        await deps.ask(
          '\nDeploying needs a Cloudflare API token with Workers Scripts: Edit, D1: Edit,\nWorkers R2 Storage: Edit, and Account Settings: Read. Paste it here; it is not shown.\nCloudflare API token: ',
          { secret: true }
        )
      ).trim();
    if (!token) {
      deps.err(
        'A Cloudflare API token is needed: pipe it with --cloudflare-token-stdin, set CLOUDFLARE_API_TOKEN, or use --cloudflare-onecli.\n'
      );
      return 1;
    }
    access = { token };
  }
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
    let accountId = flags.values.get('--account');
    if (accountId && !accounts.some((account) => account.id === accountId)) {
      deps.err(
        `That token cannot see the account ${accountId}. It can see: ${accounts.map((a) => `${a.name} (${a.id})`).join(', ')}\n`
      );
      return 1;
    }
    if (!accountId) {
      if (accounts.length === 1) accountId = accounts[0]!.id;
      else if (deps.interactive) {
        const list = accounts
          .map((account, index) => `  ${index + 1}) ${account.name} (${account.id})`)
          .join('\n');
        for (let attempt = 0; attempt < 5 && !accountId; attempt += 1) {
          const answer = (
            await deps.ask(
              attempt === 0
                ? `\nThis token can see several Cloudflare accounts. Which one gets the backend?\n${list}\nAccount number: `
                : 'Account number: '
            )
          ).trim();
          accountId = accounts[Number(answer) - 1]?.id;
          if (!accountId) deps.err(`  Type a number from 1 to ${accounts.length}.\n`);
        }
      } else {
        deps.err(
          `This token can see several accounts; choose one with --account: ${accounts.map((a) => `${a.name} (${a.id})`).join(', ')}\n`
        );
        return 1;
      }
    }
    if (!accountId) {
      deps.err('No account chosen. Nothing was created.\n');
      return 1;
    }
    const plan = buildPlan(name, accountId);
    const accountName = accounts.find((account) => account.id === accountId)?.name ?? accountId;
    deps.out(`${describePlan(plan)}\nCloudflare account: ${accountName}\n`);
    if (!flags.switches.has('--yes')) {
      const answer = (await deps.ask('Create these now? Type "yes" to continue: '))
        .trim()
        .toLowerCase();
      if (answer !== 'yes') {
        deps.err('Not confirmed. Nothing was created.\n');
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
      { resume: flags.switches.has('--resume') }
    );

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

    if (Object.keys(revealed).length > 0) {
      const lines = Object.entries(revealed).map(([key, value]) => `${key}=${value}`);
      if (secretsFile) {
        writeFileSync(secretsFile, `${lines.join('\n')}\n`, { mode: 0o600, flag: 'wx' });
        chmodSync(secretsFile, 0o600);
        deps.out(
          `\nSecrets written to ${secretsFile} (readable only by you). Move them to a password manager.\n`
        );
      } else
        deps.out(
          `\nSave these now, in a password manager. They are shown only once:\n${lines.map((line) => `  ${line}`).join('\n')}\n`
        );
    }
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
          ? `Environment "${name}" was added and works. Next: vizoalica console\n`
          : `Environment "${name}" was added, but it does not verify yet (${check.problems[0]?.message ?? 'unknown'}). Try: vizoalica env check ${name}\n`
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
      if (!/already exists/.test(error.message))
        deps.err(
          `Resources already created are kept. Continue with: vizoalica deploy ${name} --apply --resume\n`
        );
      return 1;
    }
    deps.err(`${error instanceof Error ? error.message : 'Something went wrong.'}\n`);
    return 1;
  }
}
