# Implementation Plan: Separate Deployment Journeys

**Branch**: `009-separate-deployment-journeys` | **Date**: 2026-09-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/009-separate-deployment-journeys/spec.md`

## Summary

Reframe installation as four self-contained, repeatable journeys with an explicit README run
matrix: one Cloudflare backend per customer, either a direct-secret or OneCLI local workstation
per operator, and one collection setup per website. Replace the historical five-file D1 evolution
with one fresh-release baseline, reject non-empty databases before applying it, and align all
active operational, troubleshooting, cost, and release guidance. Preserve the existing security
lanes, approval-gated deployment profile flow, native Pages upload path, and end-to-end website
verification while adding objective documentation and schema-baseline tests.

## Technical Context

**Language/Version**: Markdown; POSIX shell; TypeScript 5.7 on Node.js 22

**Primary Dependencies**: pnpm 9.15, Wrangler 4.127, Vitest 4.1, existing Vizoalica deployment
CLI provider abstractions, Cloudflare Workers/Pages/D1/R2

**Storage**: Cloudflare D1 for configuration and aggregate data; Cloudflare R2 for raw event
batches; private local JSON for operator deployment profiles and console coordinates

**Testing**: Vitest unit/integration/contract suites, shell syntax checks, SQLite baseline
application checks, repository text-consistency checks, Prettier, ESLint, and TypeScript builds

**Target Platform**: New customer-owned Cloudflare installations; macOS/Linux operator machines;
Cloudflare Pages as the supported website example

**Project Type**: TypeScript monorepo with deployment CLI, shell entry points, Workers, local web
console, browser SDK, SQL baseline, and Markdown operations documentation

**Performance Goals**: Preflight schema inspection remains a bounded single remote query; setup
guides can be selected from the README in under 60 seconds; workstation setup completes in under
20 minutes and repeat website setup in under 30 minutes after prerequisites

**Constraints**: Fresh deployments only; no data preservation or destructive cleanup; no secret
values in commands, plans, logs, handoffs, browser code, or documentation; Pages Functions deploy
through Wrangler/Git rather than dashboard drag-and-drop; OneCLI never becomes an implicit
fallback; host websites remain usable when analytics fails

**Scale/Scope**: Four primary journey documents/sections, root README, related operations and
release references, one consolidated D1 baseline, two deployment preflight paths, and focused
deployment/schema/documentation tests

## Constitution Check

*GATE: Passed before research and re-checked after design.*

- **Privacy-minimal analytics**: PASS. The baseline retains the existing bounded aggregates,
  privacy metadata, retention structures, and separation from raw R2 event data. No new collected
  fields are introduced.
- **Security, privacy, and abuse resistance**: PASS. Credential lanes remain separate, preflight
  fails closed on existing schema, secrets stay out of arguments/output, and website verification
  retains quota, origin, consent, and failure-isolation checks.
- **Open source and portable interoperability**: PASS. Human-readable Markdown, SQL, shell, and
  TypeScript remain reviewable; the fresh-only support boundary is explicit rather than implying
  an unverified migration path.
- **Minimal infrastructure and AI-assisted deployment**: PASS. The plan reuses existing resources
  and commands, adds a bounded safety check and redacted handoff guidance, and preserves explicit
  plan approval for profile-based mutations.
- **Human-readable and AI-ready engineering**: PASS. User-story ownership, prerequisites, outputs,
  exact file paths, and validation contracts are explicit and consistent.
- **Accessible product experience**: PASS. There is no product UI change. Documentation uses
  semantic headings, plain-language checks, and tables with textual labels rather than color-only
  meaning.
- **Verification and release gates**: PASS. Baseline, deployment preflight, documentation
  consistency, formatting, type, test, build, and coverage checks are included. Human cloud
  mutation and release decisions remain outside automated validation.

**Post-design re-check**: PASS. The data model and contracts preserve all gates. There are no
unjustified constitution violations.

## Project Structure

### Documentation (this feature)

```text
specs/009-separate-deployment-journeys/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── setup-journeys.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
README.md
docs/operations/
├── cloudflare.md
├── local-analytics.md
├── ops-cli.md
├── pages.md
├── browser-sdk.md
├── cost-model.md
├── releases.md
├── public-release.md
└── troubleshooting.md
docs/releases/
└── v0.5.0.md
deploy/cloudflare/
└── migrations/
    └── 0001_initial.sql
scripts/
├── deploy-check.sh
└── deploy-apply.sh
apps/deploy-cli/
├── src/
│   ├── commands/preflight.ts
│   ├── commands/apply.ts
│   ├── providers/provider.ts
│   └── types.ts
└── tests/
    ├── contract/
    └── integration/
tests/
└── deployment-docs.test.ts
```

**Structure Decision**: Keep the monorepo structure and existing deployment entry points. The
primary journey owners remain in `docs/operations`, while shared safety behavior is implemented
once in the deployment CLI/shell boundary and verified by focused tests. The migration directory
contains only the current fresh baseline so Wrangler records one initialization migration for new
databases.

## Implementation Design

### Fresh Database Guard

Before a preflight can succeed, query the selected remote D1 database for known Vizoalica tables
and the migration tracking table. Treat any returned table as evidence that the database is not a
supported fresh target. The check is read-only, bounded to known table names, uses the configured
database name and Wrangler configuration, and runs in both the direct shell and profile-based
provider paths. Apply rechecks freshness before the first mutation so a stale receipt cannot turn
an intervening database initialization into an accidental upgrade.

### Baseline Consolidation

Merge the final schema produced by migrations 0001-0005 into a single `0001_initial.sql`. Remove
upgrade-only transformations and watermark backfill. New sources receive their watermark through
the existing application path. Validate the baseline by applying it to an empty SQLite database
and comparing required tables, columns, indexes, and constraints with current application queries.

### Journey Information Architecture

- `cloudflare.md` owns US1 and ends with a redacted handoff plus explicit next-story choices.
- `local-analytics.md` owns US2A only, including direct secret storage, console startup,
  verification, lifecycle, and scoped troubleshooting.
- `ops-cli.md` owns US2B only, including OneCLI setup, placeholder configuration, gateway checks,
  console startup, verification, and revocation. It may mention deployment commands only as a
  clearly separate reference, not as part of workstation setup.
- `pages.md` owns US3 and contains registration, SDK/token issuer setup, both supported deployment
  modes, consent, verification, failure isolation, rotation, and repeat-per-website guidance.
- The README provides the authoritative order/frequency matrix and directs readers to exactly one
  story at each decision point.

## Complexity Tracking

No constitution violations require justification.
