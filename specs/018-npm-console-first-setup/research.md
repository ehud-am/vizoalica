# Research: Install from npm and a Console-First Setup

Phase 0 output for [plan.md](./plan.md). Each decision states what was chosen, why, and what was
rejected. No technical unknown is carried forward.

## R1. Package shape: a separate, bundled, dependency-free package

**Finding.** The repository root is a pnpm workspace (`private: true`, dev dependencies, scripts). The
`vizoalica` bin runs TypeScript at run time through `tsx` from a checkout
(`bin/vizoalica.mjs`), the console needs a Vite dev server, and deploys shell out to `pnpm exec wrangler`.

**Decision.** Add a workspace package `apps/cli`, published as `vizoalica`, whose build (esbuild, already
used for the SDK) produces one self-contained ESM bundle for the CLI and local service, plus data
directories: the built console, the prebundled Worker, the database schema, the SDK files. It has **no
runtime dependencies**. The root package is renamed `vizoalica-workspace` (it stays private) so two packages
do not share a name; its `vizoalica` script keeps running the source CLI for contributors.

**Why.** A bundle starts fast, has nothing to resolve at install time, and is small and auditable.
Publishing from a directory the build assembles means the tarball contains exactly what is listed and
nothing else (an allowlist, tested).

**Rejected.** Publishing the root (drags in dev tooling, no clean file list); shipping TypeScript source
plus `tsx` (slow start, a runtime dependency, larger); single-file executables per platform (Node is
already required, and a platform matrix is more to maintain).

## R2. One process, one origin

**Finding.** The console is the Vite dev server (port 5173) proxying `/api` to the local service (port
4318). The service answers only `/api/*` and checks the request `Origin` against one configured origin.

**Decision.** The local service also serves the built console from `/` (with a single-page fallback), so
`vizoalica console` is one process on one address, `http://127.0.0.1:4318`. It accepts two exact origins for
`/api`: its own, and the Vite origin, so contributors keep their two-process workflow. Static responses carry
a strict Content-Security-Policy and never list directories or follow paths outside the console directory.

**Why.** One process is what "one command" needs, and same-origin removes a class of cross-origin
questions. The origin check stays an allowlist of exact loopback origins.

**Rejected.** Keeping two processes (needs the build tool at run time); serving with a separate static
server (a second dependency and port).

## R3. The service starts without a backend

**Finding.** `loadConfig` throws `access_revoked` when there is no remote URL or administrator secret, so
today there is no console at all before a backend exists.

**Decision.** Replace the fixed `Config` with a **connection store** that can be empty. The service starts
with whatever the store holds (nothing on first run), exposes `GET /api/setup/state`, and changes its
Worker client when a connection is verified and saved. The file is the existing
`~/.config/vizoalica/local-operations.json` (mode 0600, atomic replace), which now holds either
`VIZOALICA_ADMIN_SECRET` (admin) or `VIZOALICA_READ_KEY` (analyst, owner), never both. OneCLI mode is
unchanged: the placeholder in the file, the wrapper process, no secret on disk.

**Why.** It keeps the file format and permissions checks the maintainer's installation already uses (FR-014).

## R4. The backend decides the role, not the person

**Decision.** After any credential is saved, the service calls `GET /v1/admin/whoami` and the response
(`admin`, `analyst`, or `owner`, with scope and Worker version) is the role. The first-run question only chooses
which credential to ask for; it grants nothing. The console builds its navigation and controls from the
reported role, so an analyst key entered under "admin" simply produces the analyst experience, and an
administrator secret entered under "analyst" is recognized and treated as the admin it is (with a notice).

**Why.** A role chosen by the user would be cosmetic. Deriving it from the credential makes the console
match what the backend will actually allow (FR-015).

## R5. Access keys with a role and a scope, stored in D1 (revised 2026-09-22)

**Finding.** The Worker compares one bearer token to `VIZOALICA_ADMIN_SECRET` in constant time for every
`/v1/admin/*` route and for the MCP adapter. There is nothing to scope, list, or revoke, and no way to let
someone manage websites without also letting them change everything.

**Decision.** A table `access_keys` (id, label, **role** `analyst` or `owner`, secret hash, optional project and
website scope, created and revoked times) and a key format `vzk_<id>_<secret>` with a 256-bit random secret.
Only a SHA-256 hash of the secret is stored; the id is looked up by primary key and the hash compared in
constant time. Bearer resolution: the administrator secret first (unchanged path, role **admin**), otherwise
a key (role from the row). A **route allowlist per role** (contract) gives an analyst reads of analytics and
configuration, and an owner those reads plus writes on projects and websites within scope. Every other route
(backend-level routes, purge, key management, the MCP adapter) refuses a key with 403. Issuing, listing, and
revoking keys are admin-only and audited (no secret values). Deleting a project or website removes the keys
scoped to it.

