# Data Model: OneCLI Cloudflare Credentials

No analytics or deployed application data changes. All new persisted values are operator-local,
non-secret deployment metadata or audit evidence.

## Deployment Profile

Versioned configuration selecting one Cloudflare authentication provider for one environment.

| Field | Type | Rules and purpose |
| --- | --- | --- |
| `schemaVersion` | integer | Must be `1`; supports future migrations. |
| `provider` | enum | Exactly `onecli` or `cloudflare-native`; never auto-detected. |
| `environment` | string | Stable lowercase environment name such as `staging` or `production`. |
| `wranglerConfigPath` | string | Operator-selected path to the existing Wrangler configuration. |
| `cloudflare.accountId` | string | Expected 32-character account identifier used to prevent cross-account deployment. |
| `onecli` | OneCLI Connection Reference | Required only when `provider` is `onecli`; forbidden for native profiles. |
| `auditRetentionDays` | integer | Defaults to 90; minimum 90. |

**Purpose**: Reproducibly bind deployment intent to a provider, identity, account, and environment.

**Access boundary**: Operator workstation or protected CI configuration. The active file is outside
the repository and written atomically with user-only permissions. A redacted example is committed.

**Retention**: Until the operator removes or replaces the deployment profile.

**Forbidden content**: Cloudflare token/key, OneCLI API key or agent token, authorization header,
Worker application secret, email credential, or copied upstream response.

## OneCLI Connection Reference

Non-secret metadata needed to validate and invoke one deterministic OneCLI identity and connection.

| Field | Type | Rules and purpose |
| --- | --- | --- |
| `project` | string | Exact OneCLI project slug. |
| `agentId` | string | Immutable agent ID used for grant and effective-credential inspection. |
| `agentIdentifier` | string | Exact identifier passed to `onecli run`. |
| `connectionId` | string | Immutable Cloudflare connection ID; labels are not trusted as identity. |

**Relationship**: Belongs to one Deployment Profile. The connection must exist in the project, be
attached to the agent, appear in effective credentials, identify the Cloudflare provider, and be
the only eligible Cloudflare connection for that deployment identity.

## Cloudflare Target

The account and resource scope expected by the deployment.

| Field | Source | Validation |
| --- | --- | --- |
| Account ID | Deployment Profile | Exact match with the authenticated account returned by preflight. |
| Environment | Deployment Profile | Exact match with plan and Wrangler configuration. |
| Worker name | Wrangler configuration | Non-empty and stable for the plan lifetime. |
| D1 database name and ID | Wrangler configuration | Must not contain replacement placeholders; remote lookup must match. |
| R2 bucket name | Wrangler configuration | Remote lookup must resolve in the expected account. |
| Required Worker secret names | Deployment policy | Names may be listed; values are never read. |

## Credential Health Result

An ephemeral, allowlisted assessment produced before plan approval or mutation.

| Field | Type | Description |
| --- | --- | --- |
| `status` | enum | `ready`, `missing_connection`, `denied`, `revoked`, `account_mismatch`, `insufficient_permission`, `provider_unavailable`, `cloudflare_unavailable`, or `ambiguous_connection`. |
| `provider` | enum | Selected profile provider. |
| `accountId` | string or absent | Confirmed non-secret account ID when safely known. |
| `connectionId` | string or absent | Configured non-secret connection ID for OneCLI. |
| `agentId` | string or absent | Configured non-secret acting identity. |
| `capabilities` | array | Allowlisted operation names with `allowed`, `approval_required`, or `denied`. |
| `remediation` | enum or absent | Stable safe action such as `connect`, `attach`, `reauthorize`, `correct_account`, `narrow_ambiguity`, or `retry`. |
| `checkedAt` | UTC timestamp | Time of the assessment. |

Health output never includes raw provider output. `ready` is valid only if identity, connection,
effective access, account, and all preflight probes agree.

## Deployment Plan

Immutable, reviewable description of a proposed operation.

