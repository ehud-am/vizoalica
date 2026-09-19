import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

/** Everything that talks to a real terminal or child process lives here, and is excluded from coverage. */
export interface Prompter {
  text(question: string, fallback?: string): Promise<string>;
  /** Reads a value without echoing it; the answer never appears on screen or in history. */
  hidden(question: string): Promise<string>;
  confirm(question: string, fallback: boolean): Promise<boolean>;
  /** Asks the operator to type an exact word; anything else asks again. */
  typeToContinue(message: string, word: string): Promise<void>;
}

export type RunOptions = {
  /** Supplying stdin (even empty) makes the command non-interactive. */
  stdin?: string;
  /** Let the command talk to the terminal, e.g. a browser login or a one-time prompt. */
  interactive?: boolean;
  /** Print the command's output while it runs. */
  echo?: boolean;
  env?: Record<string, string>;
};
export type RunResult = { code: number; stdout: string; stderr: string };
export type Run = (args: readonly string[], options?: RunOptions) => Promise<RunResult>;

export function terminalPrompter(): Prompter {
  const input = process.stdin;
  const output = process.stdout;
  const line = async (question: string): Promise<string> => {
    const rl = createInterface({ input, output });
    try {
      return (await rl.question(question)).trim();
    } finally {
      rl.close();
    }
  };
  return {
    async text(question, fallback) {
      const answer = await line(`${question}${fallback ? ` [${fallback}]` : ''}: `);
      return answer || fallback || '';
    },
    async confirm(question, fallback) {
      for (;;) {
        const answer = (await line(`${question} [${fallback ? 'Y/n' : 'y/N'}]: `)).toLowerCase();
        if (!answer) return fallback;
        if (['y', 'yes'].includes(answer)) return true;
        if (['n', 'no'].includes(answer)) return false;
      }
    },
    async typeToContinue(message, word) {
      for (;;) if ((await line(`${message} `)).toLowerCase() === word) return;
    },
    hidden(question) {
      return new Promise((resolve, reject) => {
        if (!input.isTTY) {
          reject(new Error('A secret can only be entered in an interactive terminal.'));
          return;
        }
        output.write(question);
        let value = '';
        input.setRawMode(true);
        input.resume();
        input.setEncoding('utf8');
        const finish = (): void => {
          input.setRawMode(false);
          input.pause();
          input.off('data', onData);
        };
        const onData = (chunk: string): void => {
          for (const character of chunk) {
            if (character === '\u0003') {
              finish();
              output.write('\n');
              reject(new Error('Cancelled.'));
              return;
            }
            if (character === '\r' || character === '\n') {
              finish();
              output.write('\n');
              resolve(value.trim());
              return;
            }
            if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
            else if (character >= ' ') value += character;
          }
        };
        input.on('data', onData);
      });
    }
  };
}

/** Runs the repository's own Wrangler (`pnpm exec wrangler`). */
export function wranglerRunner(cwd: string): Run {
  return (args, options = {}) =>
    new Promise((resolve) => {
      const child = spawn('pnpm', ['exec', 'wrangler', ...args], {
        cwd,
        env: { ...process.env, ...options.env },
        stdio: [
          options.stdin !== undefined ? 'pipe' : options.interactive ? 'inherit' : 'ignore',
          'pipe',
          'pipe'
        ]
      });
      let stdout = '';
      let stderr = '';
      if (options.stdin !== undefined) child.stdin!.end(options.stdin);
      child.stdout!.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
        if (options.echo) process.stdout.write(chunk);
      });
      child.stderr!.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
        if (options.echo) process.stderr.write(chunk);
      });
      child.on('error', (error) =>
        resolve({ code: 1, stdout, stderr: `${stderr}${error.message}` })
      );
      child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    });
}

/** Runs `pnpm build`, quietly unless it fails. */
export function buildRunner(cwd: string): () => Promise<{ ok: boolean; output: string }> {
  return () =>
    new Promise((resolve) => {
      const child = spawn('pnpm', ['build'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      child.stdout!.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
      child.stderr!.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
      child.on('error', (error) => resolve({ ok: false, output: error.message }));
      child.on('close', (code) => resolve({ ok: code === 0, output }));
    });
}

export function clearScreen(): void {
  if (process.stdout.isTTY) process.stdout.write('\u001b[2J\u001b[3J\u001b[H');
}

/** Best effort; never fails the command. */
export function openBrowser(url: string): void {
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'linux' ? 'xdg-open' : undefined;
  if (!command || !process.stdout.isTTY) return;
  try {
    spawn(command, [url], { stdio: 'ignore', detached: true })
      .on('error', () => undefined)
      .unref();
  } catch {
    // Opening a browser is a convenience only.
  }
}
