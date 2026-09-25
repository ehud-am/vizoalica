import { isIncompatible, versionStatus } from '../compat.js';
import { WorkerClient, type BackendInfo, type Principal } from '../remote-client/worker-client.js';
import { noTrace, tracedFetch, type Trace } from '../trace.js';
import type { EnvironmentDef, Role, Secret } from './file.js';
import { ONECLI_PLACEHOLDER, VaultError, type FetchLike, type Vault } from './vault.js';

export type ProblemCode =
  | 'invalid'
  | 'onecli'
  | 'unauthorized'
  | 'wrong_role'
  | 'unreachable'
  | 'incompatible'
  | 'cloudflare_rejected'
  | 'cloudflare_unreachable';

export type Problem = { code: ProblemCode; message: string };

/** What the console and `vizoalica env` show about one environment. It never carries a secret. */
export type EnvironmentState = {
  name: string;
  url?: string;
  role?: Role;
  secretSource?: 'file' | 'onecli';
  cloudflare: 'none' | 'file' | 'onecli';
  usable: boolean;
  problems: Problem[];
  /** The role the Worker reported for the credential, when it answered. */
  actualRole?: Role;
  workerVersion?: string | null;
};

export type VerifyDeps = {
  version: string;
  expectedSchema: number | null;
  vault: Vault;
  /** Tests replace the network. */
  fetch?: FetchLike;
  /** `--verbose`: what is being checked and how it answered. Never a secret. */
  trace?: Trace;
};

/** How a request is authenticated: the literal secret, or the placeholder plus a fetch through OneCLI. */
export function resolveSecret(
  secret: Secret,
  deps: Pick<VerifyDeps, 'vault' | 'fetch' | 'trace'>
): { credential: string; fetch: FetchLike } {
  const trace = deps.trace;
  if (typeof secret === 'string') {
    const inner = deps.fetch ?? fetch;
    return { credential: secret, fetch: trace ? tracedFetch(inner, trace) : inner };
  }
  const inner = deps.vault.fetchFor(secret.onecli);
  return {
    credential: ONECLI_PLACEHOLDER,
    fetch: trace ? tracedFetch(inner, trace, ` via OneCLI gateway ${secret.onecli.gateway}`) : inner
  };
}

const sourceOf = (secret: Secret | undefined): 'file' | 'onecli' | undefined =>
  secret === undefined ? undefined : typeof secret === 'string' ? 'file' : 'onecli';

const ROLE_WORDS: Record<Role, string> = {
  admin: 'an administrator secret',
  owner: 'a website owner access key',
  analyst: 'an analyst access key'
};

export const roleMismatchMessage = (chosen: Role, actual: Role): string =>
  `This credential is ${ROLE_WORDS[actual]}, but the environment says ${chosen}. Use a credential for the ${chosen} role, or change the role to ${actual}.`;

const vaultProblem = (error: VaultError): Problem => ({ code: 'onecli', message: error.message });

/** Asks Cloudflare whether an API token is active. Resolves to a Problem when it is not usable. */
export async function verifyCloudflareToken(
  token: Secret,
  deps: Pick<VerifyDeps, 'vault' | 'fetch' | 'trace'>
): Promise<Problem | undefined> {
  const trace = deps.trace ?? noTrace;
  trace(
    `Checking the Cloudflare API token (${typeof token === 'string' ? 'from the file' : 'held by OneCLI'})`
  );
  const { credential, fetch: doFetch } = resolveSecret(token, deps);
  const call = (path: string) =>
    doFetch(`https://api.cloudflare.com/client/v4${path}`, {
      headers: { authorization: `Bearer ${credential}`, accept: 'application/json' },
      signal: AbortSignal.timeout(10_000)
    });
  try {
    const user = await call('/user/tokens/verify');
    const body = (await user.json().catch(() => undefined)) as
      { result?: { status?: string } } | undefined;
    trace(`Token status reported by Cloudflare: ${body?.result?.status ?? 'none'}`);
    if (user.ok && body?.result?.status === 'active') return undefined;
    if (user.ok && body?.result?.status)
      return {
        code: 'cloudflare_rejected',
        message: `Cloudflare reports this API token as ${body.result.status}. Create a new token in Cloudflare → My Profile → API Tokens.`
      };
    // An account-owned token is not known to the user endpoint; it can still list its own account.
    trace('Not a user token; trying to list its account instead');
    const accounts = await call('/accounts?per_page=1');
    if (accounts.ok) return undefined;
    return {
      code: 'cloudflare_rejected',
      message:
        'Cloudflare does not accept this API token: it is unknown, expired, or was pasted incompletely.'
    };
  } catch (error) {
    if (error instanceof VaultError) return vaultProblem(error);
    return {
      code: 'cloudflare_unreachable',
      message: 'Cloudflare could not be reached, so the API token was not checked.'
    };
  }
}

