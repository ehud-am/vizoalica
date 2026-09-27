# Implementation Plan: AI Access (`vizoalica mcp` and the Vizoalica skill)

**Branch**: `021-ai-mcp-and-skill` | **Date**: 2026-09-27 | **Spec**: [spec.md](spec.md)

## Summary

Add a local stdio MCP server to the `vizoalica` CLI that exposes read-only analytics tools over the
existing admin API, using the environment's stored credential. Ship a user-facing Agent Skill with the
package and install helpers for common AI clients. Later, upgrade the Worker's existing `/mcp` endpoint to
the same tool set over Streamable HTTP so web clients (ChatGPT, claude.ai) can connect.

## Architecture

```text
 AI client (Claude Code / Desktop, Codex, Cursor)          ChatGPT / claude.ai (phase 3)
        │ stdio (JSON-RPC)                                        │ HTTPS, Bearer access key
        ▼                                                         ▼
 vizoalica mcp  ── packages/ai-tools ──┐              Worker /mcp ── packages/ai-tools
 (apps/cli)       tool defs + handlers │                  (apps/ingest-worker)
        │ WorkerClient (secret stays   │                        │ in-process repositories
        │ on this machine)             │                        │ (same role/scope rules)
        ▼                              │                        ▼
 Worker /v1/admin/* ◄──────────────────┘                  D1 aggregates
```

- **`packages/ai-tools`** (new, pure TypeScript, no I/O): tool names, input/output JSON schemas,
  argument validation (ids, range presets → UTC range, 30-day cap), result shaping (text summary +
  structured content, website names on page rows), `compare_periods` math. It depends on an interface
  `AnalyticsReader` with methods `whoami`, `listWebsites`, `overview`, `actions`, `websiteStatus`.
- **Local reader**: implements `AnalyticsReader` with the existing `local-ops-api` route helpers
  (`analyticsOverview`, `analyticsActions`, `workerJson`) over `WorkerClient`.
- **Worker reader** (phase 3): implements `AnalyticsReader` over repositories after `resolvePrincipal`,
  reusing the admin adapter's scope checks (extract them into a shared function first).
- **Transport**: `@modelcontextprotocol/sdk` `McpServer` + `StdioServerTransport` locally; phase 3 uses
  its Streamable HTTP transport in stateless mode on the Worker [likely compatible with Workers; verify,
  else keep the hand-rolled JSON-RPC and add Streamable HTTP framing].

## Technical Context

**Language**: TypeScript, Node.js ≥ 22 (CLI), Cloudflare Workers (phase 3)
**New dependency**: `@modelcontextprotocol/sdk` (+ its `zod` peer) [Q1]
**Storage**: none new; no schema migration
**Testing**: Vitest; an in-process MCP client (SDK `Client` + in-memory transport) against a fake
`AnalyticsReader`; one end-to-end test spawning `dist/cli.mjs mcp` over stdio against a fake Worker
**Packaging**: CLI bundle already builds `dist/cli.mjs`; skill folder added to `files` in
`apps/cli/package.json.template`
**Constraints**: stdout reserved for JSON-RPC; no secret in output; aggregates only; 30-day cap

## Tool surface (v1, read-only)

| Tool                 | Calls                                           | Notes                                               |
| -------------------- | ----------------------------------------------- | --------------------------------------------------- |
| `whoami`             | `GET /v1/admin/whoami`, `/v1/admin/backend`     | env name, role, scope, versions                     |
| `list_websites`      | `GET /v1/admin/projects`, `…/sources`           | names + ids; no keys                                |
| `get_overview`       | `GET …/projects/:p/analytics?start&end[&source_id]` | presets: `today`, `yesterday`, `last_7_days`, `last_30_days`, `this_week`, `last_week`, `this_month` (≤30d) |
| `get_top_pages`      | same as overview, page rankings only            | may fold into `get_overview` via `sections` arg     |
| `compare_periods`    | two overview calls                              | totals + page deltas, % change                      |
| `get_actions`        | `GET …/projects/:p/analytics/actions`           | `page`, `action` filters                            |
| `get_website_status` | `GET …/sources/:s/status`                       | "is it sending data?"                               |

Arguments accept a project/website **name or id**; names resolve through `list_websites` (cached per
server process for 60 s) [guess]. Ambiguous names return the candidates.

Prompts (FR-006): `weekly_report`, `compare_weeks`, `page_actions`.

## Skill layout

```text
skills/vizoalica/
├── SKILL.md                 # when to use, rules (no secrets, aggregates only), tool map, recipes
└── reference/
    ├── data-model.md        # projects, websites, page keys, actions, events, consent, availability
    ├── setup.md             # install, env add, embed; which steps the human must run
    └── recipes.md           # weekly report, comparisons, action analysis, troubleshooting "no data"
```

Distribution: in the npm package (`vizoalica skill path`), copied by `vizoalica skill install --client
claude-code|codex` to `~/.claude/skills/vizoalica/` or `~/.codex/skills/vizoalica/` [likely paths;
verify], and a `vizoalica-skill.zip` release asset for claude.ai upload. The contributor skill
`.agents/skills/vizoalica-cloudflare-deploy` stays separate.

## Client install targets (`vizoalica mcp install`)

| Client         | Mechanism [likely; verify each]                                   |
| -------------- | ----------------------------------------------------------------- |
| Claude Code    | run `claude mcp add vizoalica -- vizoalica mcp --env <n>` or print it |
| Claude Desktop | edit `claude_desktop_config.json` (`mcpServers.vizoalica`)       |
| Codex CLI      | edit `~/.codex/config.toml` (`[mcp_servers.vizoalica]`)          |
| Cursor         | edit `~/.cursor/mcp.json`                                        |
| other          | `--print` a generic `{command, args}` snippet                    |

## Constitution Check

- I Privacy-minimal: only existing aggregate routes; no new fields. ✅
- II Security: credential stays in the CLI process; read-only v1; role/scope enforced by Worker; remote
  `/mcp` uses the same `resolvePrincipal`. Negative tests for scope escape and secret leakage. ✅
- III Open standards: MCP and Agent Skills are open formats. ✅
- IV Minimal infrastructure: no new Cloudflare resources; no migration. ✅
- V Readable, AI-ready: tool definitions in one small package; skill is plain Markdown. ✅

## Phasing (delivery order)

1. **Phase A (MVP)**: `packages/ai-tools` + `vizoalica mcp` stdio + tests + docs page. Usable in Claude
   Code/Desktop/Codex by hand-editing config.
2. **Phase B**: `vizoalica mcp install`, the skill, `vizoalica skill install|path`, evaluation set,
   release asset.
3. **Phase C**: Worker `/mcp` upgrade to Streamable HTTP with access-key roles (for ChatGPT/claude.ai);
   deprecate the two old tools.
4. **Phase D (v2, separate spec)**: opt-in write tools; OAuth for remote MCP.

## Risks

- MCP SDK size/ESM bundling in `dist/cli.mjs` [guess: fine with the existing bundler; measure].
- Client config formats change often; keep `--print` as the always-works path.
- Remote MCP on Workers: SDK transport compatibility and ChatGPT's auth expectations (OAuth) may force a
  larger Phase C.
- 30-day cap limits "month over month" questions; skill must explain it; raising the cap is a Worker
  change outside this spec.