**Scope decides what a holder can create.** Scope everything: projects and websites. Scope one project:
websites in it, and it can edit, enable, disable, and delete the project and its websites. Scope one website:
that website only (edit, enable, disable, delete), nothing new.

**Why per-key rather than one shared secret per role.** Per-key gives revocation of one person, an audit trail,
and scope. A key is high-entropy, so a fast hash is correct and a lookup by id avoids scanning.

**Rejected.** Shared read and manage secrets (no per-person revoke, no scope); signed tokens (would need a
signing secret shared with the holder); Cloudflare Access in front of the Worker (external, not portable).

## R6. The website owner (revised 2026-09-22)

**Decision.** An owner uses an `owner` key (R5) and the setup details from the admin's "Share setup" action:
the ingestion address and, for a website, its public source key, project id, allowed origins, consent guidance,
and installation steps. The owner can create and manage projects and websites within scope, sees the
installation steps and status, gets the SDK file (which the package now ships and the service serves at
`/api/sdk/vizoalica.js` and `/api/sdk/vizoalica-loader.js`), and runs the "has data arrived" check. The owner
cannot change the backend: the Worker, the database, secrets, purging, sample data, and keys are refused by the
backend. A website the owner creates still needs its token signing secret on its own token service, which the
admin provides through the existing documented step; the owner never sees it.

**Known limit (carried from the spec).** The signing secret is shared across websites, so whoever holds it
could mint tokens for another website. Per-website signing keys are a separate specification.

## R7. Wrangler on demand, pinned

**Finding.** Measured in this repository: `wrangler` 15 MB plus its `workerd` binary 127 MB on disk. Only an
admin deploying needs it; analysts and owners never do.

**Decision.** The package does not depend on Wrangler. When an admin first deploys, the service runs
`npm exec --yes --package=wrangler@<pinned> -- wrangler …` (npm ships with Node). The version is one
constant, checked by a test against the version this repository develops with, so upgrades move together.
`VIZOALICA_WRANGLER` overrides the command (tests, offline machines), and an inherited
`CLOUDFLARE_API_TOKEN` is passed through, so an admin may use a least-privilege API token instead of the
browser sign-in.

**Why.** The install stays small and fast for everyone, and the heavy download happens once, only for the
person who needs it, with visible progress.

**Rejected.** A regular dependency (about 140 MB for every role); requiring a global Wrangler (an
unpinned tool touching the account); vendoring Wrangler (a large, fast-moving tarball to maintain).

## R8. The Worker ships prebundled

**Decision.** The build bundles the Worker with esbuild to `worker/index.mjs`, copies the schema, and
embeds a Wrangler configuration template with `no_bundle`. At deploy time the service renders the
configuration into the admin's own directory (`~/.config/vizoalica/deploy/<worker>/`), never into the
package directory, and Wrangler deploys the prebundled file. A build test runs `wrangler deploy --dry-run`
on it, and the Worker's version is baked in for the compatibility check.

**Why.** The package cannot carry the monorepo's TypeScript sources and aliases, and the tarball must be
the same code that was tested.

## R9. The console deploy engine

**Decision.** A deployment is a **run**: an ordered list of steps with statuses, saved as a small JSON
record (no secrets) under `~/.config/vizoalica/deployments/`. First install steps: prepare tool, check
sign-in, detect existing resources, create database, create bucket, write configuration, create tables,
deploy Worker, store secrets, verify health, connect. Update steps: prepare tool, check sign-in, detect,
write configuration, deploy Worker, verify health. Rules: nothing is created before an explicit approval
of the shown plan; each step is idempotent by detection so a run can be resumed; existing resources not
made by this run block the flow with a choice (new names or connect); cleanup of created resources is
offered, never automatic. Progress is read by polling `GET /api/deploy/runs/:id`. The pure helpers
(parsers, name rules, configuration rendering, secret generation) move from `scripts/cli/backend.ts` and
`secrets.ts` into a new shared package `packages/ops-core`, used by both the CLI and the engine, so
behavior is not duplicated. Generated secrets are held in memory, returned by one single-use reveal call
(expiring), and only the administrator secret is written, to the 0600 connection file.

**Why polling, not streaming.** Steps take seconds to minutes, state is small, and polling survives page
reloads and works through the same origin and security checks as every other route.

**Rejected.** Reimplementing the interactive prompts in the browser one to one; server-sent events (extra
connection handling for little gain); Terraform or another tool (adds a dependency the constitution asks us
to avoid).

## R10. Setup state and the journey

