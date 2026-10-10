# Implementation Plan: Project-First Console and Website Setup

**Branch**: `codex/project-first-console` | **Date**: 2026-09-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/010-project-first-console/spec.md`

## Summary

Promote Projects to a primary console destination and make explicit project selection the first
step of website creation. Preserve the current resolved static snippet as the compatibility option
and add a dynamic option consisting of one same-origin loader, a versioned public JSON
configuration contract, a Cloudflare Pages Function bridge, and operator-reviewed configuration
and deployment instructions. Complete the shell with an accurate local-workspace disclosure and a
non-overlapping sticky footer containing product, repository, year, and version information.

## Technical Context

**Language/Version**: TypeScript 5.7 on Node.js 22; HTML, CSS, JSON, Markdown, and POSIX shell
commands in operator guidance

**Primary Dependencies**: React 19, Vite 6, existing browser SDK and local operations API, pnpm
9.15, Wrangler 4.127, Cloudflare Pages Functions, Vitest 4.1, Testing Library, Playwright, and axe

**Storage**: Existing Cloudflare D1 project/source records remain authoritative; no new central
storage. The Cloudflare dynamic example reads non-secret Pages Function environment variables;
other hosts expose the same versioned public JSON document from a function, application route, or
generated static asset.

**Testing**: Vitest unit, component, API, repository, contract, privacy, and failure-isolation
tests; Playwright responsive and keyboard flows with axe; documentation contract tests; TypeScript,
ESLint, Prettier, builds, coverage, and production dependency audit

**Target Platform**: Local-only Vizoalica admin console in supported desktop browsers; websites
using the existing static browser SDK embed; Cloudflare Pages as the first-class dynamic hosting
example; provider-neutral HTTP/JSON behavior for other hosts

**Project Type**: TypeScript monorepo containing a React console, loopback operations API,
Cloudflare Worker backend, browser SDK, provider example, verification scripts, and operations
documentation

**Performance Goals**: Project and installation option changes remain perceptually immediate; the
dynamic loader makes one bounded same-origin configuration request before SDK load; a missing or
slow configuration never delays the host page; console task-completion targets remain those in the
feature success criteria

**Constraints**: Static snippet output stays backward compatible; website creation always confirms
an existing project; browser-required values are public even when sourced from hosting bindings;
token-signing, administrator, and deployment credentials never reach browser artifacts or generated
output; dynamic failure sends no event and creates no fallback client; consent is granted by the
host site before either installation mode loads; footer never overlays content; WCAG 2.2 AA and
repository-wide 90% line/branch coverage remain mandatory

**Scale/Scope**: Four user stories, three console destinations, one expanded local snippet
contract, one generic loader, one versioned configuration document, one Cloudflare Pages adapter,
one provider-neutral mapping guide, and focused console/API/SDK/example/documentation tests. Project
rename and deletion are out of scope.

## Constitution Check

*GATE: Passed before Phase 0 research and re-checked after Phase 1 design.*

- **Privacy-minimal analytics**: PASS. No event, visitor, retention, or aggregate fields change.
  The dynamic document contains only the six values already visible in today's static markup.
- **Security, privacy, and abuse resistance**: PASS. Project selection is explicit at mutation
  time; project/source scope remains server validated; dynamic configuration is all-or-nothing;
  no fallback destination is allowed; private credentials are excluded from both modes, config
  responses, generated commands, logs, and examples.
- **Open source and portable interoperability**: PASS. The versioned HTTP/JSON configuration
  contract and same-origin loader work independently of Cloudflare. Cloudflare receives the first
  concrete adapter and commands without changing the browser contract.
- **Minimal infrastructure and AI-assisted deployment**: PASS. The design reuses the existing
  Pages Function environment, token issuer, deploy commands, and verification script. Generated
  guidance names targets, presents review before mutation, and verifies the result.
- **Human-readable and AI-ready engineering**: PASS. Static and dynamic paths are discriminated,
  contracts are explicit, source ownership is narrow, and task paths and validation evidence are
  documented before implementation.
- **Accessible product experience**: PASS. Projects navigation, project-first forms, installation
  choices, disclosure, links, notices, and responsive footer all require semantic, keyboard, zoom,
  contrast, focus, and assistive-technology validation.
- **Verification and release gates**: PASS. The design requires unit, integration, contract,
  security-negative, failure-isolation, end-to-end, accessibility, documentation, coverage, build,
  formatting, lint, and dependency checks. Human approval remains required for real deployment and
  release decisions.

**Post-design re-check**: PASS. The data model and contracts preserve every gate. There are no
unresolved clarifications or unjustified constitution violations.

## Project Structure

### Documentation (this feature)

```text
specs/010-project-first-console/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── console-and-installation.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/admin-web/
├── src/
│   ├── App.tsx
│   ├── api/local-operations.ts
│   ├── components/
│   │   ├── AppFooter.tsx
│   │   ├── IntegrationSnippet.tsx
│   │   ├── WebsiteForm.tsx
│   │   └── WorkspaceContextHelp.tsx
│   ├── pages/
│   │   ├── AnalyticsPage.tsx
│   │   ├── ProjectsPage.tsx
│   │   └── WebsitesPage.tsx
│   └── styles.css
├── tests/
└── e2e/

