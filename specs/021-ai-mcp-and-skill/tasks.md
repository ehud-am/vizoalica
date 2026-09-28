# Tasks: AI Access (`vizoalica mcp` and the Vizoalica skill)

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [X] T### Description with file path`.

## Phase 1: Setup

- [x] T001 Record the decisions (Q1 to Q9) in spec.md
- [x] T002 Add `@modelcontextprotocol/sdk` and `zod` to `apps/cli/package.json`; measure the bundle (spec SC-004)
- [x] T003 Drop Zod's non-English locales from the bundle in `scripts/build-package.mjs`

## Phase 2: Remove the old Worker MCP (Q2)

- [x] T004 Delete `apps/ingest-worker/src/http/mcp-adapter.ts` and its test; unwire it in `worker-adapter.ts`
- [x] T005 Remove `getPageViewCounts` (only the old MCP used it) from the repository interface, D1 repository, and tests
- [x] T006 Tests assert `/mcp` answers 404 for keys; denial-audit tests and comments cover admin only

## Phase 3: US1 local MCP server

- [x] T007 `apps/cli/src/mcp/environments.ts`: all environments, health cache, session choice, default order
- [x] T008 `apps/cli/src/mcp/range.ts`: presets, dates, 30-day cap, previous period
- [x] T009 `apps/cli/src/mcp/server.ts`: eight read-only tools, three prompts, instructions, `Environment:` line
- [x] T010 `apps/cli/src/mcp-command.ts`: stdio server, exits when stdin closes; `--verbose` to stderr in `main.ts`
- [x] T011 Tests: `apps/cli/tests/mcp-server.test.ts` (fake Workers, secret scan), `mcp-worker.integration.test.ts` (real Worker)

## Phase 4: US2 client install

- [x] T012 `apps/cli/src/mcp/clients.ts`: paths, JSON and TOML edits, snippets
- [x] T013 `vizoalica mcp install --client … [--print] [--yes]`; Claude Code via `claude mcp add --scope user`
- [x] T014 Tests in `apps/cli/tests/mcp-command.test.ts`

## Phase 5: US3 skill

- [x] T015 `skills/vizoalica/SKILL.md` and `reference/{data-model,setup,troubleshooting}.md`
- [x] T016 Ship it in the package (`scripts/build-package.mjs`, `scripts/lib/package-check.mjs`)
- [x] T017 `vizoalica skill path|install` in `apps/cli/src/skill-command.ts`, with tests
- [x] T018 Attach `vizoalica-skill.zip` to GitHub releases (`.github/workflows/skill-release.yml`) for Claude Desktop and claude.ai

## Phase 6: Docs and checks

- [x] T019 `docs/operations/ai.md`, site navigation, README section and table row, `llms.txt`, CLI README, help, CHANGELOG
- [x] T020 `pnpm typecheck && pnpm lint && pnpm format:check && pnpm coverage`
- [ ] T021 Try each client by hand on macOS: Claude Code, Claude Desktop, Codex, Cursor (config paths are marked [likely] in spec.md)