**Decision.** `GET /api/setup/state` returns the four stages (console running, backend connected, website
configured, data arriving), the connection, the principal, and the backend compatibility, derived from the
live backend on every call and never stored. Stage three is done when the principal can see at least one
website; stage four when any visible website reports accepted data. For analysts and owners the same derivation runs
on what their key can see.

## R11. Availability, not hiding

**Decision.** One function `availability(role, stage, capabilityId)` returns `{ available, reason, next }`.
Controls that exist but cannot work now render as `aria-disabled` with the reason as description text and a
link to the next step, and send nothing. On a screen a role can see, a control it cannot use is shown
unavailable with the role's reason ("Your access is read-only." for an analyst, "Only an admin can change the
backend." for an owner); screens a role can never use (the deployment wizard, the access keys screen) are absent. The existing capability matrix (`view`, `operate`, `administer`) gains
the backend actions, and the existing tests that walk every screen for state-changing controls are extended
to run for each role and stage.

## R12. Versions, and the maintainer's running backend

**Decision.** The console compares three versions. Console and Worker are compatible when major and minor match
(equal is compatible; an older Worker gets "update the backend"; a newer one gets "update the console"). The
database schema must be at least the version the Worker expects. A backend that predates version reporting
(`404` from the version routes) is treated as an older-but-working admin backend (the administrator secret
still lists projects), with its versions shown as unknown and the update offered, so the live 0.6.2 backend
keeps working with the new console and can be updated from it.

## R13. Retiring `install`, keeping the rest

