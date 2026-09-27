# Tasks: AI Access (`vizoalica mcp` and the Vizoalica skill)

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Tests**: Included (constitution: tests for changed behaviour, negative security tests, coverage ≥ 90%).

**Format**: `- [ ] T### [P?] [Story?] Description with file path`. `[P]` = parallelizable.

**Stories**: US1 ask questions via local MCP (P1) · US2 one-step client install (P1) · US3 skill (P2) ·
US4 remote MCP on the Worker (P3).

Status: not started. Blocked on the Open Questions in spec.md.

## Phase 1: Setup

- [ ] T001 Confirm answers to open questions; record decisions in `specs/021-ai-mcp-and-skill/research.md`
- [ ] T002 [P] Verify current client config formats and skill folders for Claude Code, Claude Desktop, Codex, Cursor; record in research.md
- [ ] T003 [P] Spike: bundle `@modelcontextprotocol/sdk` into `dist/cli.mjs`; record size delta and ESM issues in research.md
- [ ] T004 Create `packages/ai-tools` (package.json, tsconfig, index) and add to workspace/tsconfig references

## Phase 2: Foundational

- [ ] T005 Define `AnalyticsReader` interface and tool definitions (names, input/output schemas) in `packages/ai-tools/src/tools.ts`
- [ ] T006 [P] Range presets → UTC range with 30-day cap, reusing `apps/ingest-api/src/analytics/range.ts`, in `packages/ai-tools/src/range.ts` + tests
- [ ] T007 [P] Name-or-id resolution for projects/websites (ambiguity returns candidates) in `packages/ai-tools/src/resolve.ts` + tests
- [ ] T008 Result shaping: text summary + structured content, website name on page rows, availability line, in `packages/ai-tools/src/format.ts` + tests

## Phase 3: US1 local MCP server (P1) 🎯 MVP

- [ ] T009 [US1] Local `AnalyticsReader` over `WorkerClient` using `apps/local-ops-api/src/routes/analytics.ts` and `websites.ts` helpers, in `apps/cli/src/mcp/local-reader.ts`
- [ ] T010 [US1] Handlers for `whoami`, `list_websites`, `get_overview`, `get_top_pages`, `get_actions`, `get_website_status` in `packages/ai-tools/src/handlers.ts`
- [ ] T011 [US1] `compare_periods` (two overview calls, totals + page deltas) in `packages/ai-tools/src/compare.ts` + tests
- [ ] T012 [US1] `vizoalica mcp [--env]` command: env selection (flag → last used → only working), stdio transport, stderr-only logging, in `apps/cli/src/mcp-command.ts`; wire in `apps/cli/src/main.ts` and `help()`
- [ ] T013 [US1] MCP prompts `weekly_report`, `compare_weeks`, `page_actions` in `packages/ai-tools/src/prompts.ts`
- [ ] T014 [P] [US1] In-memory MCP client tests: handshake, tools/list, each tool against a fake reader, in `packages/ai-tools/tests/`
- [ ] T015 [P] [US1] Negative tests: scoped key cannot read another website; unusable env returns fix hint; >30-day range error; in `apps/cli/tests/mcp-command.test.ts`
- [ ] T016 [P] [US1] Secret-leak test: scan every tool output, stderr trace, and error for fixture secrets (SC-003)
- [ ] T017 [US1] E2E: spawn built `dist/cli.mjs mcp` over stdio against a fake Worker; assert handshake and one overview call
- [ ] T018 [US1] Docs: `docs/operations/ai.md` ("Use Vizoalica with AI": manual config per client), README section, `llms.txt`, docs site nav

**Checkpoint**: usable MVP; releasable as a minor version.

## Phase 4: US2 one-step client install (P1)

- [ ] T019 [US2] Client targets (path, format, writer) for claude-code, claude-desktop, codex, cursor in `apps/cli/src/mcp/clients.ts`
- [ ] T020 [US2] `vizoalica mcp install [--client] [--env] [--print] [--yes]`: diff + confirm, never writes a secret, in `apps/cli/src/mcp-command.ts`
- [ ] T021 [P] [US2] Tests per client with temp HOME: create, replace with confirm, `--print` no-op, TOML/JSON preserved
- [ ] T022 [US2] Docs: replace manual steps in `docs/operations/ai.md` with the one command; keep manual as fallback

## Phase 5: US3 skill (P2)

- [ ] T023 [US3] Write `skills/vizoalica/SKILL.md` and `reference/{data-model,setup,recipes}.md`
- [ ] T024 [US3] Ship `skills/` in the npm package (`apps/cli/package.json.template` `files`, build copy step)
- [ ] T025 [US3] `vizoalica skill path` and `vizoalica skill install --client claude-code|codex` in `apps/cli/src/skill-command.ts` + tests
- [ ] T026 [P] [US3] Release workflow: attach `vizoalica-skill.zip` to GitHub releases in `.github/workflows/`
- [ ] T027 [US3] Evaluation set: ~15 questions + fixture data + expected tools/numbers in `specs/021-ai-mcp-and-skill/evals/`; run manually with Claude Code and Codex; record results (SC-002)

## Phase 6: US4 remote MCP on the Worker (P3)

- [ ] T028 [US4] Extract admin-adapter scope checks into a shared function in `apps/ingest-worker/src/auth/scope.ts`; admin adapter uses it (no behaviour change; existing tests pass)
- [ ] T029 [US4] Worker `AnalyticsReader` over repositories + `resolvePrincipal` in `apps/ingest-worker/src/http/mcp-reader.ts`
- [ ] T030 [US4] Replace `mcp-adapter.ts` with Streamable HTTP (stateless) using `packages/ai-tools`; keep old tool names as deprecated aliases for one release
- [ ] T031 [P] [US4] Tests: access-key roles and scope, denial audit, old-tool aliases, bundle size check for the Worker
- [ ] T032 [US4] Docs: connecting ChatGPT / claude.ai to `https://<worker>/mcp` with an analyst access key

## Phase 7: Polish

- [ ] T033 Coverage ≥ 90% for new code; `pnpm typecheck && pnpm lint && pnpm test`
- [ ] T034 CHANGELOG entry; vizoalica.dev "AI" page and promo copy
- [ ] T035 Update `.specify/feature.json` to this feature
