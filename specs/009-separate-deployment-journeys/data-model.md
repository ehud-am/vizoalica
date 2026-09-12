# Data Model: Separate Deployment Journeys

## Customer Installation

Represents one fresh, customer-owned Vizoalica environment.

**Fields**:

- Customer/environment label
- Selected release and commit
- Cloud account identity
- Worker name and verified HTTPS origin
- D1 database name and identifier
- R2 bucket name
- Secret-name presence (never values)
- Retention and quota configuration
- Freshness state
- Verification state and timestamp

**Validation rules**:

- The cloud account and all resource identities must match the reviewed target.
- Freshness must be `empty` before initialization; `existing` or `ambiguous` blocks setup.
- Secret values cannot appear in stored handoffs or completion evidence.

**State transitions**:

`unselected → planned → preflight-passed → approved → initialized → verified`

Any identity mismatch or prior schema moves the attempt to `blocked`; an interrupted mutation moves
it to `review-required` until remote state is inspected and a fresh plan is produced.

## Fresh Schema Baseline

Represents the complete D1 schema for a new installation of this release.

**Fields**:

- Baseline identifier (`0001_initial`)
- Required application tables and indexes
- Migration tracking expectation
- Applicable release
- Future migration predecessor marker

**Validation rules**:

- Applies successfully to an empty database in one transaction-controlled migration step.
- Produces every table, column, constraint, and index required by current code.
- Contains no data-copy, backfill, rename-from-prior-schema, or destructive upgrade operation.

## Operator Workstation

Represents one operator or analyst's local access environment.

**Fields**:

- Operator identity/owner
- Customer backend origin
- Credential path (`direct` or `onecli`)
- Private configuration location
- Loopback console origin
- OneCLI project, agent, and gateway coordinates when applicable
- Verification and revocation state

**Validation rules**:

- Exactly one credential path is active at a time.
- Direct configuration is private to its owner; OneCLI configuration stores only a placeholder.
- Both local services remain loopback-only.
- Browser-visible state never contains the remote administrator credential.

**State transitions**:

`unconfigured → configured → verified → active → stopped → revoked/removed`

## Website Integration

Represents one website registered for collection.

**Fields**:

- Customer project identifier
- Internal source identifier
- Public source key
- Website display name and exact allowed origins
- Worker event endpoint
- SDK location
- Token issuer location and scope
- Hosting/deployment mode
- Consent activation rule
- Quota and retention policy
- Content, token, real-event, and failure-isolation verification states

**Validation rules**:

- Website identifiers cannot be silently reused for a different website.
- Public values and secret values are explicitly distinguished.
- The signing secret exists only on trusted server components.
- Production and preview origins are not interchangeable.
- Completion requires both objective content checks and a real accepted event.

**State transitions**:

`unregistered → registered → configured → deployed → content-verified → event-verified → collecting`

An unavailable analytics service must not move the host website into a failed state.

## Setup Handoff

Represents redacted outputs passed between stories.

**Relationships**:

- One customer installation produces a backend handoff for many operator workstations.
- One verified operator can create many website integrations.
- Each website integration produces its own website completion record.

**Required properties**:

- Story and target identity
- Release identity
- Verified public/non-secret coordinates
- Names of required secrets and where the recipient obtains them, never their values
- Completed and outstanding human checks

## Completion Record

Represents evidence for one story execution.

**Fields**:

- Story ID (`US1`, `US2A`, `US2B`, or `US3`)
- Customer/operator/website target label
- Release identity
- Checkpoint outcomes
- Timestamp
- Redacted failure/recovery notes

**Validation rules**:

- Records must be safe to share with maintainers after customer-specific identifiers are redacted.
- A downstream story may rely only on explicitly marked verified outputs.
