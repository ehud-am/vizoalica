# Implementation Plan: AI Access (`vizoalica mcp` and the Vizoalica skill)

**Branch**: `021-ai-mcp-and-skill` | **Date**: 2026-09-27 | **Spec**: [spec.md](spec.md)

## Summary

A local stdio MCP server in the `vizoalica` command, built on the official TypeScript SDK, reads analytics
and health from every environment on the computer through the existing admin API and `WorkerClient`. A
user-facing skill ships in the package. Install helpers set up Claude Code, Claude Desktop, Codex, and Cursor.
The Worker's old `/mcp` endpoint is removed.

## Architecture

```text
 AI client (Claude Code / Desktop, Codex, Cursor)
        │ stdio (JSON-RPC); starts: <node> <cli.mjs> mcp
        ▼
 vizoalica mcp ── McpEnvironments ── environments.json (+ OneCLI), console preferences (read only)
   (apps/cli)         │ one WorkerClient per call, for the environment the call names or the session's
        │             ▼
        │      Worker /v1/admin/* of each environment (role and scope enforced there)
        └── skill: skills/vizoalica → dist/skill/vizoalica → ~/.claude/skills or ~/.codex/skills
```

## Files

| File                                         | Role                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `apps/cli/src/mcp/environments.ts`           | Every environment, their health (cached 30 s), the session's choice and how it was made |
| `apps/cli/src/mcp/server.ts`                 | Tools, prompts, instructions, result and error shaping                               |
| `apps/cli/src/mcp/range.ts`                  | Presets and dates to a UTC range; 30-day cap; previous period                        |
| `apps/cli/src/mcp/clients.ts`                | Client config paths and JSON/TOML edits that touch only the `vizoalica` entry        |
| `apps/cli/src/mcp-command.ts`                | `vizoalica mcp` (serve) and `vizoalica mcp install`                                  |
| `apps/cli/src/skill-command.ts`              | `vizoalica skill path|install`                                                       |
| `skills/vizoalica/`                          | The skill                                                                            |
| `scripts/build-package.mjs`                  | Copies the skill; drops Zod's non-English locales from the bundle                     |
| `docs/operations/ai.md`                      | User guide                                                                           |

Reused without change: `readEnvironments`, `verifyEnvironment`, `resolveSecret`, `WorkerClient`,
`analyticsOverview`, `analyticsActions`, `workerJson`, `checkReachability`, `checkInstall`, `versionStatus`,
`parseAnalyticsRange`.

## Environment clarity (Q5)

- Default for a session: `use_environment` choice → console's last-used (if it works) → the only one → the
  first that works. Chosen once per session, then stable.
- Every result's first line names the environment, role, URL, and why it was used; defaults also list the
  other environments and how to switch. `structuredContent.environment` carries the same.
- The server `instructions` and the skill both tell the model to name the environment in its answers.

## Constitution Check

- I Privacy-minimal: only existing aggregate routes; no new fields. ✅
- II Security: credentials stay in the `vizoalica` process; read-only; Worker enforces role and scope;
  the unauthenticated-reachable `/mcp` route is gone. Secret-leak scan in tests. ✅
- III Open standards: MCP and Agent Skills. ✅
- IV Minimal infrastructure: no Cloudflare resource or schema change. ✅
- V Readable: small modules; the skill is plain Markdown. ✅

## Verification

- Unit and protocol tests with an in-memory MCP client (`apps/cli/tests/mcp-server.test.ts`).
- Command tests, including a stdio round trip (`apps/cli/tests/mcp-command.test.ts`).
- The server against the real Worker and schema in process (`apps/cli/tests/mcp-worker.integration.test.ts`).
- Manual: `pnpm package:build`, then JSON-RPC over stdio to `node apps/cli/package/dist/cli.mjs mcp`.

## Risks

- Client config formats change; `--print` and the docs' manual steps are the fallback.
- The config records Node.js by absolute path; changing Node.js versions needs `vizoalica mcp install` again.
- Bundle size (see spec SC-004).
