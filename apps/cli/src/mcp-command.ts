import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Vault, FetchLike } from '../../local-ops-api/src/environments/vault.js';
import { expectedSchemaFrom } from '../../local-ops-api/src/setup/state.js';
import { noTrace, type Trace } from '../../local-ops-api/src/trace.js';
import {
  CLIENT_NAMES,
  CLIENTS,
  configPath,
  readIfExists,
  SERVER_NAME,
  snippet,
  withServer,
  writeAtomic,
  type Client,
  type Launch
} from './mcp/clients.js';
import { McpEnvironments } from './mcp/environments.js';
import { createMcpServer } from './mcp/server.js';
import type { Ask } from './prompt.js';

export type McpDeps = {
  home: string;
  version: string;
  assetDir: string;
  out: (text: string) => void;
  err: (text: string) => void;
  interactive: boolean;
  ask: Ask;
  vault: Vault;
  platform: NodeJS.Platform;
  trace?: Trace | undefined;
  /** Tests replace the network, the MCP transport's streams, and running `claude`. */
  fetch?: FetchLike | undefined;
  stdio?: { stdin: NodeJS.ReadableStream; stdout: NodeJS.WritableStream } | undefined;
  runClaude?: ((args: string[]) => { status: number | null; error?: Error }) | undefined;
  /** How an AI client starts this command; defaults to this Node.js and this file. */
  launch?: Launch | undefined;
};

const USAGE = [
  'Usage: vizoalica mcp [command]',
  '',
  '  (none)                      Run the MCP server on stdin/stdout. AI clients start this;',
  '                              you do not run it yourself',
  '  install --client <name>     Add the server to an AI client: ' + CLIENTS.join(', '),
  '          [--print] [--yes]   --print shows the change without making it; --yes replaces',
  '                              an existing "vizoalica" entry without asking',
  '',
  'The server reads every environment from ~/.config/vizoalica/environments.json. It only reads',
  'analytics and health; it never changes anything, and secrets never reach the AI client.',
  'Guide: https://vizoalica.dev/operations/ai'
].join('\n');

export function defaultLaunch(): Launch {
  return { command: process.execPath, args: [process.argv[1] ?? 'vizoalica', 'mcp'] };
}

/** `vizoalica mcp`: serve MCP over stdio, or set a client up with `install`. */
export async function mcpCommand(args: readonly string[], deps: McpDeps): Promise<number> {
  const [sub, ...rest] = args;
  if (sub === 'help' || sub === '--help' || sub === '-h') {
    deps.out(`${USAGE}\n`);
    return 0;
  }
  if (sub === 'install') return install(rest, deps);
  if (sub !== undefined) {
    deps.err(`Unknown argument: ${sub}\n${USAGE}\n`);
    return 1;
  }
  if (deps.interactive && !deps.stdio) {
    deps.err(
      `"vizoalica mcp" is started by an AI client, not typed in a terminal.\nSet a client up with: vizoalica mcp install --client <${CLIENTS.join('|')}>\n`
    );
    return 1;
  }
  return serve(deps);
}

async function serve(deps: McpDeps): Promise<number> {
  const trace = deps.trace ?? noTrace;
  const homeDir = join(deps.home, '.config', 'vizoalica');
  const expectedSchema = expectedSchemaFrom(join(deps.assetDir, 'schema'));
  trace(
    `MCP server ${deps.version}: settings ${homeDir}, expected schema ${expectedSchema ?? 'unknown'}`
  );
  const environments = new McpEnvironments({
    homeDir,
    version: deps.version,
    expectedSchema,
    vault: deps.vault,
    fetch: deps.fetch
  });
  const server = createMcpServer({ environments, version: deps.version, expectedSchema });
  // stdout carries only protocol messages; anything for a person goes to stderr.
  const stdin = deps.stdio?.stdin ?? process.stdin;
  const transport = new StdioServerTransport(
    stdin as never,
    (deps.stdio?.stdout ?? process.stdout) as never
  );
  const closed = new Promise<void>((resolve) => {
    server.server.onclose = () => resolve();
  });
  // The client going away closes stdin; the transport itself does not notice.
  const stop = () => void server.close();
  stdin.once('end', stop);
  stdin.once('close', stop);
  await server.connect(transport);
  trace('MCP server ready on stdin/stdout');
  await closed;
  trace('MCP client disconnected');
  return 0;
}

