# Feature Specification: AI Access (`vizoalica mcp` and the Vizoalica skill)

**Feature Branch**: `021-ai-mcp-and-skill`

**Created**: 2026-09-27

**Status**: Draft (planning only; not approved for implementation)

**Input**: "Deliver AI capabilities: an MCP on top of the APIs, a new command `vizoalica mcp`, and a new
skill file that can be deployed to Claude and ChatGPT/Codex."

## Context: what exists today

- The Worker already serves a minimal MCP endpoint, `POST /mcp`
  (`apps/ingest-worker/src/http/mcp-adapter.ts`, from spec 002). It is admin-secret only, hand-rolled
  JSON-RPC, protocol `2025-03-26`, two tools (`list_projects_and_sources`, `get_page_view_counts`), no
  access-key roles, no streaming/session support, and is undocumented for users.
- The admin API (`/v1/admin/*`) already has everything an AI needs to read: projects, websites,
  overview analytics (totals, trend, top pages, countries, referrers, user agents, OS, browsers, devices,
  traffic), actions report, website status, backend info. It enforces roles (`admin`, `owner`,
  `analyst`) and scope (project / website) for access keys. Ranges are capped at 30 days.
- The CLI (`vizoalica`) reads `~/.config/vizoalica/environments.json`, resolves secrets (file or OneCLI)
  and talks to Workers via `WorkerClient` (`apps/local-ops-api/src/remote-client/worker-client.ts`).
- The repo has one agent skill already, `.agents/skills/vizoalica-cloudflare-deploy`, for contributors
  deploying from a checkout. It is not shipped to users.

## Goal

