# Feature Specification: OneCLI Cloudflare Credentials

**Feature Branch**: `005-onecli-cloudflare-credentials`

**Created**: 2026-09-07

**Status**: Draft

**Input**: User description: "Add native integration with OneCLI to store Cloudflare credentials."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect Cloudflare without exposing a token (Priority: P1)

An operator preparing a Vizoalica deployment can select a OneCLI-managed Cloudflare connection,
confirm the intended Cloudflare account, and run deployment checks without copying a Cloudflare API
token into the repository, Vizoalica configuration, command arguments, logs, or an AI conversation.

**Why this priority**: The primary value is removing durable Cloudflare credentials from the
Vizoalica workspace and from the agent's direct reach while preserving a usable deployment flow.

**Independent Test**: Configure a OneCLI-managed Cloudflare connection for a test account, select
it for a Vizoalica deployment, run the non-mutating preflight, and verify both successful account
identification and the absence of the raw token from Vizoalica-owned files and output.

**Acceptance Scenarios**:

1. **Given** an operator has an authorized OneCLI Cloudflare connection, **When** they select it for
   a Vizoalica deployment and run preflight, **Then** the intended account and required access are
   verified without Vizoalica receiving or displaying the raw Cloudflare token.
2. **Given** no usable OneCLI Cloudflare connection exists, **When** the operator selects OneCLI as
   the credential provider, **Then** the operation stops before any Cloudflare change and gives
   safe, actionable setup guidance.
3. **Given** OneCLI is selected, **When** an unrelated ambient Cloudflare credential is available,
   **Then** Vizoalica does not silently use that credential as a fallback.

---

### User Story 2 - Deploy through a least-privilege connection (Priority: P2)

An operator or authorized deployment agent can review a deployment plan and perform approved
Vizoalica Cloudflare operations through the selected OneCLI connection with access limited to the
needed account, resources, and actions.

**Why this priority**: Secure storage alone is insufficient if the credential remains unnecessarily
broad or if deployment bypasses the existing human approval boundary.

**Independent Test**: Use a connection with only the documented required Cloudflare access, review
and approve a deployment plan, deploy to a test environment, and verify that unrelated or
destructive Cloudflare actions remain unavailable.

**Acceptance Scenarios**:

1. **Given** a valid least-privilege connection and a reviewed deployment plan, **When** the operator
   approves deployment, **Then** the required Vizoalica resources are created or updated and the
   result identifies the target account and environment without revealing credentials.
2. **Given** the connection lacks a required permission, **When** preflight or deployment reaches
   that operation, **Then** the process fails closed, names the missing capability in safe terms,
   and does not request a broader credential than necessary.
3. **Given** a deployment action is destructive or outside the reviewed plan, **When** it is
   requested through the integration, **Then** the action requires a distinct human approval or is
   denied according to the connection's policy.

---

### User Story 3 - Rotate, revoke, and recover access (Priority: P3)

An operator can rotate or revoke the OneCLI-managed Cloudflare connection and understand whether a
Vizoalica environment can still be safely administered, without rewriting project configuration or
exposing old credential values.

**Why this priority**: Credential lifecycle and recovery are mandatory for long-lived production
operation and compromised-machine response.

**Independent Test**: Revoke the selected connection, verify all subsequent Cloudflare operations
are denied, attach a replacement connection for the same target account, and verify preflight
recovers without changing application data or disclosing either token.

**Acceptance Scenarios**:

1. **Given** a selected connection is revoked or detached, **When** any Cloudflare operation is
   attempted, **Then** it fails before mutation and clearly reports that authorization must be
   restored.
2. **Given** an operator replaces a credential within the same selected connection, **When** they
   rerun preflight, **Then** deployment access resumes without changing Vizoalica configuration.
3. **Given** the replacement connection resolves to a different Cloudflare account, **When** the
   operator runs preflight, **Then** the account mismatch is surfaced and deployment remains
   blocked until the target is explicitly changed and reviewed.

### Edge Cases

- OneCLI is not installed, is not authenticated, or cannot reach its service or local gateway.
- The selected connection no longer exists, is detached from the deployment identity, or is denied
  by an organization policy.
- Multiple Cloudflare connections have similar names or point to different accounts.
- A credential is valid but lacks access to one required Worker, database, bucket, secret, or
  account-level operation.
- OneCLI becomes unavailable after preflight but before or during an approved deployment.
- A deployment is retried after an interrupted operation and some resources may already exist.
- A command fails and upstream error text contains request headers or other sensitive material.
- Local interactive use and unattended deployment use different OneCLI identities or projects.
- Existing installations currently rely on Cloudflare's native local authentication and have not
  opted into OneCLI.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Vizoalica MUST allow an operator to select OneCLI as the credential provider for a
  Cloudflare deployment profile.
- **FR-002**: Vizoalica MUST persist only a non-secret reference sufficient to identify the selected
  OneCLI project, deployment identity, and Cloudflare connection; it MUST NOT persist the raw
  Cloudflare API token.
- **FR-003**: Credential entry, encrypted storage, retrieval, and injection MUST remain under
  OneCLI's control and outside Vizoalica-owned configuration, process output, and browser surfaces.
- **FR-004**: The setup flow MUST guide the operator to enter or update the Cloudflare credential in
  a OneCLI-controlled human interface rather than requiring the value in a command argument, prompt
  visible to an AI agent, or repository file.
- **FR-005**: Before any mutation, Vizoalica MUST verify that the selected connection is available,
  authorized for the active deployment identity, and resolves to the operator-confirmed Cloudflare
  account.
- **FR-006**: The integration MUST present the minimum Cloudflare capabilities needed for each
  supported Vizoalica operation and MUST support account- and resource-scoped credentials.
