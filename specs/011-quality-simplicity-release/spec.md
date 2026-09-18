# Feature Specification: Quality and Simplicity Patch Release (v0.5.2)

**Feature Branch**: `main`

**Created**: 2026-09-13

**Status**: Implemented, pending owner review and release tagging

**Input**: User description: "Ship v0.5.2 as a quality-and-simplicity patch release, proven
through five sequential expert review passes (QA/deployment engineer, security architect,
platform engineer, Cloudflare deployment expert, system architect). The deployment engineer pass
must fix website deployment specifically: the dynamic integration path is currently a manual
shell-command generator with no real automation, while the static path works. Build a reusable
GitHub Actions CI/CD workflow that a vizoalica customer website repo (not this repo) can adopt so
that pushes to their site or docs folder automatically deploy to their own Cloudflare Pages
project, including the vizoalica config and ingest-token Pages Functions, with all data-source,
data-project, and URL values supplied via GitHub Actions repository variables and secrets and
wired into the Cloudflare environment at deploy time rather than hardcoded in the customer
website source code. Redesign the admin console UI for this area, which is currently a raw
command wall with no deploy status feedback. Success is a full deployment (backend plus operator
plus a customer website) completable within five minutes by an agent following the written steps.
Subsequent iterations cover: closing security gaps (ingest rate limiting, OneCLI trust boundary,
config-overwrite guard portability) with nothing critical or high left open; reviewing
ingest-worker and ingest-api and D1/R2 usage for performance, scale, and cost economics; adding
Cloudflare-specific hardening controls (rate limiting rules, bot and DoS protections,
least-privilege API token scoping for the new deploy workflow); and a final system-architect pass
reconciling README, docs, specs, and code before tagging the v0.5.2 release."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automated Website Deployment for Customers (Priority: P1)

As a vizoalica customer who owns a separate website repository, I connect that repository to my
Cloudflare account once, and from then on every push to my site's source folder automatically
publishes the site along with the vizoalica configuration and token-issuing endpoint it needs —
with none of my analytics configuration values (data source, project, endpoint URLs) stored in my
repository's source code.

**Why this priority**: This is the deployment journey the user identified as actively broken —
the only automation that exists today is a wall of shell commands an operator must run by hand,
with placeholder values they must manually edit into a config file. It blocks the stated 5-minute
deployment goal and is the most visible quality problem in the product today.

**Independent Test**: Starting from a fresh customer website repository with no vizoalica
integration, an operator can add the required repository variables/secrets and a short workflow
file, push a change, and see the site live on Cloudflare Pages with working analytics collection
— without ever writing a real data-source/project/URL value into a file that gets committed.

**Acceptance Scenarios**:

1. **Given** a customer website repository with the deployment workflow and required GitHub
   repository variables/secrets configured, **When** the operator pushes a change to the
   configured site path, **Then** the site, its vizoalica configuration endpoint, and its
   token-issuing endpoint are deployed to the customer's Cloudflare Pages project automatically.
2. **Given** the deployed site, **When** its pages load, **Then** the vizoalica configuration and
   ingest-token endpoints respond using values sourced from the Cloudflare Pages
   environment — not from any value present in the repository's source files.
3. **Given** a required repository variable or secret is missing, **When** the workflow runs,
   **Then** it fails with a clear, actionable message identifying exactly which variable/secret
   is missing, rather than deploying a broken or partially-configured site.

---

### User Story 2 - Clear Console Guidance for Connecting a Website (Priority: P2)

As an operator setting up a new website in the vizoalica admin console, I see a clear, actionable
path to connect my website's CI/CD to Cloudflare — the exact repository variables and secrets to
add and where they come from — with visible feedback on whether the connection is working,
instead of a wall of raw commands I must run myself with no confirmation of success or failure.

**Why this priority**: The current console UI for this area was called out directly as "really
bad" — it is the operator-facing surface of the same underlying deployment gap as User Story 1,
but addressing the console experience is a distinct, independently testable piece of work from
the deployment automation itself.

**Independent Test**: An operator who has never deployed a vizoalica website before can, using
only the console UI, identify the exact set of values to configure and understand whether their
most recent website deployment succeeded or failed, without reading source code or shell scripts.

**Acceptance Scenarios**:

1. **Given** a newly created website in the console, **When** the operator opens its integration
   panel, **Then** they see the exact list of values their CI/CD needs to supply, without any raw
   deployment shell commands presented as the primary path.