**Decision.** `vizoalica install` prints that it was retired and points to `vizoalica console` (exit code 2,
nothing deployed). `backend`, `connect`, `rotate`, `purge-deleted`, `status`, `verify`, `demo`, `setup`,
`doctor`, and `deploy-pages` remain for scripts. The approval-gated lane (`pnpm deploy:plan/apply`, the
constitution's agent-operable, receipt-producing deployment path) is unchanged in a checkout.
**The command is retired only in the release that ships console deployment**, so there is never a period with
no easy way to deploy.

## R14. Publishing

**Decision.** A workflow publishes the built package with provenance when a release is published, and only
when the repository variable `VIZOALICA_NPM_PUBLISH` is `true` (otherwise the job is skipped, as the docs
site's is). The first publish is an owner action: npm account, two-factor authentication, and claiming the
name. CI also builds the tarball on every pull request, lists its contents against an allowlist (no secrets,
no local files), installs it into a clean prefix, starts `vizoalica console`, and checks the first-run state
and the console page. That smoke test is the executable form of SC-001 and FR-008.

## R15. The footer

**Decision.** A structured footer: brand mark and name with one line of tagline; columns **Vizoalica**
(Website, Documentation, Get started, Privacy) and **Project** (GitHub, Discussions, Issues, Release notes,
License; npm once published); then a bottom line with the copyright and version. Local logo asset only, no
request until a link is followed, `rel="noopener noreferrer"` on external links, one column at phone
width. It renders in every state, including first run and connection errors.

## R16. Documentation

**Decision.** README, get-started, and operations guides describe `npm install -g vizoalica` and
`vizoalica console`; `pnpm vizoalica` remains only in contributor sections. About a hundred mentions across
15 files are updated, the tests that assert documentation content are updated with them, and the line that
says Vizoalica is source-only (`llms.txt`) is corrected.

## R17. Security of the new surface

**Decision.** Static serving: resolve paths against the console directory and reject anything that leaves
it, reject non-GET methods, no directory listing, `nosniff`, strict CSP (`default-src 'self'`, no inline
script), loopback `Host` only. Local API: every new route requires the session cookie and the origin
allowlist; deployment and key routes additionally require the admin principal (checked locally as
defense in depth, and by the Worker as the authority); deployment inputs are validated (resource names,
account ids); Wrangler is spawned without a shell with argument arrays; logs never include secrets. Worker:
keys are hashed, compared in constant time, scoped on every route, and each admin route is covered by a
negative test with a key.

## R18. Delivery in two releases

**Decision.** Recommend two releases, because the request is larger than a patch: **0.6.3** (footer, npm
package, console-first start, first run, journey and availability, connect to an existing backend, existing
setups recognized; no backend change) and **0.6.4** (versioned, updatable database and Worker, access keys and
the three roles, console deployment and updates, the backend screen, retiring `install`, the publish workflow
going live). The task list is ordered so the first
slice is complete and shippable on its own.

## R19. Test strategy

- **Worker**: authorization matrix (every admin route against admin, analyst, owner, revoked, and bad keys),
  scope forcing, hashing, table-missing behavior, on the real schema through `worker.fetch`.
- **Local service**: connection store, setup state, connect and disconnect, static serving and traversal,
  deploy engine against a fake Wrangler (steps, resume, existing resources, failure, cleanup, secrets once).
- **Console**: first run for each path, journey at each stage, availability for each role and stage,
  footer; axe in both themes; keyboard-only flows; the existing "no state-changing control" walk per role.
- **Package**: allowlist, clean-prefix install, and start-up smoke test; the Wrangler pin test; a dry-run
  deploy of the prebundled Worker.
- **Coverage** stays above 90%.

## R20. Out of scope

Per-website signing keys; user accounts and logins; automatic update checks (no telemetry); Windows;
a non-interactive console-free deploy (the approval-gated lane covers automation); Homebrew or a native
app; multi-backend switching; changing what the SDK collects.

## R21. Schema versions and migrations (2026-09-22; ends fresh-install-only)

**Finding.** Until now the schema was one file, `0001_initial.sql`, edited in place, and every release that
touched it required a fresh install (0.5 and 0.6 lines). Wrangler already records applied migrations by name in
a `d1_migrations` table on any database created with `d1 migrations apply`, which is how every supported
install path creates it.

**Decision.** Database changes become numbered, forward-only files in `deploy/cloudflare/migrations/`.
`0001_initial.sql` stays exactly as shipped (it already contains the two action tables from 0.6.0). The next
change is `0002_access_keys.sql`, which creates `access_keys` and also creates the two action tables with
`IF NOT EXISTS`, so a database from 0.5.2 (which lacks them) and one where they were added by hand both end
in the same state as a fresh install. The **applied version** is the highest number in `d1_migrations`,
read by the Worker; the **expected version** is the highest number in the migrations the Worker was built with,
baked in at build time. A database with no `d1_migrations` table reports unknown.

**Rules, enforced by tests.** Within a release line every change is additive: only `CREATE TABLE`, `CREATE
INDEX`, and `ALTER TABLE … ADD COLUMN` (all guarded by `IF NOT EXISTS` where SQLite allows) and `INSERT OR
IGNORE`; anything with `DROP`, `RENAME`, `DELETE`, or `UPDATE` needs an explicit annotation, a line in the
release notes, a shown plan, and a confirmed backup. A test applies the migrations to (a) an empty database
and (b) a fixture of the 0.5.2 schema and asserts identical schemas, and another asserts adoption of a database
with hand-added objects. The oldest supported starting point is the 0.5.2 schema (databases from 0.5.1 or
earlier need a fresh install).

**Why additive.** The Worker is deployed after the database, and a failed Worker step must leave the previous
Worker working against a newer database, so the two never need to change at the same instant.

**Rejected.** A separate `schema_meta` version table (a second source of truth that can disagree with the
recorded migrations); comparing table lists (cannot tell what is missing or in what order); keeping
fresh-install-only (blocks upgrades, which the owner wants removed).

## R22. The update flow

**Decision.** An update is a deployment-engine run (R9) with these steps: prepare tool, check sign-in, read
versions (Worker `GET /v1/admin/backend`), plan, **backup** (`wrangler d1 export --remote` to
`~/.config/vizoalica/backups/<database>-<timestamp>.sql`, mode 0600, path reported), **migrate** (`wrangler d1
migrations apply <database> --remote` with the packaged migrations directory in the rendered configuration),
**deploy Worker** (the prebundled Worker, R8), **verify** (health, both versions now match, administrator
access), **record**. Only what is behind runs: if the schema is current the migrate step is skipped, and if the
Worker is current the deploy step is. Migrations apply one at a time, each in a transaction, and the
`d1_migrations` records make a resumed run skip finished ones. Declining the backup needs an explicit
confirmation and is recorded; a backup that cannot be taken (for example a database too large to export)
stops the flow until the admin chooses. The console never downgrades: a newer Worker or schema than the
package carries is reported and the update is refused. Event collection continues because migrations are
additive and a Worker deploy switches versions atomically; a rehearsal test posts events in a loop during an
update and counts them (SC-013).

**Rejected.** Migrating after the Worker (a new Worker could meet a missing table); a downgrade path
(restoring a backup is the documented rollback); an "update everything" that reruns finished steps.

## R23. Roles and capability classes (2026-09-22)

**Decision.** Three roles named admin, analyst, and website owner; the role is what the backend reports for the
credential (R4). Capability classes become `view` (analytics and configuration reads), `operate` (creating and
managing projects and websites, including enabling, disabling, and deleting them), and `backend` (deploying and
updating the Worker and database, secrets, purging, sample data, and access keys). The existing
`administer` class is renamed `backend`, and `delete-website` and `delete-project` move to `operate`. The
analyst holds `view`; the owner holds `view` and `operate` within scope; the admin holds all three. Connecting
to a backend is not a capability: every role does it on first run with its own credential. New Worker routes:
`GET /v1/admin/backend` (versions and health, readable by every role) beside `whoami`. The MCP adapter and
every backend-level route are admin-only.
