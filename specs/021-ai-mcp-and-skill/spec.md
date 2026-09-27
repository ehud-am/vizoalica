# Feature Specification: AI Access (`vizoalica mcp` and the Vizoalica skill)

**Feature Branch**: `021-ai-mcp-and-skill`

**Created**: 2026-09-27

**Status**: Implemented (phases A and B)

**Input**: "Deliver AI capabilities: an MCP on top of the APIs, a new command `vizoalica mcp`, and a new
skill file that can be deployed to Claude and ChatGPT/Codex."

## Decisions (2026-09-27)

| #   | Question                         | Decision                                                                               |
| --- | -------------------------------- | -------------------------------------------------------------------------------------- |
| Q1  | Use `@modelcontextprotocol/sdk`  | Yes                                                                                    |
| Q2  | Existing Worker `/mcp`           | Remove it; start over                                                                  |
| Q3  | Clients for `mcp install`        | Claude Code, Claude Desktop, Codex, Cursor                                             |
| Q4  | Remote MCP (ChatGPT, claude.ai)  | Not now                                                                                |
| Q5  | Environments                     | One local server for every environment on the computer; always clear which one is used |
| Q6  | Writes                           | Read-only                                                                              |
| Q7  | Skills                           | One skill: setup, health, operations, analytics, all read-only                         |
| Q8  | 30-day range cap                 | Keep                                                                                   |
| Q9  | Release                          | Phases A (MCP) and B (install + skill) together                                        |

## Context

- The admin API (`/v1/admin/*`) already serves what an assistant reads: projects, websites, overview
  analytics, actions report, website status, whoami, backend info, with roles (`admin`, `owner`,
  `analyst`) and project/website scope. Ranges are capped at 30 days.
- The CLI reads `~/.config/vizoalica/environments.json`, resolves secrets (file or OneCLI), and talks to
  Workers through `WorkerClient`.
- The Worker had a minimal, undocumented `POST /mcp` (admin secret only, two tools). It is removed (Q2).

## Goal

A user with at least one environment connects Claude Code, Claude Desktop, Codex, or Cursor with one command
and asks plain questions about analytics and backend health, across all their environments, without any
credential entering the model's conversation. A skill teaches the assistant how Vizoalica works.

## User Scenarios & Testing

### User Story 1 - Ask an AI assistant about my analytics (P1)

**Independent Test**: an MCP client connected to `createMcpServer` with two environments (prod admin, stage
analyst) lists tools, lists environments, and reads an overview from each; results match the Worker's and no
output contains a secret. Covered by `apps/cli/tests/mcp-server.test.ts` (fake Workers) and
`apps/cli/tests/mcp-worker.integration.test.ts` (the real Worker code and schema).

1. **Given** environments in `environments.json`, **When** a client starts `vizoalica mcp`, **Then** the
   handshake completes and only read-only tools are listed.
2. **Given** no `environment` argument, **Then** a call uses this session's environment: the one chosen with
   `use_environment`, else the console's last-used one if it works, else the only one, else the first that
   works; if none works, the call says so and names `vizoalica env list`.
3. **Given** any result, **Then** its first line is `Environment: <name> (<role>, <url>; <how it was chosen>)`,
   and when the environment was a default and others exist, it names them and how to switch.
4. **Given** a project with several websites, **Then** page rows name their website.
5. **Given** a scoped access key, **When** it asks about something outside its scope, **Then** it gets the
   same not-found the console gets.
6. **Given** a range over 30 days, **Then** the call fails with the reason and no request is sent.
7. No result, error, or log line contains an administrator secret, access key, or Cloudflare token.

### User Story 2 - Connect my AI client in one step (P1)

1. `vizoalica mcp install --client <claude-code|claude-desktop|codex|cursor>` adds a `vizoalica` server
   that runs this Node.js and this package by absolute path, with no secret.
2. An existing `vizoalica` entry is replaced only after a yes (or `--yes`); other entries and settings are
   kept byte for byte (TOML for Codex, JSON for the others; Claude Code via `claude mcp add --scope user`).
