import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  SECRETS,
  SECRET_KINDS,
  defaultNames,
  generateSecrets,
  parseSecretKind,
  type SecretKind
} from '@vizoalica/ops-core';
import {
  definitionsOf,
  environmentsPath,
  readEnvironments,
  rewriteBlocker,
  writeEnvironments
} from '../../local-ops-api/src/environments/file.js';
import { verifyEnvironment } from '../../local-ops-api/src/environments/verify.js';
import { noTrace } from '../../local-ops-api/src/trace.js';
import { expectedSchemaFrom } from '../../local-ops-api/src/setup/state.js';
import { chooseAccount, cloudflareAccess, revealSecrets } from './cloudflare-access.js';
import type { DeployDeps } from './deploy-command.js';
import { checkAccess, DeployError } from './deploy/apply.js';
import { wranglerCommand, wranglerFor } from './deploy/wrangler.js';
import { tracedAsk } from './prompt.js';

const USAGE = [
  'Usage: vizoalica rotate <environment> <admin|token|digest|all> [options]',
  '',
  'Replaces a secret of an environment’s backend with a new one: the Worker gets the new value at once,',
  'and the old one stops working.',
  '',
  '  admin    VIZOALICA_ADMIN_SECRET: this computer’s environment is updated for you',
  '  token    VIZOALICA_TOKEN_SECRET: every website’s token endpoint needs the new value',
  '  digest   VIZOALICA_ANALYTICS_DIGEST_SECRET: unique-visitor counts restart',
  '  all      all three',
  '',
  'Options:',
  '  --yes                       Do not ask for confirmation (required without a terminal)',
  '  --secrets-file <path>       Write the new secrets to a new private file instead of showing them',
  '  --account <id>              The Cloudflare account, when the credential can see more than one',
  '  --worker <name>             The Worker, when it cannot be worked out from the environment',
  '  --cloudflare-token-stdin    Read the Cloudflare API token from stdin (else the one saved with the',
  '                              environment, else $CLOUDFLARE_API_TOKEN, else asked)',
  '  --cloudflare-onecli         OneCLI holds the Cloudflare API token; needs the --onecli-* options',
  '  --onecli-workspace <w> --onecli-agent <a> --onecli-gateway <host:port>',
  '',
  'The Cloudflare API token needs Workers Scripts: Edit.'
].join('\n');

const VALUE_FLAGS = new Set([
  '--account',
  '--secrets-file',
  '--worker',
  '--onecli-workspace',
  '--onecli-agent',
  '--onecli-gateway'
]);
const SWITCHES = new Set(['--yes', '--cloudflare-token-stdin', '--cloudflare-onecli']);

/** What changes for whom when each secret is replaced. */
function impact(kind: SecretKind, environment: string, inOnecli: boolean): string[] {
  if (kind === 'admin')
    return [
      inOnecli
        ? 'OneCLI holds it for this computer: replace it in OneCLI with the new value shown next.'
        : `This computer’s "${environment}" environment is updated for you.`,
      `Anyone else using "${environment}" as admin needs the new value: vizoalica env update ${environment} --secret-stdin`
    ];
  if (kind === 'token')
    return [
      'Every website’s token endpoint must get the new value, or its visitors’ events are rejected until',
      'it does: update the VIZOALICA_TOKEN_SECRET GitHub secret of each website, then re-run its deploy',
      'workflow (it copies the value to Cloudflare Pages).'
    ];
  return [
    'Unique-visitor counts restart: visitors seen before count as new once more.',
    'No events or history are lost, and nothing else needs updating.'
  ];
}