- **FR-007**: Preflight MUST distinguish missing connection, denied grant, expired or revoked
  credential, account mismatch, insufficient permission, OneCLI unavailability, and Cloudflare
  unavailability without revealing sensitive values.
- **FR-008**: Once OneCLI is selected for a deployment profile, every Cloudflare management request
  in that operation MUST use the selected OneCLI connection.
- **FR-009**: When OneCLI authorization or injection fails, Vizoalica MUST fail closed and MUST NOT
  fall back to ambient environment credentials, locally cached Cloudflare credentials, or another
  connection.
- **FR-010**: Deployment MUST preserve the existing reviewable-plan and explicit human-approval
  boundary before creating, updating, migrating, or deleting Cloudflare resources.
- **FR-011**: The same provider selection and permission model MUST support supervised local
  deployment and authorized non-interactive deployment, with each identity receiving only its
  explicitly granted connection.
- **FR-012**: Deployment results and audit evidence MUST record the target environment, Cloudflare
  account identifier, non-secret OneCLI connection reference, acting identity, requested action,
  outcome, and time.
- **FR-013**: Logs, errors, diagnostics, test fixtures, generated plans, and audit records MUST
  redact Cloudflare tokens, OneCLI authentication credentials, authorization headers, and any
  sensitive upstream response material.
- **FR-014**: Operators MUST be able to rotate the Cloudflare token within OneCLI without changing
  the Vizoalica deployment profile when the connection reference and target account remain the
  same.
- **FR-015**: Operators MUST be able to detach or revoke the selected connection, after which new
  Cloudflare operations MUST be denied immediately or at OneCLI's documented revocation boundary.
- **FR-016**: Interrupted or partially completed deployments MUST remain safely retryable and MUST
  report which planned operations are complete, pending, or require review.
- **FR-017**: Existing deployments that have not selected OneCLI MUST continue to use the documented
  Cloudflare-native authentication flow; changing providers MUST be an explicit operator action.
- **FR-018**: The system MUST provide a migration path from Cloudflare-native authentication to a
  OneCLI-managed connection and a documented rollback path that does not copy credentials between
  providers through Vizoalica.
- **FR-019**: The integration MUST not change browser instrumentation, analytics data, accepted
  event history, or the runtime authorization model of a deployed Vizoalica Worker.
- **FR-020**: Automated verification MUST cover successful access, every failure category in
  FR-007, account isolation, least-privilege denial, revocation, rotation, redaction, no-fallback
  behavior, interruption recovery, and both interactive and non-interactive identities.

### Key Entities

- **Credential Provider Selection**: The operator's explicit choice of how a deployment profile
  obtains Cloudflare authorization, including its target environment and non-secret provider
  metadata.
- **OneCLI Cloudflare Connection Reference**: An opaque, non-secret identifier for a Cloudflare
  connection managed by OneCLI, associated with a OneCLI project and one or more authorized
  deployment identities.
- **Deployment Identity**: The human or automation identity requesting use of the connection, with
  explicit grants and applicable policy decisions.
- **Cloudflare Target**: The expected Cloudflare account and Vizoalica environment against which
  preflight and approved operations are evaluated.
- **Credential Health Result**: A safe, non-secret assessment of connection availability, account
  match, authorization, required capabilities, and remediation status.
- **Deployment Authorization Record**: Audit evidence linking an approved plan and outcome to its
  target, connection reference, actor, and time without containing secrets.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 90% of operators with an existing authorized OneCLI Cloudflare connection can
  select it and complete a successful deployment preflight in under five minutes on their first
  attempt.
- **SC-002**: Across all automated security and integration tests, zero raw Cloudflare or OneCLI
  credential values appear in Vizoalica-owned files, logs, errors, plans, browser output, or audit
  records.
- **SC-003**: 100% of tested missing, revoked, detached, under-privileged, mismatched-account, and
  unavailable-provider conditions stop before an unapproved Cloudflare mutation.
- **SC-004**: A credential rotation that preserves the connection reference and target account
  requires zero changes to the Vizoalica deployment profile and passes the next preflight.
- **SC-005**: Revoked deployment identities lose the ability to initiate new Cloudflare operations
  within OneCLI's documented revocation window in 100% of verification attempts.
- **SC-006**: Every supported Cloudflare operation has a documented minimum-access profile, and a
  test credential limited to that profile completes the intended operation while unrelated
  operations remain denied.
- **SC-007**: 100% of completed and failed deployment attempts produce audit evidence sufficient to
  identify the actor, target, connection reference, approved action, outcome, and time without
  exposing a credential.
- **SC-008**: Existing Cloudflare-native deployments continue to pass their current preflight and
  deployment verification until an operator explicitly changes their credential provider.

## Assumptions

- "OneCLI" refers to the OneCLI gateway and secret-management product documented at `onecli.sh`,
  including its Cloudflare connection and per-agent grant model.
- This feature manages the Cloudflare API token used to administer Cloudflare resources. Vizoalica
  application secrets stored inside the deployed Worker remain governed by their existing
  lifecycle unless a later feature explicitly moves those values into OneCLI.
- OneCLI may be hosted or self-hosted as long as it provides equivalent connection, grant,
  injection, revocation, and audit behavior.
- Operators create or update raw Cloudflare credentials through OneCLI-controlled surfaces;
  Vizoalica consumes only connection references and authorization outcomes.
- OneCLI is an opt-in provider for this feature. Cloudflare-native authentication remains available
  for existing users, but provider selection is explicit per deployment profile.
- Cloudflare account identifiers, resource names, environment names, and OneCLI connection
  identifiers are treated as operational metadata rather than secret values, while still being
  excluded from public browser output.
- Cloudflare API tokens are scoped as narrowly as the selected deployment workflow permits, and
  destructive operations retain separate approval controls.
