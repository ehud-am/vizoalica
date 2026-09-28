import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';

/** The AI clients `vizoalica mcp install` and `vizoalica skill install` know how to set up. */
export const CLIENTS = ['claude-code', 'claude-desktop', 'codex', 'cursor'] as const;
export type Client = (typeof CLIENTS)[number];

export const CLIENT_NAMES: Record<Client, string> = {
  'claude-code': 'Claude Code',
  'claude-desktop': 'Claude Desktop',
  codex: 'Codex',
  cursor: 'Cursor'
};

/** How a client starts the server: absolute paths, because desktop apps do not see a shell's PATH. */
export type Launch = { command: string; args: string[] };

export const SERVER_NAME = 'vizoalica';

/** Where each client keeps its MCP servers, for this platform. */
export function configPath(
  client: Exclude<Client, 'claude-code'>,
  home: string,
  platform: NodeJS.Platform
): string {
  if (client === 'claude-desktop')
    return platform === 'darwin'
      ? join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
      : join(home, '.config', 'Claude', 'claude_desktop_config.json');
  if (client === 'codex') return join(home, '.codex', 'config.toml');
  return join(home, '.cursor', 'mcp.json');
}

/** The file after adding (or replacing) the `vizoalica` server; `before` is undefined for a new file. */
export function withServer(
  client: Exclude<Client, 'claude-code'>,
  before: string | undefined,
  launch: Launch
): { after: string; replaced: boolean } {
  return client === 'codex' ? tomlWithServer(before, launch) : jsonWithServer(before, launch);
}

function jsonWithServer(
  before: string | undefined,
  launch: Launch
): { after: string; replaced: boolean } {
  let root: Record<string, unknown> = {};
  if (before !== undefined && before.trim()) {
    const parsed: unknown = JSON.parse(before);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      throw new Error('The file does not contain a JSON object.');
    root = parsed as Record<string, unknown>;
  }
  const servers = root.mcpServers;
  if (
    servers !== undefined &&
    (typeof servers !== 'object' || servers === null || Array.isArray(servers))
  )
    throw new Error('"mcpServers" in the file is not an object.');
  const next = { ...((servers as Record<string, unknown> | undefined) ?? {}) };
  const replaced = SERVER_NAME in next;
  next[SERVER_NAME] = { command: launch.command, args: launch.args };
  return { after: `${JSON.stringify({ ...root, mcpServers: next }, null, 2)}\n`, replaced };
}

const tomlString = (value: string) => JSON.stringify(value);

/**
 * Codex's config is TOML. Only the `[mcp_servers.vizoalica]` table (and its sub-tables) is replaced or
 * appended, so every other line of the user's file stays exactly as it was.
 */
function tomlWithServer(
  before: string | undefined,
  launch: Launch
): { after: string; replaced: boolean } {
  const block = [
    `[mcp_servers.${SERVER_NAME}]`,
    `command = ${tomlString(launch.command)}`,
    `args = [${launch.args.map(tomlString).join(', ')}]`
  ];
  const lines = (before ?? '').split('\n');
  if (lines.at(-1) === '') lines.pop();
  // A table (`[a.b]`) or an array of tables (`[[a.b]]`); either one ends the table before it.
  const header = /^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(#.*)?$/;
  const ours = (name: string) =>
    name === `mcp_servers.${SERVER_NAME}` || name.startsWith(`mcp_servers.${SERVER_NAME}.`);
  const kept: string[] = [];
  let skipping = false;
  let at = -1;
  for (const line of lines) {
    const match = header.exec(line);
    if (match) {
      skipping = ours(match[1]!);
      if (skipping && at === -1) at = kept.length;
    }
    if (!skipping) kept.push(line);
  }
  if (at === -1) {
    if (kept.length && kept.at(-1)!.trim() !== '') kept.push('');
    return { after: `${[...kept, ...block].join('\n')}\n`, replaced: false };
  }
  kept.splice(at, 0, ...block, '');
  return {
    after: `${kept
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\n+$/, '')}\n`,
    replaced: true
  };
}

export function readIfExists(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Writes through a temporary file, keeping the old file's permissions when there was one. */
export function writeAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const mode = existsSync(path) ? statSync(path).mode & 0o777 : 0o600;
  const temporary = `${path}.vizoalica-${process.pid}.tmp`;
  writeFileSync(temporary, text, { mode });
  chmodSync(temporary, mode);
  renameSync(temporary, path);
}

/** The line a user can paste when the file cannot be written. */
export function snippet(client: Client, launch: Launch): string {
  if (client === 'claude-code')
    return `claude mcp add --scope user ${SERVER_NAME} -- ${[launch.command, ...launch.args].map(shellQuote).join(' ')}`;
  if (client === 'codex') return withServer('codex', undefined, launch).after;
  return withServer(client, undefined, launch).after;
}

export function shellQuote(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}
