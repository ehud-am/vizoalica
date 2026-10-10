import { spawn } from 'node:child_process';
import { Vault } from '../../local-ops-api/src/environments/vault.js';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './main.js';
import { Cancelled, terminalAsk } from './prompt.js';
import { VERSION } from './version.js';

function openBrowser(url: string): void {
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'linux' ? 'xdg-open' : undefined;
  if (!command || !process.stdout.isTTY) return;
  try {
    spawn(command, [url], { stdio: 'ignore', detached: true })
      .on('error', () => undefined)
      .unref();
  } catch {
    // Opening a browser is a convenience only; the address is printed either way.
  }
}

const cliPath = fileURLToPath(import.meta.url);

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

const vault = new Vault(spawn);
process.exitCode = await main(process.argv.slice(2), {
  env: process.env,
  home: homedir(),
  version: VERSION,
  assetDir: dirname(cliPath),
  out: (text) => void process.stdout.write(text),
  err: (text) => void process.stderr.write(text),
  interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
  ask: terminalAsk(),
  readStdin,
  vault,
  openBrowser,
  waitForStop: () =>
    new Promise<void>((resolve) => {
      process.once('SIGINT', resolve);
      process.once('SIGTERM', resolve);
    }),
  nodeVersion: process.versions.node,
  platform: process.platform
})
  .finally(() => vault.close())
  .catch((error: unknown) => {
    if (error instanceof Cancelled) {
      process.stderr.write(`${error.message}\n`);
      return 130;
    }
    process.stderr.write(`${error instanceof Error ? error.message : 'Something went wrong.'}\n`);
    return 1;
  });