| Field | Type | Description |
| --- | --- | --- |
| `planId` | string | Digest of canonical plan content. |
| `profileDigest` | string | Digest of the validated non-secret profile. |
| `createdAt` | UTC timestamp | Plan creation time. |
| `provider` | enum | Selected provider. |
| `environment` | string | Target environment. |
| `accountId` | string | Expected Cloudflare account. |
| `connectionId` | string or absent | OneCLI connection reference, if selected. |
| `operations` | array | Ordered allowlisted operations, affected resources, mutation flag, and approval class. |
| `wranglerConfigDigest` | string | Detects changes between review and apply. |

The plan contains no free-form command string or environment dump. Operations are built from a
closed catalog so command injection cannot be persisted in a plan.

## Preflight Receipt

Short-lived proof that a specific plan and profile passed validation.

| Field | Type | Description |
| --- | --- | --- |
| `receiptId` | string | Random identifier for audit correlation. |
| `planId` | string | Must exactly match the approved plan. |
| `profileDigest` | string | Must match the current deployment profile. |
| `wranglerConfigDigest` | string | Must match the currently selected configuration. |
| `provider` | enum | Must match the plan and profile. |
| `actorId` | string | Safe local or CI identity label. |
| `accountId` | string | Confirmed account. |
| `connectionId` | string or absent | Confirmed OneCLI connection. |
| `issuedAt` | UTC timestamp | Successful preflight completion time. |
| `expiresAt` | UTC timestamp | Exactly 15 minutes after issue. |

The receipt is written atomically with user-only permissions. It becomes invalid when expired, when
any bound digest differs, or when the provider/connection/account recheck fails.

## Deployment Result

Safe summary of one plan, preflight, apply, or verify command.

| Field | Type | Description |
| --- | --- | --- |
| `ok` | boolean | Whether the command completed its contract. |
| `command` | enum | `configure`, `plan`, `check`, `apply`, `verify`, or `status`. |
| `status` | enum | Stable success, denial, interruption, or failure state. |
| `planId` | string or absent | Reviewed plan correlation. |
| `completedOperations` | array | Allowlisted operation identifiers completed in this invocation. |
| `pendingOperations` | array | Operations not yet completed or requiring review. |
| `error` | object or absent | Stable code, safe message, remediation, and retry-safety flag. |
| `occurredAt` | UTC timestamp | Result time. |

## Deployment Authorization Record

Append-only local NDJSON evidence derived from a Deployment Result.

| Field | Type | Description |
| --- | --- | --- |
| `eventId` | string | Unique event identifier. |
| `occurredAt` | UTC timestamp | Event time. |
| `actorId` | string | Human or automation identity label. |
| `provider` | enum | Selected credential provider. |
| `environment` | string | Deployment environment. |
| `accountId` | string | Expected or confirmed Cloudflare account. |
| `connectionId` | string or absent | Non-secret OneCLI connection reference. |
| `planId` | string or absent | Plan correlation. |
| `action` | enum | `configure`, `plan`, `preflight`, `apply`, `verify`, `deny`, or `interrupt`. |
| `outcome` | enum | `succeeded`, `failed`, `denied`, `interrupted`, or `expired`. |
| `errorCode` | string or absent | Stable safe failure code. |

**Purpose**: Investigate deployment changes, denials, and interrupted retries.

**Access boundary**: Operator-only local state or protected CI artifact; never served to a browser.

**Retention**: 90 days by default; expired records are removed during normal CLI use. Operators may
choose a longer retention period but not a shorter one without a documented policy exception.

## State Transitions

### Provider access

```text
unconfigured → configured → ready
                     │         │
                     ├→ denied ├→ revoked
                     ├→ missing_connection
                     ├→ account_mismatch
                     ├→ insufficient_permission
                     ├→ ambiguous_connection
                     └→ provider_unavailable

Any non-ready state → configured only after operator remediation
```

### Deployment execution

```text
profile_validated → planned → preflight_passed → approved → applying → verified
                        │             │                         │
                        └→ superseded ├→ receipt_expired        ├→ interrupted
                                      └→ access_changed         └→ failed

interrupted/failed → new plan or fresh preflight → approved retry
```

No state transition copies, reveals, or caches a credential. `apply` rechecks access and account
identity immediately before its first mutation.
