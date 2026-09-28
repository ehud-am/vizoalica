import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Ask } from './prompt.js';

export type SkillDeps = {
  home: string;
  assetDir: string;
  out: (text: string) => void;
  err: (text: string) => void;
  interactive: boolean;
  ask: Ask;
  /** The skill folder; defaults to the packaged copy under `assetDir`. A checkout passes `skills/vizoalica`. */
  source?: string | undefined;
};

/** Clients with a skills folder on this computer. Claude Desktop and claude.ai take an uploaded zip. */
const SKILL_CLIENTS = {
  'claude-code': ['.claude', 'skills'],
  codex: ['.codex', 'skills']
} as const;
type SkillClient = keyof typeof SKILL_CLIENTS;
const NAMES: Record<SkillClient, string> = { 'claude-code': 'Claude Code', codex: 'Codex' };

const USAGE = [
  'Usage: vizoalica skill <command>',
  '',
  '  path                              Print where the packaged skill is',
  '  install --client <claude-code|codex> [--yes]',
  "                                    Copy the skill into the client's skills folder",
  '',
  'The skill teaches an AI assistant how Vizoalica works: setup, health, operations, and how to',
  'answer analytics questions with the MCP server (vizoalica mcp install). For Claude Desktop or',
  'claude.ai, upload vizoalica-skill.zip from the GitHub release instead.'
].join('\n');

export const skillSource = (assetDir: string) => join(assetDir, 'skill', 'vizoalica');

/** `vizoalica skill`: find or install the packaged skill. */
export async function skillCommand(args: readonly string[], deps: SkillDeps): Promise<number> {
  const [sub, ...rest] = args;
  const source = deps.source ?? skillSource(deps.assetDir);
  if (sub === 'path') {
    if (!existsSync(join(source, 'SKILL.md'))) {
      deps.err(`The skill was not found next to this command (${source}).\n`);
      return 1;
    }
    deps.out(`${source}\n`);
    return 0;
  }
  if (sub !== 'install') {
    if (sub === undefined || sub === 'help' || sub === '--help') {
      deps.out(`${USAGE}\n`);
      return 0;
    }
    deps.err(`Unknown command: ${sub}\n${USAGE}\n`);
    return 1;
  }
  let client: SkillClient | undefined;
  let yes = false;
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]!;
    if (arg === '--yes') yes = true;
    else if (arg === '--client' || arg.startsWith('--client=')) {
      const value = arg === '--client' ? rest[(index += 1)] : arg.slice('--client='.length);
      if (value !== 'claude-code' && value !== 'codex') {
        deps.err(
          `--client must be claude-code or codex. For Claude Desktop or claude.ai, upload vizoalica-skill.zip from the GitHub release (Settings, Capabilities, Skills).\n`
        );
        return 1;
      }
      client = value;
    } else {
      deps.err(`Unexpected argument: ${arg}\n${USAGE}\n`);
      return 1;
    }
  }
  if (!client) {
    deps.err(`Name the client: --client claude-code or --client codex\n`);
    return 1;
  }
  if (!existsSync(join(source, 'SKILL.md'))) {
    deps.err(`The skill was not found next to this command (${source}).\n`);
    return 1;
  }
  const target = join(deps.home, ...SKILL_CLIENTS[client], 'vizoalica');
  const existing = join(target, 'SKILL.md');
  if (existsSync(existing)) {
    const same = readFileSync(existing, 'utf8') === readFileSync(join(source, 'SKILL.md'), 'utf8');
    if (!same && !yes) {
      if (!deps.interactive) {
        deps.err(`${target} already exists. Add --yes to replace it with this version.\n`);
        return 1;
      }
      const answer = await deps.ask(
        `${target} already exists. Replace it with this version? [y/N] `
      );
      if (!/^y(es)?$/i.test(answer.trim())) {
        deps.out('Nothing changed.\n');
        return 0;
      }
    }
    rmSync(target, { recursive: true, force: true });
  }
  cpSync(source, target, { recursive: true });
  deps.out(
    `Installed the Vizoalica skill for ${NAMES[client]} in ${target}.\nIt answers analytics questions through the MCP server; add that with: vizoalica mcp install --client ${client}\n`
  );
  return 0;
}
