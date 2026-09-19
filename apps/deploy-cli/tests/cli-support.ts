import { copyFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Ctx } from '../../../scripts/cli/context.js';
import type { Prompter, Run, RunOptions, RunResult } from '../../../scripts/cli/terminal.js';

export type Call = { args: string[]; options: RunOptions };
type Reply = Partial<RunResult> | ((call: Call) => Partial<RunResult>);

/** A strict Wrangler double: an unexpected command fails the test. Arrays reply in order, repeating the last. */
export function fakeRun(script: Record<string, Reply | Reply[]>) {
  const calls: Call[] = [];
  const cursor = new Map<string, number>();
  const run: Run = async (args, options = {}) => {
    const call = { args: [...args], options };
    calls.push(call);
    const line = args.join(' ');
    const key = Object.keys(script)
      .sort((a, b) => b.length - a.length)
      .find((prefix) => line.startsWith(prefix));
    if (key === undefined) throw new Error(`unexpected wrangler call: ${line}`);
    const entry = script[key]!;
    let reply: Reply;
    if (Array.isArray(entry)) {
      const index = Math.min(cursor.get(key) ?? 0, entry.length - 1);
      cursor.set(key, index + 1);
      reply = entry[index]!;
    } else reply = entry;
    const value = typeof reply === 'function' ? reply(call) : reply;
    return { code: 0, stdout: '', stderr: '', ...value };
  };
  return {
    run,
    calls,
    has: (prefix: string) => calls.some((call) => call.args.join(' ').startsWith(prefix))
  };
}

export type PromptScript = {
  confirm?: (question: string, fallback: boolean) => boolean;
  text?: (question: string, fallback?: string) => string;
  hidden?: (question: string) => string;
};

export function fakePrompt(script: PromptScript = {}) {
  const log: string[] = [];
  const typed: string[] = [];
  const prompt: Prompter = {
    async text(question, fallback) {
      log.push(`text: ${question}`);
      return script.text ? script.text(question, fallback) : (fallback ?? '');
    },
    async hidden(question) {
      log.push(`hidden: ${question}`);
      if (!script.hidden) throw new Error(`unexpected hidden prompt: ${question}`);
      return script.hidden(question);
    },
    async confirm(question, fallback) {
      log.push(`confirm(${fallback}): ${question}`);
      return script.confirm ? script.confirm(question, fallback) : fallback;
    },
    async typeToContinue(message, word) {
      log.push(`type: ${message}`);
      typed.push(word);
    }
  };
  return { prompt, log, typed };
}

export function fakeCtx(overrides: Partial<Ctx> & { cwd: string }) {
  const lines: string[] = [];
  let cleared = 0;
  let slept = 0;
  const ctx: Ctx = {
    run: async () => ({ code: 0, stdout: '', stderr: '' }),
    prompt: fakePrompt().prompt,
    fetch: (async () => new Response('{}', { status: 404 })) as typeof fetch,
    out: (text) => void lines.push(text),
    build: async () => ({ ok: true, output: '' }),
    sleep: async () => void (slept += 1),
    clear: () => void (cleared += 1),
    ...overrides
  };
  return { ctx, lines, output: () => lines.join('\n'), cleared: () => cleared, slept: () => slept };
}

/** A temp checkout containing the real example config. */
export function tempCheckout(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'vizoalica-cli-'));
  mkdirSync(join(cwd, 'deploy', 'cloudflare'), { recursive: true });
  copyFileSync(
    join(process.cwd(), 'deploy/cloudflare/wrangler.example.toml'),
    join(cwd, 'deploy/cloudflare/wrangler.example.toml')
  );
  return cwd;
}

export const ACCOUNT_ID = 'a'.repeat(32);
export const WHOAMI = `┌──────────────┬──────────────────────────────────┐
│ Account Name │ Account ID                       │
├──────────────┼──────────────────────────────────┤
│ Test Account │ ${ACCOUNT_ID} │
└──────────────┴──────────────────────────────────┘`;
export const DB_UUID = '11111111-2222-3333-4444-555555555555';
export const D1_LIST = JSON.stringify([{ uuid: DB_UUID, name: 'vizoalica-config' }]);
export const R2_LIST =
  'Listing buckets...\nname:           vizoalica-events\ncreation_date:  2026-01-01';
export const WORKER_URL = 'https://vizoalica-ingest.test-sub.workers.dev';
export const DEPLOY_OUT = `Uploaded vizoalica-ingest\n  ${WORKER_URL}\nCurrent Version ID: abc`;

/** Fetch double for a Worker: /healthz plus a switchable admin secret. */
export function workerFetch(
  options: { adminSecret?: string; healthy?: boolean } = {}
): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/healthz'))
      return options.healthy === false
        ? new Response('', { status: 503 })
        : Response.json({ ok: true });
    if (url.endsWith('/v1/admin/projects') && !init?.method) {
      const header = new Headers(init?.headers).get('authorization');
      return header === `Bearer ${options.adminSecret}`
        ? Response.json([])
        : new Response('', { status: 401 });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
}