A user who has run `vizoalica env add` can connect Claude (Code or Desktop), Codex, Cursor, or any MCP
client to their own analytics with one command, and ask plain questions ("how did traffic change this
week?", "which buttons on /pricing get clicked?") without the credential ever entering the model's
conversation. A skill file teaches the agent how to answer well and safely.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ask an AI assistant about my analytics (Priority: P1) 🎯 MVP

An operator with a working environment registers `vizoalica mcp` as a local MCP server in their AI
client and asks analytics questions in natural language.

**Independent Test**: With a fake Worker holding two projects (one with two websites), an MCP client
spawns `vizoalica mcp --env prod`, lists tools, lists projects, and gets an overview for one website;
results match the admin API and contain no secret.

**Acceptance Scenarios**:

1. **Given** a working environment `prod`, **When** a client starts `vizoalica mcp --env prod` over
   stdio, **Then** it completes the MCP handshake and lists the read-only tools in FR-004.
2. **Given** no `--env`, **When** the server starts, **Then** it uses the last-selected environment if it
   works, else the only working one, else fails the handshake-time tool calls with a message naming
   `vizoalica env list`.
3. **Given** a project with two websites, **When** the agent asks for top pages at project level,
   **Then** every page row names its website (ties to the "top URLs need the website name" item).
4. **Given** an `analyst` or `owner` access key scoped to one website, **When** the agent asks about
   another website, **Then** it gets `not_found`, exactly as the admin API answers.
5. **Given** any tool call, **Then** the response and server logs never contain the admin secret, an
   access key, a Cloudflare token, a visitor identifier, or a raw event.
6. **Given** a range longer than 30 days, **When** a tool is called, **Then** it returns a clear
   error explaining the 30-day cap (no silent truncation).

---

### User Story 2 - Connect my AI client in one step (Priority: P1)

**Independent Test**: `vizoalica mcp install --client claude-code` on a clean machine results in Claude
Code listing a `vizoalica` server; the command output shows exactly what file was changed.

**Acceptance Scenarios**:

1. **Given** a supported client (see Q3), **When** the operator runs `vizoalica mcp install --client
   <c> [--env <name>]`, **Then** the client's MCP config gains a `vizoalica` entry that runs
   `vizoalica mcp --env <name>`, with no secret in that config.
2. **Given** an existing `vizoalica` entry, **When** install runs again, **Then** it shows the diff and
   asks before replacing (`--yes` skips the question).
3. **Given** `--print`, **Then** it prints the config snippet and changes nothing.
4. `vizoalica mcp install` with no client prints the snippet for each supported client.

---

### User Story 3 - The agent answers well: the Vizoalica skill (Priority: P2)

A skill (Agent Skills format: `SKILL.md` with `name` and `description` frontmatter, plus reference
files) teaches an agent how Vizoalica's data works and how to answer common questions with the MCP tools.

**Independent Test**: For an evaluation set of ~15 questions against fixture data, an agent with the
skill calls the right tools and its answer states correct numbers, the range, and data availability.

**Acceptance Scenarios**:

1. The skill covers: the data model (projects, websites, page keys like `/orders/:id`, actions, custom
   events, consent), what is never collected, ranges and the 30-day cap, availability states
   (`processing`, `incomplete`), and recipes: weekly summary, period-over-period comparison, top pages
   per website, action/click analysis for a page, referrer and country breakdown, "is my site sending
   data?".
2. The skill tells the agent never to ask the user for a secret and to send setup or secret steps
   (`env add`, `deploy`, `rotate`) to the user to run in their own terminal.
3. The skill works without the MCP server for setup questions (install, `env add`, embed) by pointing
   to docs; with the MCP server it answers data questions.
4. `vizoalica skill install --client claude-code|codex` copies the skill to the client's skills folder;
   `vizoalica skill path` prints where the packaged copy is; a release asset `vizoalica-skill.zip` is
   uploadable to claude.ai (Settings → Capabilities → Skills) [likely] and ChatGPT where supported [guess].

---

### User Story 4 - Use Vizoalica from ChatGPT or claude.ai (remote MCP) (Priority: P3)

Web chat clients cannot start a local process; they need a remote MCP URL [likely].

**Acceptance Scenarios**:

1. **Given** a deployed Worker, **When** a remote client connects to `https://<worker>/mcp` with an
   access key (analyst/owner) or admin secret as a bearer token, **Then** it gets the same read-only
   tools as US1 over the MCP Streamable HTTP transport, scoped by the same role rules.
2. The existing two tools keep working for one release (deprecated alias) [guess: see Q2].
3. OAuth for connectors that require it is out of scope for this spec (see Q4).

---

### Edge Cases

- Environment unusable (wrong secret, Worker down, OneCLI locked): tool returns a plain message and the
  `vizoalica env` command that fixes it; the server does not crash.
- Worker older than the MCP feature (no route or older schema): tools that need newer routes report
  "backend too old; update with …" rather than failing opaquely.
- Aggregates still processing: answers carry `availability.state` so the agent can say "partial".
- Very large projects: rankings are already bounded server-side (top N + `other`); MCP passes that through.
- stdout pollution: any log goes to stderr only; `--verbose` traces to stderr.
- Multiple environments: one server serves one environment by default; `--all-envs` [guess] exposes an
  `environment` argument on every tool (see Q5).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: New command `vizoalica mcp [--env <name>] [--verbose]` runs an MCP server over stdio in the
  published npm package (no source checkout).
- **FR-002**: The server authenticates to the Worker with the environment's stored credential (file or
  OneCLI) via the existing `WorkerClient`; the credential is never an MCP input or output.
- **FR-003**: v1 tools are read-only. No tool creates, changes, deletes, rotates, deploys, or reveals a
  secret or snippet token.
- **FR-004**: v1 tools (names final at plan review):
  - `whoami`: environment name, role, scope, Worker version, schema status.
  - `list_websites`: projects and their websites (ids, names, origins, status). No keys.
  - `get_overview`: project or website, `start`/`end` (ISO date or `last_7_days`-style preset), returns
    totals, trend, top pages (with website name at project scope), referrers, countries, OS, browsers,
    devices, traffic, availability.
  - `get_top_pages`: slimmer, page-focused variant of the above with `limit` [guess: may fold into
    `get_overview`, see plan].
  - `compare_periods`: two ranges, returns totals and per-page deltas (computed client-side from two
    overview calls).
  - `get_actions`: actions report with optional `page`/`action` filters.
  - `get_website_status`: collection/configuration health for one website ("is it sending data?").
- **FR-005**: Tool results include structured content (JSON) plus a short text summary, and every result
  states the range in UTC and the availability state.
