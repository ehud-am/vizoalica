import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import { SECRETS, SECRET_KINDS } from '@vizoalica/ops-core';
import type { OnecliRef, Secret } from '../../local-ops-api/src/environments/file.js';
import { noTrace, type Trace } from '../../local-ops-api/src/trace.js';
import type { Ask } from './prompt.js';
import type { CloudflareAccess } from './deploy/wrangler.js';

type Io = {
  env: NodeJS.ProcessEnv;
  out: (text: string) => void;
  err: (text: string) => void;
  interactive: boolean;
  ask: Ask;
  readStdin: () => Promise<string>;
  trace?: Trace | undefined;
};

type AccessFlags = { values: Map<string, string>; switches: Set<string> };

/**
 * The Cloudflare credential, first found: --cloudflare-onecli, --cloudflare-token-stdin, the one saved
 * with the environment, $CLOUDFLARE_API_TOKEN, or a hidden prompt. A string is what is wrong.
 */
export async function cloudflareAccess(
  flags: AccessFlags,
  io: Io,
  why: string,
  saved?: Secret
): Promise<{ access: CloudflareAccess; onecli?: OnecliRef } | string> {
  const trace = io.trace ?? noTrace;
  if (flags.switches.has('--cloudflare-onecli')) {
    const workspace = flags.values.get('--onecli-workspace');
    const agent = flags.values.get('--onecli-agent');
    const gateway = flags.values.get('--onecli-gateway');
    if (!workspace || !agent || !gateway)
      return 'OneCLI needs --onecli-workspace, --onecli-agent, and --onecli-gateway.';
    const onecli = { workspace, agent, gateway };
    trace(
      `Cloudflare credential: held by OneCLI (workspace ${workspace}, agent ${agent}, gateway ${gateway})`
    );
    return { access: { onecli }, onecli };
  }
  let token: string | undefined;
  if (flags.switches.has('--cloudflare-token-stdin')) {
    trace('Cloudflare credential: an API token read from stdin');
    token = (await io.readStdin()).replace(/\r?\n$/, '').trim();
  } else if (saved !== undefined) {
    if (typeof saved !== 'string') {
      trace('Cloudflare credential: the one saved with the environment, held by OneCLI');
      return { access: { onecli: saved.onecli }, onecli: saved.onecli };
    }
    trace('Cloudflare credential: the API token saved with the environment');
    token = saved;
  } else if (io.env.CLOUDFLARE_API_TOKEN?.trim()) {
    trace('Cloudflare credential: the CLOUDFLARE_API_TOKEN environment variable');
    token = io.env.CLOUDFLARE_API_TOKEN.trim();
  } else if (io.interactive)
    token = (
      await io.ask(`\n${why}\nPaste it here; it is not shown.\nCloudflare API token: `, {
        secret: true
      })
    ).trim();
  if (!token)
    return 'A Cloudflare API token is needed: pipe it with --cloudflare-token-stdin, set CLOUDFLARE_API_TOKEN, or use --cloudflare-onecli.';
  return { access: { token } };
}

/** The account to work in: --account, the only one, or asked. A string is what is wrong. */
export async function chooseAccount(
  accounts: Array<{ id: string; name: string }>,
  given: string | undefined,
  io: Io,
  question: string
): Promise<{ id: string } | string> {
  const listed = accounts.map((a) => `${a.name} (${a.id})`).join(', ');
  if (given)
    return accounts.some((account) => account.id === given)
      ? { id: given }
      : `That token cannot see the account ${given}. It can see: ${listed}`;
  if (accounts.length === 1) return { id: accounts[0]!.id };
  if (!io.interactive)
    return `This token can see several accounts; choose one with --account: ${listed}`;
  const list = accounts
    .map((account, index) => `  ${index + 1}) ${account.name} (${account.id})`)
    .join('\n');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const answer = (
      await io.ask(
        attempt === 0
          ? `\nThis token can see several Cloudflare accounts. ${question}\n${list}\nAccount number: `
          : 'Account number: '
      )
    ).trim();
    const id = accounts[Number(answer) - 1]?.id;
    if (id) return { id };
    io.err(`  Type a number from 1 to ${accounts.length}.\n`);
  }
  return 'No account chosen.';
}

const ACCOUNT_ID = /^[0-9a-f]{32}$/;

const accountFile = (home: string, worker: string) =>
  join(home, '.config', 'vizoalica', 'deploy', worker, 'account-id');