3. `--print` shows the change and makes none. With no client, the command lists the options.

### User Story 3 - The Vizoalica skill (P2)

1. `skills/vizoalica/SKILL.md` (Agent Skills format) plus `reference/data-model.md`, `setup.md`,
   `troubleshooting.md`: data model, what is never collected, ranges, availability, recipes, setup, health,
   operations, troubleshooting.
2. Rules in the skill: name the environment in every answer; never ask for or handle secrets; hand
   `env add`, `deploy`, `rotate` to the user; aggregates only; mark guesses.
3. `vizoalica skill install --client claude-code|codex` copies it to `~/.claude/skills/vizoalica` or
   `~/.codex/skills/vizoalica`; `vizoalica skill path` prints the packaged copy. Claude Desktop and claude.ai
   take an uploaded zip.

### Edge Cases

- Environments file missing, empty, broken, or world-readable: a plain message; the server keeps running.
- Environment unusable (secret rejected, Worker down, OneCLI failing): the message names
  `vizoalica env check <name>`.
- Name matches several projects or websites: the ids are listed. One visible project: `project` may be omitted.
- `vizoalica mcp` typed in a terminal: explains it is started by an AI client.
- stdout carries only protocol messages; `--verbose` goes to stderr.
- The client closes stdin: the server exits 0.

## Requirements

- **FR-001**: `vizoalica mcp` runs an MCP server over stdio from the published package.
- **FR-002**: It reads every environment from `environments.json` and authenticates with each environment's
  stored credential through `WorkerClient`; credentials are never tool inputs or outputs.
- **FR-003**: Tools are read-only (`readOnlyHint: true`, `destructiveHint: false`).
- **FR-004**: Tools: `list_environments`, `use_environment`, `get_environment_status`, `list_websites`,
  `get_website_status`, `get_traffic_overview`, `compare_periods`, `get_actions`. Analytics tools take an
  optional `environment`, `project` and `website` by name or id, `preset` or `start`/`end`, and `limit`.
- **FR-005**: Each result has an `Environment:` line, a one-line summary with the UTC range and data
  availability, and the data as JSON (also as `structuredContent`, with `environment`).
- **FR-006**: Prompts: `weekly_report`, `compare_weeks`, `page_actions`.
- **FR-007**: `use_environment` lasts for the session and never changes the console's preference.
- **FR-008**: `vizoalica mcp install` per US2; `vizoalica skill install|path` per US3.
- **FR-009**: The Worker has no `/mcp` route (404); the query only it used is removed.
- **FR-010**: Docs: `docs/operations/ai.md` on vizoalica.dev, README section, `llms.txt`, `vizoalica help`,
  changelog.

## Success Criteria

- **SC-001**: One command connects a client (`vizoalica mcp install --client <c>`).
- **SC-002**: Every tool answer names its environment (tested for each way of choosing it).
- **SC-003**: No secret in any tool output (the test harness scans every answer for the fixture secrets).
- **SC-004**: No native dependency. Measured: `dist/cli.mjs` grows from 162 KB to 1.2 MB, mostly Zod (the
  SDK's schema library), after dropping Zod's non-English locales from the bundle; the packed tarball grows
  from 424 KB to 628 KB.
- **SC-005**: New code is covered by tests; global coverage does not drop.

## Out of Scope

- Write tools. Remote MCP on the Worker (ChatGPT, claude.ai connectors) and OAuth.
- Ranges over 30 days, raw events, per-visitor data (constitution I).
- Any model or AI key inside Vizoalica.

## Assumptions

- Claude Code accepts `claude mcp add --scope user <name> -- <command> <args>` [likely].
- Claude Desktop reads `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or
  `~/.config/Claude/claude_desktop_config.json` (Linux) [likely]; Cursor `~/.cursor/mcp.json` [likely];
  Codex `~/.codex/config.toml` `[mcp_servers.<name>]` [likely].
- Codex loads skills from `~/.codex/skills/<name>/SKILL.md` [likely].