/**
 * Checks one environment against what it claims: the credential resolves, the Worker accepts it, the Worker
 * says it has the chosen role, the versions work together, and the Cloudflare token (if any) is active.
 */
export async function verifyEnvironment(
  name: string,
  def: EnvironmentDef,
  deps: VerifyDeps
): Promise<EnvironmentState> {
  const trace = deps.trace ?? noTrace;
  trace(
    `Verifying "${name}": ${def.url}, role ${def.role}, secret ${typeof def.secret === 'string' ? 'in the file' : `held by OneCLI (workspace ${def.secret.onecli.workspace}, agent ${def.secret.onecli.agent})`}, Cloudflare token ${def.cloudflare ? 'saved' : 'none'}`
  );
  const state: EnvironmentState = {
    name,
    url: def.url,
    role: def.role,
    ...(sourceOf(def.secret) ? { secretSource: sourceOf(def.secret)! } : {}),
    cloudflare: def.cloudflare ? sourceOf(def.cloudflare.token)! : 'none',
    usable: false,
    problems: []
  };
  const { credential, fetch: doFetch } = resolveSecret(def.secret, deps);
  const client = new WorkerClient(def.url, credential, doFetch);
  let principal: Principal | undefined;
  let info: BackendInfo | undefined;
  try {
    principal = await client.whoami();
    info = await client.backendInfo().catch((error: unknown) => {
      if (error instanceof VaultError) throw error;
      return undefined;
    });
  } catch (error) {
    trace(`Asking the Worker failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    if (error instanceof VaultError) state.problems.push(vaultProblem(error));
    else if (error instanceof Error && error.message === 'unauthorized')
      state.problems.push({
        code: 'unauthorized',
        message:
          def.role === 'admin'
            ? 'The Worker rejected this administrator secret. It may have been rotated or revoked.'
            : 'The Worker rejected this access key. It may have been revoked; ask your admin for a new one.'
      });
    else
      state.problems.push({
        code: 'unreachable',
        message: `The Worker at ${def.url} did not answer. Check the address and your connection.`
      });
  }
  if (principal) {
    trace(
      `The Worker says: role ${principal.role}, version ${principal.workerVersion ?? 'unknown'}, schema ${info?.schema.applied ?? 'unknown'} (this command expects schema ${deps.expectedSchema ?? 'unknown'})`
    );
    state.actualRole = principal.role;
    if (principal.role !== def.role)
      state.problems.push({
        code: 'wrong_role',
        message: roleMismatchMessage(def.role, principal.role)
      });
    const workerVersion = info?.workerVersion ?? principal.workerVersion;
    state.workerVersion = workerVersion;
    const statuses = versionStatus(
      { consoleVersion: deps.version, expectedSchema: deps.expectedSchema },
      { workerVersion, schemaApplied: info?.schema.applied ?? null }
    );
    if (isIncompatible(statuses))
      state.problems.push({ code: 'incompatible', message: statuses.schema.message });
  }
  if (def.cloudflare) {
    const problem = await verifyCloudflareToken(def.cloudflare.token, deps);
    if (problem) state.problems.push(problem);
  }
  state.usable = state.problems.length === 0;
  trace(
    `"${name}" is ${state.usable ? 'usable' : 'not usable'}${state.problems.map((p) => `\n  problem [${p.code}]: ${p.message}`).join('')}`
  );
  return state;
}