- **FR-006**: The server exposes MCP prompts for the skill's main recipes (`weekly_report`,
  `compare_weeks`, `page_actions`) [guess: useful in Claude Desktop's prompt picker].
- **FR-007**: `vizoalica mcp install --client <c>` writes or prints client config per US2; it never
  writes a secret into a client config.
- **FR-008**: A user-facing skill lives in the repo at `skills/vizoalica/` and ships in the npm package;
  `vizoalica skill install|path` per US3.
- **FR-009**: Worker `/mcp` is upgraded to Streamable HTTP with role/scope resolution identical to the
  admin API (`resolvePrincipal`), sharing one tool implementation with the local server (US4, P3).
- **FR-010**: Every allowed and denied MCP tool call on the Worker is audited as today (operation,
  outcome, scope; never arguments beyond ids).
- **FR-011**: Docs: a page "Use Vizoalica with AI" on vizoalica.dev, a README section, `llms.txt` entry,
  and `vizoalica help` line.

### Key Entities

- **MCP tool**: name, JSON input schema, output schema, text summary, role rules (same as the admin route
  it calls).
- **Skill**: `SKILL.md` + `reference/*.md`; versioned with the package.
- **Client config target**: client name, config path, entry format, whether it supports stdio.

## Success Criteria *(mandatory)*

- **SC-001**: From a working environment, connecting Claude Code takes one command and under 1 minute.
- **SC-002**: On the evaluation set, ≥ 90% of answers call the correct tool(s) and state correct numbers.
- **SC-003**: Zero secrets in any MCP output, client config, log line, or test snapshot (checked by a test
  that scans outputs for the fixture secrets).
- **SC-004**: `vizoalica mcp` adds < 150 KB to the published package [guess] and no native dependency.
- **SC-005**: Coverage for new code ≥ 90% (constitution gate).

## Assumptions

- Local stdio covers Claude Code, Claude Desktop, Codex CLI, Cursor, VS Code, and most IDE agents
  [likely]. ChatGPT (web/desktop) needs a remote HTTPS MCP server [likely], hence US4.
- Codex reads MCP servers from `~/.codex/config.toml` (`[mcp_servers.<name>]`) [likely] and supports
  Agent Skills-format skills [likely; verify at implementation].
- The official TypeScript MCP SDK (`@modelcontextprotocol/sdk`) is acceptable as a dependency (Q1).
- Item 1 of the same request (website name on top URLs) may add the website to project-level page
  rankings in the Worker. If it lands first, MCP reuses it; if not, MCP resolves names by calling the
  overview per website [guess].

## Out of Scope (v1)

- Write tools (create website, disable website, get snippet, create access key). Candidate for v2 behind
  an explicit `--allow-writes` flag (Q6).
- OAuth / Dynamic Client Registration for remote MCP.
- Ranges over 30 days, raw events, per-visitor data (forbidden by constitution I).
- An LLM running inside Vizoalica (no AI keys, no hosted inference).

## Open Questions (answer before implementation)

- **Q1**: OK to add `@modelcontextprotocol/sdk` (and `zod`) as dependencies, or keep the hand-rolled JSON-RPC style of the current Worker `/mcp`?
- **Q2**: Existing Worker `/mcp` (admin-only, 2 tools): upgrade in place with deprecated aliases (default), remove, or leave as is?
- **Q3**: Which clients must `vizoalica mcp install` support in v1? Default: Claude Code, Claude Desktop, Codex, Cursor.
- **Q4**: Is ChatGPT/claude.ai (remote MCP, Phase C) needed in this release, and is bearer-key auth enough, or is OAuth required?
- **Q5**: One environment per server (default) or one server spanning all environments with an `environment` argument?
- **Q6**: v1 read-only (default), or include write tools (add website, get snippet, create access key) behind `--allow-writes`?
- **Q7**: Skill: one user skill named `vizoalica` (default), or split into `vizoalica-analytics` and `vizoalica-setup`?
- **Q8**: 30-day range cap: keep (default; skill explains it) or raise to 90 days in the Worker as part of this work?
- **Q9**: Release: ship Phase A alone as the next minor version (default), or wait for Phases A+B together?