2. **Given** a website whose CI/CD deployment has run, **When** the operator views the website in
   the console, **Then** they can tell whether the most recent deployment succeeded or failed
   without leaving the console.

---

### User Story 3 - One-Command Backend and Operator Setup (Priority: P3)

As an operator setting up vizoalica for a new customer, I can take the backend (Cloudflare
Worker, D1, R2) and my local operator console from nothing to fully working using one short,
linear sequence of documented steps, instead of piecing together information spread across
several long documents.

**Why this priority**: This is required to hit the overall 5-minute full-deployment target, but
it is independent of (and lower-risk than) the website CI/CD work in Stories 1-2, since the
backend/operator setup already mostly works today — it just isn't simple.

**Independent Test**: An operator with a fresh Cloudflare account and no prior context can follow
a single guide/script to reach a working backend and authenticated local console, timed
end-to-end.

**Acceptance Scenarios**:

1. **Given** a fresh Cloudflare account and this repository checked out, **When** an operator
   follows the documented setup path, **Then** they reach a deployed backend and a working
   authenticated local console session in one continuous sequence of steps.

---

### User Story 4 - No Open Critical Security or Cost Risks at Release (Priority: P4)

As the person accountable for this product, I want the security-sensitive areas already
identified (ingest rate limiting, the OneCLI trust boundary, the config-overwrite guard's
filesystem assumptions) either resolved or explicitly documented as accepted risk, and the
ingestion/storage cost profile understood, before this release ships.

**Why this priority**: These are review-and-harden passes over an already-working system, not
new user-facing capability — they matter for the release to be trustworthy, but nothing else in
the release depends on them being done first.

**Independent Test**: Each identified security finding has a recorded resolution or explicit
accepted-risk rationale; the cost/performance review produces a written checklist with no
unresolved open item at time of release.

**Acceptance Scenarios**:

1. **Given** the security findings identified during review, **When** the release is tagged,
   **Then** no finding rated critical or high remains open without an explicit accepted-risk
   rationale on record.
2. **Given** a project an operator no longer wants (e.g. one created by mistake or for a
   since-abandoned test), **When** the operator deletes it from the console, **Then** the project
   and its data are removed following the same soft-delete/audit conventions as website deletion,
   and the operator is warned about what the deletion affects before it is irreversible in
   practice.

---

### User Story 5 - Consistent Documentation and Code at Release (Priority: P5)

As a new operator or contributor reading the README, docs, and specs after this release ships, I
find them consistent with what the code actually does, with no stale instructions left over from
the pre-release state.

**Why this priority**: This is a final reconciliation pass that depends on all other work being
finished first — it has no independent value until the preceding stories are complete.

**Independent Test**: A read-through of README, `docs/operations/*`, and the specs directory
turns up no instruction that contradicts current code behavior.

**Acceptance Scenarios**:

1. **Given** all other stories are complete, **When** the documentation is reviewed end-to-end,
   **Then** every deployment/operational instruction matches actual current behavior.

### Edge Cases

- What happens when a customer's CI/CD workflow runs with a required Cloudflare or vizoalica
  repository variable/secret missing or malformed? (Must fail loudly before deploying, not
  deploy a broken or insecure configuration.)