apps/local-ops-api/
├── src/
│   ├── routes/snippet.ts
│   └── server.ts
└── tests/

packages/browser-sdk/
├── src/
│   ├── dynamic-config.ts
│   └── embed.ts
└── tests/

examples/cloudflare-pages/
├── functions/vizoalica/
│   ├── config.json.ts
│   └── ingest-token.ts
├── public/
│   ├── _routes.json
│   ├── index.html
│   └── vizoalica-loader.js
├── README.md
└── wrangler.example.toml

docs/operations/
├── browser-sdk.md
├── local-analytics.md
├── pages.md
└── troubleshooting.md

scripts/
└── verify-website.ts
```

**Structure Decision**: Retain the monorepo and current authority boundaries. `App.tsx` owns one
current browsing context; `ProjectsPage` exposes view/create/select actions; the create-only website
form carries its own explicit project ID. The local API generates both safe installation modes.
The browser SDK owns provider-neutral dynamic loading and validation. The Cloudflare example owns
the Pages Function adapter and deployment recipe; core ingestion and D1 schemas do not change.

## Implementation Design

### Project-first console state

Extend the console view state to `projects | overview | websites`. Projects becomes a primary
navigation destination containing the existing project list/create behavior and direct actions to
open analytics or websites for a selected project. Keep one current project ID in `App.tsx` for
browsing convenience, reconcile it after every project refresh, and clear project-bound child data
before loading another project. Do not add project rename/delete interfaces.

The add-website form is distinct from edit mode. Its first focusable form control is a required
project dropdown initialized to no choice, even when a browsing project is active. Submission
passes that chosen ID directly to `createWebsite`; the nested server route remains authoritative
for project existence and scope. With no projects, replace the form with a Projects call to action.

### Dual installation contract

Keep the current static `html` value byte-for-byte compatible. Expand the local response into two
ordered modes: `static` contains that resolved HTML, while `dynamic` contains the constant
`<script async src="/vizoalica-loader.js"></script>`, the configuration URL, a complete public
configuration preview, and Cloudflare guidance. No private value is accepted by the generator.

The loader fetches `GET /vizoalica/config.json` from the website origin with caching disabled,
requires `version: 1` and all six fields, validates HTTPS production endpoints, a same-origin token
URL, project/source syntax, and the consent enum, then creates the existing SDK script with the six
attributes. It catches all failures, applies no partial defaults, creates no client on failure, and
uses a global/singleton guard to prevent initialization if either path already loaded the SDK.

Consent remains a host-site gate, not a configuration-service decision. Examples load either mode
only after analytics consent. The `data-consent` value records that state and never substitutes for
the site's consent manager.

### Cloudflare and portable hosting

Add a Pages Function at `/vizoalica/config.json` that maps non-secret environment variables to the
provider-neutral JSON response. Extend `_routes.json` so the function executes. Use explicit
`Cache-Control: no-store`, JSON content type, and `X-Content-Type-Options: nosniff`. Invalid or
placeholder configuration returns a non-success response without partial values.

Generated Cloudflare guidance includes the exact public `[vars]` block for the operator's existing
Wrangler configuration, target/environment/branch placeholders, `wrangler whoami` and project-list
checks, a diff/review checkpoint, local Pages testing, the correct Direct Upload or Git-connected
deployment path, deployment listing, configuration response inspection, and the existing website
verification command. Only `VIZOALICA_TOKEN_SECRET` uses the hidden secret prompt. Other providers
implement the same GET/JSON contract through a function, application route, or generated asset.

### Console shell

Use a sticky-footer layout: the main content column fills the remaining dynamic viewport, page
content grows normally, and the footer uses auto margin within the flow. This satisfies the fixed
bottom location on short pages without an overlay on long or zoomed pages. A centered inner
container holds `vizoalica.dev`, the official repository, current year, and injected version; an
unavailable build version is labeled explicitly. Render support/version information in all access
states.

Replace the decorative local-workspace pill with an accessible disclosure that retains the status
label and explains that the UI and credential-holding loopback service are local while the selected
backend and stored analytics may be remote.

## Complexity Tracking

No constitution violations require justification.

