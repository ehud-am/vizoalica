import { isIncompatible, versionStatus } from '../compat.js';
import { WorkerClient, type BackendInfo, type Principal } from '../remote-client/worker-client.js';
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
};

/** How a request is authenticated: the literal secret, or the placeholder plus a fetch through OneCLI. */
export function resolveSecret(
  secret: Secret,
  deps: Pick<VerifyDeps, 'vault' | 'fetch'>
): { credential: string; fetch: FetchLike } {
  if (typeof secret === 'string') return { credential: secret, fetch: deps.fetch ?? fetch };
  return { credential: ONECLI_PLACEHOLDER, fetch: deps.vault.fetchFor(secret.onecli) };
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
  deps: Pick<VerifyDeps, 'vault' | 'fetch'>
): Promise<Problem | undefined> {
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
    if (user.ok && body?.result?.status === 'active') return undefined;
    if (user.ok && body?.result?.status)
      return {
        code: 'cloudflare_rejected',
        message: `Cloudflare reports this API token as ${body.result.status}. Create a new token in Cloudflare → My Profile → API Tokens.`
      };
    // An account-owned token is not known to the user endpoint; it can still list its own account.
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
  return state;
}