function parseFlags(args: readonly string[]) {
  const flags = {
    values: new Map<string, string>(),
    switches: new Set<string>(),
    positional: [] as string[]
  };
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

export async function rotateCommand(args: readonly string[], deps: DeployDeps): Promise<number> {
  if (deps.trace) deps = { ...deps, ask: tracedAsk(deps.ask, deps.trace) };
  const trace = deps.trace ?? noTrace;
  if (args.length === 0 || args[0] === 'help' || args[0] === '--help') {
    deps.out(`${USAGE}\n`);
    return args.length === 0 ? 1 : 0;
  }
  const flags = parseFlags(args);
  if (typeof flags === 'string') {
    deps.err(`${flags}\n`);
    return 1;
  }
  const [name, which, ...extra] = flags.positional;
  const kind = parseSecretKind(which);
  if (!name || !kind || extra.length > 0) {
    deps.err(
      `Say which environment and which secret: vizoalica rotate <environment> <admin|token|digest|all>\n`
    );
    return 1;
  }
  const kinds: SecretKind[] = kind === 'all' ? [...SECRET_KINDS] : [kind];

  const path = environmentsPath(join(deps.home, '.config', 'vizoalica'));
  const loaded = readEnvironments(path);
  if (loaded.status === 'broken') {
    deps.err(`The environments file cannot be used:\n  ${path}\n${loaded.reason}\n`);
    return 1;
  }
  const entry = loaded.entries.find((item) => item.name === name);
  if (!entry || !('def' in entry)) {
    deps.err(
      entry
        ? `"${name}" is not a valid environment: ${entry.problem}. Fix it first.\n`
        : `There is no environment named "${name}". See them with: vizoalica env list\n`
    );
    return 1;
  }
  const def = entry.def;
  if (def.role !== 'admin') {
    deps.err(
      `On this computer "${name}" is used as ${def.role}. Only its administrator can rotate its secrets.\n`
    );
    return 1;
  }
  const adminInFile = typeof def.secret === 'string';
  if (kinds.includes('admin') && adminInFile) {
    const blocked = rewriteBlocker(loaded, name);
    if (blocked) {
      deps.err(`${blocked}Nothing was rotated.\n`);
      return 1;
    }
  }

  // Which Worker: the configuration `vizoalica deploy` kept, --worker, or the workers.dev address.
  const names = defaultNames(name);
  const kept = join(deps.home, '.config', 'vizoalica', 'deploy', names.worker, 'wrangler.toml');
  const host = new URL(def.url).hostname;
  const worker =
    flags.values.get('--worker') ??
    (existsSync(kept)
      ? names.worker
      : host.endsWith('.workers.dev')
        ? host.split('.')[0]
        : undefined);
  if (!worker) {
    deps.err(
      `Cannot tell which Worker serves ${def.url}. Give its name with --worker <name> (Cloudflare dashboard → Workers & Pages).\n`
    );
    return 1;
  }
  const target =
    !flags.values.has('--worker') && existsSync(kept) ? ['--config', kept] : ['--name', worker];
  trace(`Worker: ${worker} (${target.join(' ')})`);

  // Secrets that exist nowhere else must go somewhere: on screen, or into a new file.
  const revealed = kinds.filter((item) => item !== 'admin' || !adminInFile);
  const secretsFile = flags.values.get('--secrets-file');
  if (secretsFile && existsSync(secretsFile)) {
    deps.err(`${secretsFile} already exists. Choose a new file so nothing is overwritten.\n`);
    return 1;
  }
  if (!deps.interactive && revealed.length > 0 && !secretsFile) {
    deps.err(
      'The new secrets are shown once. Without a terminal, say where to put them: --secrets-file <new file>.\n'
    );
    return 1;
  }
  if (!deps.interactive && !flags.switches.has('--yes')) {
    deps.err('Without a terminal, confirm with --yes.\n');
    return 1;
  }

  const credential = await cloudflareAccess(
    flags,
    deps,
    'Rotating needs a Cloudflare API token with Workers Scripts: Edit.',
    def.cloudflare?.token
  );
  if (typeof credential === 'string') {
    deps.err(`${credential}\n`);
    return 1;
  }
  const run = deps.run ?? wranglerFor(credential.access, deps.env);
  trace(`Wrangler: ${deps.run ? '(replaced for a test)' : wranglerCommand(deps.env).join(' ')}`);

  try {
    deps.out('Checking Cloudflare access…\n');
    const accounts = await checkAccess(run);
    const chosen = await chooseAccount(
      accounts,
      flags.values.get('--account'),
      deps,
      `Which one has the "${name}" Worker?`
    );
    if (typeof chosen === 'string') {
      deps.err(`${chosen} Nothing was rotated.\n`);
      return 1;
    }

    deps.out(`\nRotating on the Worker ${worker} (${def.url}):\n`);
    for (const item of kinds) {
      deps.out(`\n${SECRETS[item].name}\n`);
      for (const line of impact(item, name, !adminInFile)) deps.out(`  ${line}\n`);
    }
    deps.out('\nThe old value stops working as soon as the new one is stored.\n');
    if (!flags.switches.has('--yes')) {
      const answer = (await deps.ask('Type "rotate" to continue: ')).trim().toLowerCase();
      if (answer !== 'rotate') {
        deps.err('Not confirmed. Nothing was rotated.\n');
        return 1;
      }
    }

    const generated = generateSecrets(kinds);
    trace(`wrangler secret bulk ${target.join(' ')} (the new values go on stdin, not shown)`);
    const stored = await run(['secret', 'bulk', ...target], {
      stdin: JSON.stringify(generated),
      env: { CLOUDFLARE_ACCOUNT_ID: chosen.id }
    });
    trace(`  exit ${stored.code}`);
    if (stored.code !== 0) {
      const output = `${stored.stdout}${stored.stderr}`.trim().split('\n').slice(-6).join('\n');
      deps.err(`Storing the new value failed, so nothing was rotated:\n${output}\n`);
      return 1;
    }
    deps.out(`The Worker now uses the new ${kinds.length === 1 ? 'value' : 'values'}.\n`);

    const adminSecret = generated[SECRETS.admin.name];
    if (adminSecret && adminInFile) {
      const all = definitionsOf(loaded);
      all[name] = { ...def, secret: adminSecret };
      writeEnvironments(path, all);
      deps.out(`"${name}" on this computer now has the new administrator secret.\n`);
      const check = await verifyEnvironment(name, all[name], {
        version: deps.version,
        expectedSchema: expectedSchemaFrom(join(deps.assetDir, 'schema')),
        vault: deps.vault,
        ...(deps.fetch ? { fetch: deps.fetch } : {}),
        ...(deps.trace ? { trace: deps.trace } : {})
      });
      deps.out(
        check.usable
          ? `"${name}" works with it.\n`
          : `"${name}" does not verify yet (${check.problems[0]?.message ?? 'unknown'}). The Worker can take a few seconds; try: vizoalica env check ${name}\n`
      );
    }
    await revealSecrets(
      Object.fromEntries(
        revealed.map((item) => [SECRETS[item].name, generated[SECRETS[item].name]!])
      ),
      secretsFile,
      deps,
      name
    );
    return 0;
  } catch (error) {
    if (error instanceof DeployError) {
      deps.err(`\n${error.message}\n${error.hint ? `${error.hint}\n` : ''}Nothing was rotated.\n`);
      return 1;
    }
    throw error;
  }
}
