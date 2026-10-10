# Implementation Plan: Quality and Simplicity Patch Release (v0.5.2)

**Branch**: `main` | **Date**: 2026-09-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-quality-simplicity-release/spec.md`

## Summary

Ship v0.5.2 as a quality/simplicity patch release proven through five sequential expert-review
iterations. This plan covers the first iteration in full detail — Phase 1 (QA/deployment
engineer): replace the broken "dynamic" website deployment path (a manual shell-command
generator) with a reusable GitHub Actions workflow that customer website repositories adopt,
publish the vizoalica Pages Functions from a versioned location instead of hand-copied source,
inject all per-deployment configuration via GitHub Actions variables/secrets into the Cloudflare
Pages environment, and give the admin console real deploy-status visibility. Later iterations
(security, platform/cost, Cloudflare hardening, system-architect alignment) are scoped as
objectives in the spec and will get their own plan amendments at each check-in, per the user's
confirmed cadence, since findings from one phase change the next (e.g., the security review's
rate-limiting gap becomes a Cloudflare-hardening task).

## Technical Context

**Language/Version**: TypeScript (Node.js >=22), pnpm workspaces monorepo.

**Primary Dependencies**: Cloudflare Workers/Pages + Wrangler (backend, Pages Functions), Hono or
raw `fetch`-style handlers in `apps/ingest-worker`/`apps/ingest-api`, React (admin-web), GitHub
Actions (new: reusable `workflow_call` workflow + composite steps), `gh`/`wrangler` CLIs.

**Storage**: Cloudflare D1 (event/aggregate storage), R2 (raw retention) — unaffected by Phase 1;
no new storage needed for the deployment workflow itself. Deployment/CI state (last deploy
status) is read from GitHub Actions' own run history via the GitHub API rather than duplicated in
D1, to avoid a new source of truth.

**Testing**: Vitest (unit/contract/integration, `pnpm test`/`pnpm coverage`), Playwright
(`pnpm test:e2e` for admin-web), `pnpm typecheck`, `pnpm lint`. New: a workflow-level smoke test
(actionlint/dry run) for the new GitHub Actions YAML, since it cannot be unit-tested the normal
way.

**Target Platform**: Cloudflare Workers (backend), Cloudflare Pages (customer websites), GitHub
Actions (customer + this repo's CI).

**Project Type**: Web service + CLI + reusable CI/CD workflow (monorepo: `apps/*`, `packages/*`,
`.github/workflows/*`, `examples/cloudflare-pages/*`).

**Performance Goals**: No new latency-sensitive path introduced (deploy-time only); existing
ingest-path performance is unaffected by Phase 1. Deploy workflow itself should complete within a
typical Pages deploy time (Cloudflare deploy step is the bottleneck, not this project's code).

**Constraints**: Zero real per-deployment values (data-source/project/URLs) may be committed to a
customer website's source. Static integration path must remain unchanged and working. Full
5-minute time budget for backend+operator+one customer website from zero.

**Scale/Scope**: Single new reusable workflow + its console-facing consumption; touches
`examples/cloudflare-pages/`, `.github/workflows/`, `apps/admin-web/src/{components,pages}`,
`apps/local-ops-api/src/routes/snippet.ts`, `apps/deploy-cli` (thin addition only if needed),
`docs/operations/{pages,cloudflare,releases}.md`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle II (Security, Privacy, and Abuse Resistance)**: "Server secrets and administrative
  credentials MUST never be embedded in websites, client bundles, logs, or examples." Directly
  satisfied by design — the entire point of Phase 1 is moving values out of customer source into
  GitHub Actions secrets/Cloudflare Pages environment. PASS.
- **Principle IV (Minimal Infrastructure and AI-Assisted Deployment)**: "Deployment MUST be
  designed as an AI-agent-operable workflow... support both agent-assisted CI/CD and supervised
  manual deployment from concise user intent, produce a reviewable deployment plan, request only
  necessary credentials, apply least-privilege access, validate the deployed system, and report
  an auditable result. It MUST NOT silently create resources, expose secrets, or bypass a
  customer's approval boundary." This is the direct mandate for what Phase 1 builds. The
  reusable workflow must fail loudly on missing config (FR-004), never auto-create Cloudflare
  resources without the operator having supplied the account/project identifiers, and every run
  is auditable via GitHub Actions' own run log. PASS, with the design obligation carried into
  Phase 0 research (least-privilege token scope) and Phase 4 (Cloudflare hardening review of the
  same token).
- **Development Workflow gate**: coverage must stay >90%; new UI/console changes affecting the
  website integration panel must meet WCAG 2.2 AA (Accessible Product Experience section) —
  carried as an explicit task in Phase 1's task list, not deferred.
- **Release gate**: "A human release owner MUST make the final go/no-go decision" — this plan and
  all phases produce recommendations and working changes; tagging v0.5.2 requires the user's
  explicit go-ahead (already reflected in the overall plan's Phase 5).

No violations requiring Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/011-quality-simplicity-release/
├── plan.md              # This file
├── research.md          # Phase 0 output (this iteration)
├── data-model.md         # Phase 1 output (this iteration)
├── quickstart.md         # Phase 1 output (this iteration)
├── contracts/             # Phase 1 output (this iteration)
└── tasks.md               # Phase 2 output ($speckit-tasks) — Phase 1 scope only for now
```

### Source Code (repository root)

```text
.github/workflows/
└── deploy-vizoalica-pages.yml     # NEW: reusable workflow (workflow_call) customer repos adopt

examples/cloudflare-pages/
├── functions/vizoalica/
│   ├── config.json.ts             # existing, unchanged (already env-driven)
│   └── ingest-token.ts            # existing, unchanged (already env-driven)
├── public/vizoalica-loader.js     # existing, versioned/published for the workflow to fetch
└── README.md                      # updated: CI/CD adoption instructions supersede manual steps

apps/local-ops-api/src/routes/
└── snippet.ts                     # updated: emit CI/CD variable/secret checklist + starter
                                    # workflow snippet instead of raw shell command list

apps/admin-web/src/
├── components/IntegrationSnippet.tsx   # redesigned: CI/CD-first panel, deploy status
└── pages/WebsitesPage.tsx              # updated: surface deploy status per website

apps/deploy-cli/src/
└── (thin addition only if a `deploy website` companion subcommand proves necessary)

docs/operations/
├── pages.md         # rewritten around the CI/CD path; static path kept as documented fallback
├── cloudflare.md     # linked from a single consolidated setup sequence (User Story 3)
└── releases.md       # updated release checklist referencing this feature's phases
```

**Structure Decision**: Extend the existing monorepo layout in place — no new app/package is
needed. The reusable workflow lives at the conventional GitHub Actions path
(`.github/workflows/deploy-vizoalica-pages.yml`) so customer repos can reference it with
`uses: ehud-am/vizoalica/.github/workflows/deploy-vizoalica-pages.yml@<ref>`. The Pages Functions
customers need are already correctly factored under `examples/cloudflare-pages/functions/`; Phase
1 changes how they reach a customer repo (via the workflow) and how the console explains that,
not their own code.

## Complexity Tracking

No constitution violations requiring justification.