- What happens when a customer pushes to their site path but the Cloudflare Pages deploy step
  itself fails (e.g., invalid API token, wrong account)? (Operator must be able to see this from
  GitHub Actions' own run output; the console should not claim success it cannot verify.)
- How does the system handle a customer who is still using the static (hardcoded snippet)
  integration path and does not want to migrate? (Static path must continue to work unchanged.)
- What happens if the ingest endpoint receives a burst of requests beyond current quota checks
  before a rate-limiting control exists? (Must be explicitly assessed, not silently assumed safe.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The product MUST provide a reusable, versioned CI/CD deployment workflow that a
  customer website repository (separate from this repository) can adopt to automatically deploy
  their site to their own Cloudflare Pages project on push to a configured path.
- **FR-002**: The CI/CD workflow MUST deploy the vizoalica configuration endpoint and
  token-issuing endpoint alongside the customer's site, sourced from a versioned location in this
  project rather than requiring the customer to hand-copy source files.
- **FR-003**: All per-deployment values (data source key, project identifier, ingest endpoint
  URL, token endpoint URL, site origin, SDK source URL, consent default) MUST be supplied via
  GitHub Actions repository variables and secrets and wired into the Cloudflare Pages
  environment at deploy time. The customer website's committed source code MUST NOT contain any
  of these real values.
- **FR-004**: If a required variable or secret is missing or invalid when the workflow runs, the
  workflow MUST fail clearly before attempting to deploy, identifying which value is missing.
- **FR-005**: The existing static (hardcoded snippet) integration path MUST continue to work
  unchanged for customers who do not adopt the CI/CD path.
- **FR-006**: The admin console's website integration UI MUST present the required
  variables/secrets and setup steps for the CI/CD path as the primary guidance, replacing the
  current raw-shell-command list as the primary path.
- **FR-007**: The admin console MUST show whether a website's most recent CI/CD deployment
  succeeded or failed.
- **FR-008**: The backend and operator-console setup steps MUST be consolidated into a single,
  linear, scriptable sequence sufficient to reach a working backend and authenticated console
  session within 5 minutes when followed by an agent.
- **FR-009**: Every security finding identified during the security-architect review (ingest rate
  limiting, OneCLI trust boundary, config-overwrite guard portability, the shared global
  `VIZOALICA_TOKEN_SECRET` cross-project forgery risk found in Phase 1, and any new finding in the
  CI/CD workflow itself such as secret handling and API token scope) MUST be resolved or recorded
  with an explicit accepted-risk rationale before release.
- **FR-009a**: The product MUST provide a way for an operator to delete a project (not only a
  website) from the console, following the same soft-delete and audit-logging conventions already
  used for website deletion, with a clear warning of what the deletion affects before it proceeds.
- **FR-010**: The platform-engineer review MUST produce a written assessment of ingestion/storage
  performance, scale, and cost economics, updating `docs/operations/cost-model.md` if assumptions
  have changed.
- **FR-011**: The Cloudflare-deployment-expert review MUST evaluate and, where adopted, implement
  edge-level protections (rate limiting, bot/DoS mitigation) for the ingest endpoint, and ensure
  the new CI/CD workflow's Cloudflare API credentials are scoped to the minimum access required.
- **FR-012**: Before the release is tagged, README, `docs/operations/*`, and `specs/*` MUST be
  reconciled with actual code behavior, and the full validation suite (typecheck, tests, lint,
  build) MUST pass.

### Key Entities

- **Customer Website Repository**: A GitHub repository, owned by a vizoalica customer and
  separate from this project, containing their site source and a CI/CD workflow that references
  this project's reusable deployment workflow.
- **Deployment Configuration Values**: The set of per-website values (data source key, project
  identifier, ingest/token endpoint URLs, site origin, SDK source, consent default) that must
  reach the Cloudflare Pages environment without being committed to source.
- **Website Deployment Status**: The outcome (success/failure, timestamp) of a customer website's
  most recent CI/CD deployment, as surfaced in the admin console.
- **Security Finding**: An identified risk with a severity, and either a resolution or a recorded
  accepted-risk rationale.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator (or an agent following written steps) can take a fresh Cloudflare
  account, this project's backend, and one customer website repository from zero to a fully
  working deployment (backend live, operator console authenticated, website emitting events via
  the CI/CD path) in 5 minutes or less.
- **SC-002**: Zero real per-deployment configuration values (data source, project id, endpoint
  URLs) appear in the committed source of a customer website repository using the CI/CD path.
- **SC-003**: 100% of identified security findings rated critical or high are resolved or carry
  an explicit accepted-risk rationale at release time.
- **SC-004**: The admin console shows deployment success/failure status for a website without the
  operator needing to inspect GitHub Actions or Cloudflare directly.
- **SC-005**: The full validation suite (typecheck, unit/integration tests, lint, production
  build) passes with zero failures immediately before the release is tagged.

## Assumptions

- The reusable CI/CD workflow targets GitHub Actions specifically, per explicit direction — other
  CI providers are out of scope for this release.
- "Customer website repository" means a repository the customer controls, distinct from this
  project's own repository; this project ships the reusable workflow and the Pages Functions it
  deploys, but does not host or manage the customer's repository.
- The existing static integration path is out of scope for removal or deprecation in this
  release — it must keep working as-is.
- Live verification of the new CI/CD workflow against a real customer repository requires
  Cloudflare and GitHub credentials already available in the operator's environment; this release
  does not introduce a new credential-provisioning mechanism beyond what GitHub Actions
  secrets/variables already provide.
- "5 minutes" is measured as wall-clock time for the documented steps themselves, not including
  one-time account creation (Cloudflare/GitHub sign-up) that happens outside this project's
  control.
