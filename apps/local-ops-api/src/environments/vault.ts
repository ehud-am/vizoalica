import type { ChildProcessByStdio, spawn as spawnFn } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { createInterface } from 'node:readline';
import type { OnecliRef } from './file.js';

/** What a request for a OneCLI-held secret carries in place of the secret; the gateway swaps it in. */
export const ONECLI_PLACEHOLDER = 'onecli-managed';

export type FetchLike = (input: URL | string, init?: RequestInit) => Promise<Response>;

/** A plain reason a OneCLI-held secret could not be used; never contains a secret. */
export class VaultError extends Error {
  constructor(
    readonly code: 'onecli_not_installed' | 'onecli_failed' | 'onecli_timeout',
    message: string
  ) {
    super(message);
  }
}

/**
 * The helper runs under `onecli run`, so the OneCLI gateway can add the secret to its requests. It reads
 * one JSON request per line on stdin and answers one JSON line on stdout. Only the console's own process
 * talks to it; it is started on demand and never runs the console itself.
 */
const HELPER_SOURCE = `
import { createInterface } from 'node:readline';
const lines = createInterface({ input: process.stdin });
for await (const line of lines) {
  let request;
  try { request = JSON.parse(line); } catch { continue; }
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body === null ? undefined : request.body,
      redirect: 'error',
      signal: AbortSignal.timeout(10000)
    });
    const body = Buffer.from(await response.arrayBuffer()).toString('base64');
    process.stdout.write(JSON.stringify({ id: request.id, status: response.status, headers: [...response.headers], body }) + '\\n');
  } catch {
    process.stdout.write(JSON.stringify({ id: request.id, error: 'request_failed' }) + '\\n');
  }
}
`;

/** OneCLI's `run` still names the workspace flag `--project`; this is the only place that knows. */
export function onecliArguments(ref: OnecliRef): string[] {
  return [
    'run',
    '--project',
    ref.workspace,
    '--agent',
    ref.agent,
    '--gateway',
    ref.gateway,
    '--',
    process.execPath,
    '--disable-warning=UNDICI-EHPA',
    '--input-type=module',
    '-e',
    HELPER_SOURCE
  ];
}

type Piped = ChildProcessByStdio<Writable, Readable, null>;
type Reply = {
  id: number;
  status?: number;
  headers?: [string, string][];
  body?: string;
  error?: string;
};
type Pending = {
  resolve: (reply: Reply) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

class Helper {
  private child: Piped | undefined;
  private failure: VaultError | undefined;
  private readonly pending = new Map<number, Pending>();
  private next = 1;

  constructor(
    private readonly ref: OnecliRef,
    private readonly spawn: typeof spawnFn,
    private readonly timeoutMs: number
  ) {}

  private start(): Piped {
    const child = this.spawn('onecli', onecliArguments(this.ref), {
      stdio: ['pipe', 'pipe', 'ignore']
    }) as unknown as Piped;
    this.child = child;
    this.failure = undefined;
    createInterface({ input: child.stdout }).on('line', (line) => {
      let reply: Reply;
      try {
        reply = JSON.parse(line) as Reply;
      } catch {
        return; // OneCLI may print its own notices; only JSON lines are ours.
      }
      const waiting = this.pending.get(reply.id);
      if (!waiting) return;
      this.pending.delete(reply.id);
      clearTimeout(waiting.timer);
      waiting.resolve(reply);
    });
    const end = (error: VaultError) => {
      if (this.child === child) this.child = undefined;
      this.failure = error;
      for (const [id, waiting] of this.pending) {
        this.pending.delete(id);
        clearTimeout(waiting.timer);
        waiting.reject(error);
      }
    };
    child.once('error', (error: NodeJS.ErrnoException) =>
      end(
        error.code === 'ENOENT'
          ? new VaultError(
              'onecli_not_installed',
              'OneCLI is not installed, or `onecli` is not on your PATH.'
            )
          : new VaultError('onecli_failed', 'OneCLI could not be started.')
      )
    );
    child.once('exit', (code) =>
      end(
        new VaultError(
          'onecli_failed',
          `OneCLI stopped (exit ${code ?? 'signal'}). Check that its gateway is running and that the workspace and agent names are right.`
        )
      )
    );
    child.stdin.on('error', () => undefined);
    return child;
  }

  send(url: string, init: RequestInit): Promise<Reply> {
    const child = this.child ?? this.start();
    const id = this.next++;
    return new Promise<Reply>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new VaultError('onecli_timeout', 'OneCLI did not answer in time.'));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      const headers = Object.fromEntries(new Headers(init.headers).entries());
      const body = typeof init.body === 'string' ? init.body : null;
      child.stdin.write(
        `${JSON.stringify({ id, url, method: init.method ?? 'GET', headers, body })}\n`
      );
    });
  }

  close(): void {
    this.child?.kill('SIGTERM');
    this.child = undefined;
  }
}

/** One long-lived helper per OneCLI workspace/agent/gateway, started on first use and restarted if it dies. */
export class Vault {
  private readonly helpers = new Map<string, Helper>();

  constructor(
    private readonly spawn: typeof spawnFn,
    private readonly timeoutMs = 15_000
  ) {}

  /** A `fetch` whose requests are made through OneCLI, so the gateway can supply the secret. */
  fetchFor(ref: OnecliRef): FetchLike {
    const key = `${ref.workspace}\n${ref.agent}\n${ref.gateway}`;
    let helper = this.helpers.get(key);
    if (!helper) {
      helper = new Helper(ref, this.spawn, this.timeoutMs);
      this.helpers.set(key, helper);
    }
    const chosen = helper;
    return async (input, init = {}) => {
      const reply = await chosen.send(String(input), init);
      if (reply.error || reply.status === undefined) throw new Error('remote_unavailable');
      const status = reply.status;
      const noBody = status === 204 || status === 205 || status === 304;
      return new Response(noBody ? null : Buffer.from(reply.body ?? '', 'base64'), {
        status,
        headers: reply.headers ?? []
      });
    };
  }

  close(): void {
    for (const helper of this.helpers.values()) helper.close();
    this.helpers.clear();
  }
}
