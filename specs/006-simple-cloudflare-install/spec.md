# Feature Specification: Simple Cloudflare installation

**Feature Branch**: current operator checkout (preserve existing deployment fixes)
**Created**: 2026-09-09
**Status**: Implemented and locally validated
**Input**: Address all 18 first-run Cloudflare and OneCLI findings; make manual and semi-manual installation simple and inexpensive; deliver patch 0.3.1 through SpecKit.

## User Scenarios & Testing

### User Story 1 - Install without guesswork (Priority: P1)

A site owner follows one ordered guide from an empty account to a working website integration.
**Why this priority**: Missing steps and misleading examples prevented first-run success.
**Independent Test**: Walk through the documented setup and verify a real page view.
**Acceptance Scenarios**:

1. **Given** a fresh checkout, **When** following the guide, **Then** every prerequisite, resource, secret, migration, website asset and token endpoint has an explicit action and expected result.
2. **Given** an existing installation, **When** checking resources, **Then** stale names and identifiers are detected before migration.
3. **Given** a small demo, **When** selecting the default path, **Then** no custom domain or always-on local console is required and usage limits and retention are explained.

### User Story 2 - Use isolated local credentials (Priority: P1)

An operator runs the local console with a vault-held administrator credential independently of the deployment credential choice.
**Why this priority**: Credential roles and proxy behavior caused repeated failures.
**Independent Test**: Verify credential configuration and provider regression tests.
**Acceptance Scenarios**:

1. **Given** local vault use, **When** following the fields, **Then** only requests to the exact Worker receive the administrator credential.
2. **Given** a normal same-origin browser request, **When** opening the console, **Then** it loads while foreign or absent provenance is rejected.
3. **Given** proxy incompatibility or a slow operation, **When** deployment fails, **Then** the guide identifies the cause and explicit supported recovery without silently bypassing credential isolation.

### User Story 3 - Prove installation and recover (Priority: P2)

An operator distinguishes an actual working integration from successful-looking fallback pages.
**Why this priority**: Status-only checks hid missing assets and functions.
**Independent Test**: Verification rejects HTML fallbacks and wrong token scope; generated snippets contain all required configuration.
**Acceptance Scenarios**:

1. **Given** missing paths returning a success status with HTML, **When** verifying, **Then** installation fails verification.
2. **Given** a complete integration, **When** opening a consented test page, **Then** accepted traffic and aggregate counts can be checked.
3. **Given** the incident report, **When** reviewing documentation, **Then** each of its 18 findings has a resolution or clearly documented external limitation.

### Edge Cases

Stale account resources; missing migrations; absent signing secret; source ID differs from public key; wrong website origin; preview versus production; missing consent; HTML fallback; detached vault grant; unreachable Docker gateway; Pages temporary upload credential collision; timeout after remote mutation; sample integration removed.

## Requirements

### Functional Requirements

- **FR-001**: Provide one numbered default installation path and an optional isolated deployment path, with exact permission labels and clearly separate credential roles.
- **FR-002**: Provide a reproducible website asset build and deployable token issuer example, keeping signing credentials server-side and issuing narrowly scoped five-minute tokens.
- **FR-003**: Document all current migrations, live resource checks, website deployment modes, working directory, secret synchronization and retention.
- **FR-004**: Generate complete website snippets with the configured ingestion URL, project, public source key, token endpoint and explicit consent state.
- **FR-005**: Preserve valid same-origin console access and reject foreign or absent provenance; preserve existing fixes and test negative cases.
- **FR-006**: Support non-secret Wrangler initialization in isolated deployments without retaining ambient credentials, and use realistic bounded operation timeouts.
- **FR-007**: Explain host-accessible vault setup and the external Pages upload collision without providing a silent proxy bypass.
- **FR-008**: Verify content type, body and token claims in addition to status; document browser acceptance and aggregate validation separately.
- **FR-009**: Map every reported issue to evidence, update patch version and changelog, and run applicable automated security and regression checks.

### Key Entities

- Installation worksheet: account and resource identifiers, website and Worker origins, project and source identity; no secrets.
- Credential role: deployment authority, Worker administrator, or token signer; distinct storage and access boundaries.
- Verification record: check, expected result, evidence, and unresolved live validation.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All 18 findings have an explicit documented disposition.
- **SC-002**: A new operator can complete the default path without inventing commands or authoring a token issuer.
- **SC-003**: Verification rejects every tested false-success response and scope mismatch.
- **SC-004**: No real credential appears in examples or generated browser assets; automated security regressions pass.

## Assumptions

- Patch scope includes small implementation fixes needed to make documentation true, not a replacement deployment system.
- Use native Cloudflare login for simplest provisioning/Pages deployment and independently offer OneCLI for the local client. Isolated Worker deployment remains optional.
- External sample repository and OneCLI upstream are outside this checkout; ship a self-contained example and document external limitations.
- No live infrastructure mutation or publication is required to improve this repository. Report live validation separately from local evidence.
