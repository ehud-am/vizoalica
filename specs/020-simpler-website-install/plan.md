# Implementation Plan: Simpler Website Management and Install

**Branch**: `020-simpler-website-install` | **Date**: 2026-09-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/020-simpler-website-install/spec.md`

## Summary

Two threads, one release. (A) **Install and website CRUD**: give the browser embed and the GitHub → Cloudflare path good defaults so a website needs the fewest possible values, make website creation address-first with the project read-only, and make the install check name one next action. (B) **Console shell**: one top-bar scope group (environment, then project), a redesigned environment control, a one-line footer, projects as a switch-only dropdown with one home page, Backend folded into Health, and Access keys demoted from primary navigation.

Technical approach: keep the existing packages and API shape; add defaults at the point where values are *consumed* (SDK embed, deploy workflow, snippet generator) so old configuration keeps working; move the project selector out of the per-page bar into the header; remove routes/navigation rather than adding new ones.

## Technical Context

**Language/Version**: TypeScript (ESM, Node ≥ 20), React 18 for the console

**Primary Dependencies**: existing only — Vite, Vitest, Testing Library, Playwright, axe checks already in use. No new runtime dependency.

**Storage**: none new. The recommended install path moves from browser storage to the website record only if research item R7 shows the API can carry it without a schema change; otherwise it stays per-browser and FR-018 is met by a deterministic default (see research.md).

**Testing**: Vitest unit and component tests (`apps/admin-web/tests`, `packages/browser-sdk`, `apps/local-ops-api`), Playwright e2e and responsive/accessibility specs in `apps/admin-web/e2e`, repository coverage gate > 90%.

**Target Platform**: Local console (browser) served by the local operations API; browser SDK on customer sites; GitHub Actions reusable workflow for Cloudflare Pages.

**Project Type**: pnpm monorepo, web application plus SDK plus CLI.

**Performance Goals**: No added round trips on first paint; the shell scope group renders from data the console already loads (environments and projects lists).

**Constraints**: Backward compatible embeds and workflow variables (FR-006); security rules unchanged (FR-019); WCAG 2.2 AA for the switcher, footer and forms; SDK must never block or break the host page.

**Scale/Scope**: About 12 admin-web components, 3 routes changed, 1 route removed, 1 SDK file, 1 API route, 1 workflow file, docs.

## Constitution Check

| Principle | Assessment |
|-----------|------------|
| I Privacy-minimal analytics | Pass. No data field is added; defaults do not widen collection. |
| II Security and abuse resistance | Pass with care. Secrets stay out of embed and browser config; non-local `http` still refused; the new SDK default for the token path must not silently turn signed sessions into unsigned ones (R2). Negative tests required for: default token path absent endpoint, origin not allowed, unsigned demo opt-out. |
| III Open source and portability | Pass. Both install paths remain; no provider lock-in added. |
| IV Minimal infrastructure | Pass. Fewer values, no new service. |
| V Human-readable engineering | Pass. Removal of routes and duplicated identifiers reduces surface; comments only where intent is non-obvious. |
| Accessible product experience | Gate. The switcher is a new custom control: it needs a keyboard/screen-reader pattern (R1) and axe + manual checks. |
| Product constraints (embed never breaks host) | Pass. The default path only changes what the SDK requests, and failure keeps today's silent behaviour. |
| Release gates | Coverage stays > 90%; docs and README aligned; QA report before release. |

No violations to justify. Re-check after Phase 1: unchanged (see bottom).

## Project Structure

### Documentation (this feature)

```text
specs/020-simpler-website-install/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── embed-defaults.md
│   ├── snippet-api.md
│   └── console-shell.md
└── tasks.md            # created by /speckit-tasks
```

### Source Code (repository root)

```text
packages/browser-sdk/src/
├── embed.ts                  # defaults: token path, consent (existing), optional project
└── dynamic-config.ts         # accept config without data-project / data-token-url / data-consent

apps/local-ops-api/src/
├── routes/snippet.ts         # short embed, reduced GitHub variables, check result codes
├── routes/reachability.ts    # one named next action
└── contracts.ts              # response types (additive)

.github/workflows/deploy-vizoalica-pages.yml   # optional variables with defaults; site dir default

apps/admin-web/src/
├── shell/
│   ├── ScopeSwitcher.tsx     # NEW: environment + project group in the header
│   ├── EnvironmentMenu.tsx   # NEW (replaces setup/EnvironmentPicker.tsx)
│   ├── ProjectMenu.tsx       # NEW
│   ├── ScopeBar.tsx          # keeps website + range only
│   └── AreaNav.tsx           # drop Projects, Backend, Access items
├── components/
│   ├── AppFooter.tsx         # one line
│   ├── WebsiteForm.tsx       # address-first, read-only project, defaults
│   └── origins.ts            # NEW: normalise a pasted address to an exact origin
├── manage/
│   ├── ProjectsPage.tsx      # sole home of project create/rename/open/delete
│   ├── HealthPage.tsx        # Backend section + Websites section
│   ├── BackendPage.tsx       # removed (content moves into Health)
│   ├── AccessPage.tsx        # renamed "Access keys", reached from Share and env menu
│   ├── WebsiteAddPage.tsx / WebsiteEditPage.tsx / WebsitePage.tsx
│   ├── InstallPage.tsx + install/*   # short embed first, fewer values, check
└── router.ts                 # routes/nav flags; manage/backend → health alias

apps/admin-web/tests, apps/admin-web/e2e   # updated and new specs
docs/, README.md, CHANGELOG.md, llms.txt   # aligned
```

**Implementation notes** (2026-09-25): the GitHub path's values are bundled into one `VIZOALICA_SITE` variable (see research.md, outcomes); the install check adds one request family to the reachability route (`?path=`); Projects has no rename because the service has none. The starter workflow points at `v0.7.3`, which must be tagged when this ships.

**Structure Decision**: Existing monorepo layout; changes concentrated in `apps/admin-web`, `packages/browser-sdk`, `apps/local-ops-api` and one workflow file. No new package.

## Phasing (delivery order)

1. **Shell** (Stories 6, 7, 8): independent of the install work, lowest risk, most visible. Order: footer → switcher → route/nav changes → Projects page → Health/Backend merge → Access keys placement.
2. **Website CRUD** (Story 2, 5): origin normalisation, read-only project, defaults, one-page management.
3. **Install defaults** (Story 1, 3): SDK defaults and snippet generator first (contract-tested), then workflow, then guidance UI.
4. **Install check and docs** (Story 4): named next actions, docs alignment, release gates.

## Post-Design Constitution Re-check

Unchanged from the table above. The two items that need evidence in review are the token-path default (R2) and the switcher's accessibility (R1); both have tasks with negative/axe tests.
