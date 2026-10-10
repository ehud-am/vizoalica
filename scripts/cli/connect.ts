import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type Ctx, OpsError, checkAdminAccess, done, normalizeWorkerUrl, step } from './context.js';
import { SECRETS, isValidSecret } from './secrets.js';

export type ConnectOptions = {
  configPath: string;
  workerUrl?: string;
  /** Supplied when the secret was just generated in this same run; otherwise asked for, hidden. */
  adminSecret?: string;
};
export type ConnectResult = {
  workerUrl: string;
  adminSecret: string | undefined;
  changed: boolean;
};

/** Replaces the file atomically, with owner-only permissions. */
function writeConfigFile(path: string, values: Record<string, string>): void {
  const temporary = join(dirname(path), `.${crypto.randomUUID()}.tmp`);
  writeFileSync(temporary, `${JSON.stringify(values, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  renameSync(temporary, path);
}

function readExisting(path: string): { url?: string; secret?: string } {
  if (!existsSync(path)) return {};
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
    return { url: value.VIZOALICA_REMOTE_URL, secret: value.VIZOALICA_ADMIN_SECRET };
  } catch {
    return {};
  }
}

/** Sets this computer up as an operator console: verifies the secret first, then writes a private file. */
export async function connectConsole(ctx: Ctx, options: ConnectOptions): Promise<ConnectResult> {
  const existing = readExisting(options.configPath);
  if (existing.secret === 'onecli-managed' && existing.url) {
    done(ctx, 'This computer already uses OneCLI for the administrator secret. Nothing to change.');
    return { workerUrl: existing.url, adminSecret: undefined, changed: false };
  }
  const workerUrl = normalizeWorkerUrl(
    options.workerUrl ??
      existing.url ??
      (await ctx.prompt.text('Worker address (https://NAME.SUBDOMAIN.workers.dev)'))
  );
  if (existing.secret && existing.url === workerUrl && options.adminSecret === undefined) {
    step(ctx, 'This computer is already set up. Checking the saved secret still works…');
    if ((await checkAdminAccess(ctx, workerUrl, existing.secret)) === 'ok') {
      done(ctx, 'Already connected. Nothing to change.');
      return { workerUrl, adminSecret: existing.secret, changed: false };
    }
    ctx.out('  The saved secret no longer works (was it rotated?). Enter the current one.');
  }
  const adminSecret =
    options.adminSecret ??
    (await ctx.prompt.hidden(
      `Paste the administrator secret (${SECRETS.admin.name}) — nothing is shown as you type: `
    ));
  if (!isValidSecret(adminSecret))
    throw new OpsError(
      'That does not look like a Vizoalica secret (expected 32 or more characters with no spaces).'
    );

  step(ctx, 'Checking the secret against your Worker…');
  const access = await checkAdminAccess(ctx, workerUrl, adminSecret);
  if (access === 'unauthorized')
    throw new OpsError(
      'The Worker rejected that secret. Use the value saved for VIZOALICA_ADMIN_SECRET, not the token or digest secret.'
    );
  if (access === 'unreachable')
    throw new OpsError(`Could not reach ${workerUrl}. Check the address and your connection.`);
  if (access === 'unexpected')
    throw new OpsError(
      `${workerUrl} answered, but not like a Vizoalica Worker. Check the address.`
    );

  const directory = dirname(options.configPath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  writeConfigFile(options.configPath, {
    VIZOALICA_REMOTE_URL: workerUrl,
    VIZOALICA_ADMIN_SECRET: adminSecret
  });
  done(
    ctx,
    `This computer is connected. The secret is in ${options.configPath}, readable only by you.`
  );
  ctx.out('To use this backend in the console, add it as an environment: vizoalica env add <name>');
  return { workerUrl, adminSecret, changed: true };
}