function parseInstall(
  args: readonly string[]
): { client: Client | undefined; print: boolean; yes: boolean } | { error: string } {
  let client: Client | undefined;
  let print = false;
  let yes = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === '--print') print = true;
    else if (arg === '--yes') yes = true;
    else if (arg === '--client' || arg.startsWith('--client=')) {
      const value = arg === '--client' ? args[(index += 1)] : arg.slice('--client='.length);
      if (!CLIENTS.includes(value as Client))
        return { error: `--client must be one of: ${CLIENTS.join(', ')}` };
      client = value as Client;
    } else return { error: `Unexpected argument: ${arg}` };
  }
  return { client, print, yes };
}

async function install(args: readonly string[], deps: McpDeps): Promise<number> {
  const parsed = parseInstall(args);
  if ('error' in parsed) {
    deps.err(`${parsed.error}\n${USAGE}\n`);
    return 1;
  }
  const launch = deps.launch ?? defaultLaunch();
  if (!parsed.client) {
    deps.out(
      `Add the Vizoalica MCP server to your AI client with one of:\n${CLIENTS.map((client) => `  vizoalica mcp install --client ${client}`).join('\n')}\n\nOr configure any MCP client to run:\n  ${[launch.command, ...launch.args].join(' ')}\n`
    );
    return 0;
  }
  const client = parsed.client;
  const name = CLIENT_NAMES[client];
  if (client === 'claude-code') {
    const command = snippet(client, launch);
    if (parsed.print) {
      deps.out(`${command}\n`);
      return 0;
    }
    const run =
      deps.runClaude ??
      ((argv: string[]) => {
        const result = spawnSync('claude', argv, { stdio: 'inherit' });
        return { status: result.status, ...(result.error ? { error: result.error } : {}) };
      });
    // Replacing an existing entry: Claude Code refuses to add a name that exists.
    if (parsed.yes) run(['mcp', 'remove', '--scope', 'user', SERVER_NAME]);
    const result = run([
      'mcp',
      'add',
      '--scope',
      'user',
      SERVER_NAME,
      '--',
      launch.command,
      ...launch.args
    ]);
    if (result.error || result.status !== 0) {
      deps.err(
        `${result.error ? 'The "claude" command was not found.' : 'Claude Code did not add the server (it may exist already; add --yes to replace it).'}\nRun this yourself:\n  ${command}\n`
      );
      return 1;
    }
    deps.out(`${nextSteps(name)}\n`);
    return 0;
  }
  const path = configPath(client, deps.home, deps.platform);
  let before: string | undefined;
  let change: { after: string; replaced: boolean };
  try {
    before = readIfExists(path);
    change = withServer(client, before, launch);
  } catch (error) {
    deps.err(
      `${path} could not be read: ${error instanceof Error ? error.message : 'unknown problem'}\nAdd this yourself:\n${snippet(client, launch)}`
    );
    return 1;
  }
  if (parsed.print) {
    deps.out(`${path}\n${change.after}`);
    return 0;
  }
  if (change.after === before) {
    deps.out(`${name} already runs the Vizoalica MCP server (${path}). Nothing changed.\n`);
    return 0;
  }
  if (change.replaced && !parsed.yes) {
    if (!deps.interactive) {
      deps.err(`${path} already has a "${SERVER_NAME}" server. Add --yes to replace it.\n`);
      return 1;
    }
    const answer = await deps.ask(
      `${path} already has a "${SERVER_NAME}" server. It will run:\n  ${[launch.command, ...launch.args].join(' ')}\nReplace it? [y/N] `
    );
    if (!/^y(es)?$/i.test(answer.trim())) {
      deps.out('Nothing changed.\n');
      return 0;
    }
  }
  writeAtomic(path, change.after);
  deps.out(
    `${change.replaced ? 'Updated' : 'Added'} the "${SERVER_NAME}" server in ${path}.\n${nextSteps(name)}\n`
  );
  return 0;
}

function nextSteps(name: string): string {
  return [
    `Restart ${name}, then ask something like "How did traffic change this week?".`,
    'The server works on every environment in vizoalica env list and always says which one it used.',
    'For better answers, also add the skill: vizoalica skill install --client <client>'
  ].join('\n');
}
