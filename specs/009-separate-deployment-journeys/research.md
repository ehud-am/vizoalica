# Research: Separate Deployment Journeys

## Decision 1: Use four primary journey owners

**Decision**: Assign one operations document to each requested story: `cloudflare.md` for US1,
`local-analytics.md` for US2A, `ops-cli.md` for US2B, and `pages.md` for US3. Duplicate short
required context when necessary and reserve cross-links for optional background.

**Rationale**: The current installation guide interleaves backend, workstation, and website work,
which obscures who repeats which steps. Stable owners make clean-room testing and future updates
more reliable.

**Alternatives considered**: One long end-to-end guide was rejected because operators and website
owners would repeatedly traverse unrelated setup. A new directory with four new documents was
rejected because the current filenames already have strong inbound links and useful history.

## Decision 2: Consolidate to one fresh D1 baseline

**Decision**: Replace the five historical migrations with one current `0001_initial.sql` that
creates the final schema directly. Do not include upgrade transformations, backfills, or rollback
instructions.

**Rationale**: This release has no installed customer data to preserve. A single baseline is
easier to audit, apply, explain, and verify, while establishing the predecessor for future forward
migrations.

**Alternatives considered**: Keeping five files and merely calling them a baseline was rejected
because it preserves unnecessary historical reasoning and upgrade-only SQL. A non-Wrangler schema
bootstrap was rejected because it would create a second initialization mechanism.

## Decision 3: Fail closed when any Vizoalica schema state exists

**Decision**: Add a read-only preflight that checks the selected remote database for known
Vizoalica tables and the D1 migration table. Reject the target if any are present and repeat the
check immediately before apply.

**Rationale**: Cloudflare documents that applied migrations are recorded in a migration table and
that Wrangler applies files from the configured migration directory. A renamed baseline could
otherwise be applied to an existing database and falsely imply upgrade support. The guard protects
data without deleting or interpreting it.

**Alternatives considered**: Relying on `CREATE TABLE IF NOT EXISTS` was rejected because partial
success could hide incompatible schemas. Automatically deleting the database was rejected as
destructive. Checking only the migration table was rejected because manually initialized or
partially initialized databases may not contain it.

## Decision 4: Preserve the three credential lanes

**Decision**: Keep backend deployment credentials, the Worker administrator credential, and the
website signing/deployment credentials separate. Retain direct local and OneCLI workstation paths
as alternatives, and retain native Wrangler/Git deployment for Pages Functions.

**Rationale**: The lanes have different powers and lifecycles. Cloudflare's current Pages guidance
states that dashboard drag-and-drop does not compile a Functions directory, while Wrangler and Git
deployment do. Existing OneCLI limitations also make automatic provider fallback unsafe.

**Alternatives considered**: One credential/setup wizard for every lane was rejected because it
would blur permissions. OneCLI-wrapped Pages upload was rejected because the repository documents
an unresolved upload-token replacement issue.

## Decision 5: Automate evidence, not authority

**Decision**: Reuse and extend commands to gather non-secret inputs, validate targets, inspect
freshness, preview mutations, run objective verification, and emit redacted handoffs. Keep human
approval for secrets, target selection, cloud mutations, consent behavior, browser event proof,
and release decisions.

**Rationale**: This removes repetitive error-prone work while respecting the constitution's
authorization boundary and the deployment skill's exact-plan approval requirement.

**Alternatives considered**: Fully automatic resource creation was rejected because it can create
cost and target-account mistakes. Purely manual setup was rejected because current code already
offers safe, testable preflight and verification primitives.

## Sources

- Cloudflare D1 migrations: <https://developers.cloudflare.com/d1/reference/migrations/>
- Cloudflare Pages Direct Upload: <https://developers.cloudflare.com/pages/get-started/direct-upload/>
- Cloudflare Pages Functions setup: <https://developers.cloudflare.com/pages/functions/get-started/>
