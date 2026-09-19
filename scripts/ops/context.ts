import type { Prompter, Run } from './terminal.js';

/** Everything the guided commands need from the outside world, injected so it can be faked. */
export type Ctx = {
  run: Run;
  prompt: Prompter;
  fetch: typeof fetch;
  out: (text: string) => void;
  cwd: string;
  build: () => Promise<{ ok: boolean; output: string }>;
  sleep: (ms: number) => Promise<void>;
  clear: () => void;
};

/** A failure whose message is the whole story; the CLI prints it without a stack. */
export class OpsError extends Error {}

export const step = (ctx: Ctx, message: string): void => ctx.out(`▸ ${message}`);
export const done = (ctx: Ctx, message: string): void => ctx.out(`✔ ${message}`);

export function normalizeWorkerUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new OpsError(
      `"${value}" is not a URL. Expected something like https://NAME.SUBDOMAIN.workers.dev`
    );
  }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash)
    throw new OpsError(
      'The Worker address must be an https origin with no path, e.g. https://NAME.SUBDOMAIN.workers.dev'
    );
  return url.origin;
}

export type AccessResult = 'ok' | 'unauthorized' | 'unreachable' | 'unexpected';

/** Checks that a secret really is the Worker's administrator secret. */
export async function checkAdminAccess(
  ctx: Ctx,
  workerUrl: string,
  secret: string
): Promise<AccessResult> {
  try {
    const response = await ctx.fetch(`${workerUrl}/v1/admin/projects`, {
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(15_000)
    });
    if (response.status === 401 || response.status === 403) return 'unauthorized';
    if (response.status !== 200) return 'unexpected';
    return Array.isArray(await response.json().catch(() => undefined)) ? 'ok' : 'unexpected';
  } catch {
    return 'unreachable';
  }
}

/** A brand-new workers.dev name can take a moment to resolve, so poll briefly. */
export async function waitForHealth(ctx: Ctx, workerUrl: string, attempts = 10): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await ctx.fetch(`${workerUrl}/healthz`, {
        signal: AbortSignal.timeout(10_000)
      });
      const body = (await response.json().catch(() => undefined)) as { ok?: unknown } | undefined;
      if (response.status === 200 && body?.ok === true) return true;
    } catch {
      // Not resolvable yet.
    }
    if (attempt < attempts - 1) await ctx.sleep(3000);
  }
  return false;
}