/** The Cloudflare account a Worker was deployed or last rotated in, so it need not be looked up again. */
export function rememberedAccount(home: string, worker: string): string | undefined {
  try {
    const id = readFileSync(accountFile(home, worker), 'utf8').trim();
    return ACCOUNT_ID.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}

/** A convenience only: it runs after a secret changed, so it must never stop the command. */
export function rememberAccount(home: string, worker: string, id: string): void {
  try {
    const file = accountFile(home, worker);
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(file, `${id}\n`, { mode: 0o600 });
  } catch {
    // Next time the account is looked up or asked for again.
  }
}

/** Asks for an account ID when the token may not list accounts. A string is what is wrong. */
export async function askAccountId(io: Io, why: string): Promise<{ id: string } | string> {
  if (!io.interactive) return `${why} Give the account ID with --account <id>.`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const answer = (
      await io.ask(
        attempt === 0
          ? `\n${why}\nIn the Cloudflare dashboard, the account ID is the 32-character code in the address bar right\nafter dash.cloudflare.com/, and it is listed on the Workers & Pages overview.\nCloudflare account ID: `
          : 'Cloudflare account ID: '
      )
    )
      .trim()
      .toLowerCase();
    if (ACCOUNT_ID.test(answer)) return { id: answer };
    io.err('  An account ID is 32 letters (a-f) and digits.\n');
  }
  return 'No account ID given.';
}

/**
 * Checks, before anything changes, that a new secrets file can be created: once a secret exists only in
 * memory, failing to write it would lose it. A string is what is wrong.
 */
export function secretsFileProblem(path: string): string | undefined {
  if (existsSync(path))
    return `${path} already exists. Choose a new file so nothing is overwritten.`;
  const folder = dirname(path);
  try {
    if (!statSync(folder).isDirectory()) return `${folder} is not a folder.`;
    accessSync(folder, constants.W_OK);
  } catch {
    return `The folder ${folder} does not exist or cannot be written to. Choose a secrets file in a folder you can write to.`;
  }
  return undefined;
}

/** What each secret is for, and where it has to go, in the words of someone who has to keep it. */
const KEEP: Record<string, string> = {
  [SECRETS.admin.name]:
    'Lets you administer this backend. Update it wherever you use this environment as admin.',
  [SECRETS.token.name]:
    "Every website you install needs it: it is the VIZOALICA_TOKEN_SECRET GitHub secret on a\n    website's Install page (GitHub → Cloudflare Pages).",
  [SECRETS.digest.name]: 'Used by the Worker only; nothing else needs it. Keep it as a backup.'
};

/**
 * Hands over secrets that exist nowhere else: into a new private file, or on screen, then waits until
 * the person says they have stored them, so they cannot scroll past.
 */
export async function revealSecrets(
  secrets: Record<string, string>,
  secretsFile: string | undefined,
  io: Io,
  environment: string
): Promise<void> {
  const names = SECRET_KINDS.map((kind) => SECRETS[kind].name).filter(
    (name) => secrets[name] !== undefined
  );
  if (names.length === 0) return;
  if (secretsFile) {
    const lines = names.map((name) => `${name}=${secrets[name]}`);
    try {
      writeFileSync(secretsFile, `${lines.join('\n')}\n`, { mode: 0o600, flag: 'wx' });
      chmodSync(secretsFile, 0o600);
      io.out(
        `\nSecrets written to ${secretsFile} (readable only by you). Move them to a password manager,\nthen delete the file.\n`
      );
      return;
    } catch (error) {
      // They exist nowhere else: showing them is better than losing them.
      io.err(
        `\nThe secrets could not be written to ${secretsFile} (${(error as Error).message}), so they are shown below instead.\n`
      );
    }
  }
  const rule = '═'.repeat(76);
  io.out(
    [
      '',
      rule,
      `SAVE ${names.length === 1 ? 'THIS SECRET' : `THESE ${names.length} SECRETS`} NOW, in a password manager, under the exact name shown.`,
      `Vizoalica does not keep a copy, and ${names.length === 1 ? 'it' : 'they'} cannot be shown again.`,
      rule,
      '',
      ...names.flatMap((name) => [name, `    ${secrets[name]}`, `    ${KEEP[name]}`, '']),
      `Lost one later? Make a new one with: vizoalica rotate ${environment} <admin|token|digest>`,
      rule,
      ''
    ].join('\n')
  );
  if (!io.interactive) return;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const answer = (
      await io.ask(
        attempt === 0
          ? `When you have saved ${names.length === 1 ? 'it' : 'them'}, type "saved": `
          : 'Type "saved" to continue: '
      )
    )
      .trim()
      .toLowerCase();
    if (answer === 'saved') return;
  }
}
