# Research: OneCLI Cloudflare Credentials

## Decision: Wrap Wrangler with OneCLI rather than retrieving credentials

**Decision**: Run all Cloudflare management commands for a OneCLI profile as child commands of
`onecli run --project <project> --agent <agent> -- ...`. Vizoalica will never call a OneCLI secret
read operation, request an exported token, or set `CLOUDFLARE_API_TOKEN` itself.

**Rationale**: OneCLI documents gateway-side encrypted storage and bearer-token injection for
Cloudflare, specifically including Wrangler deployments. Its CLI configures proxy and certificate
trust for child processes, so the existing Wrangler surface remains usable while the agent and
Vizoalica process never receive the raw token. See the [OneCLI Cloudflare integration](https://onecli.sh/docs/integrations/cloudflare)
and [OneCLI CLI](https://github.com/onecli/onecli-cli).

**Alternatives considered**:

- Read the token from OneCLI and export it for Wrangler: rejected because it defeats the central
  non-disclosure requirement.
- Replace Wrangler with direct Cloudflare API calls: rejected because it duplicates mature
  deployment behavior and increases maintenance and permission risk.
- Use only a generic local secret file: rejected because it offers no gateway policy, grant, or
  agent isolation.

## Decision: Add a typed deployment CLI with provider adapters

**Decision**: Add `apps/deploy-cli` and define a narrow provider contract for metadata validation
and command execution. Implement `onecli` and `cloudflare-native` adapters. Retain the existing
top-level shell scripts as compatibility wrappers.

**Rationale**: The current shell scripts are appropriate for a single implicit authentication
source, but secure provider selection requires structured configuration, strict environment
sanitization, output redaction, stable error codes, plan/receipt validation, and extensive unit
tests. A typed CLI gives those concerns one owner without changing Worker runtime code.

**Alternatives considered**:

- Add conditional branches directly to every shell script: rejected because secret-handling and
  error mapping would be duplicated and difficult to test comprehensively.
- Add OneCLI logic to the local analytics API: rejected because deployment credentials do not
  belong in a browser-adjacent operations service.
- Add a OneCLI SDK dependency: rejected for the first slice because the installed CLI already
  exposes stable JSON commands and the gateway execution boundary required by the feature.

## Decision: Store only a versioned, non-secret deployment profile

**Decision**: Use a JSON profile containing schema version, provider, environment, Wrangler config
path, expected Cloudflare account ID, and—only for OneCLI—the project slug, agent identifier, and
connection ID. Store the operator's active profile outside the repository with user-only
permissions; commit only an example.

**Rationale**: Explicit metadata makes account and identity selection reproducible while keeping
credentials out of the repository. A schema version enables migration. JSON integrates with the
existing validation stack and supports both interactive and CI use.

**Alternatives considered**:

- Extend `wrangler.toml` with OneCLI fields: rejected because they are not Wrangler configuration
  and could break validation.
- Use environment variables as the only provider configuration: rejected because implicit ambient
  state makes account mismatches and audit reconstruction more likely.
- Commit production connection references: rejected because they reveal unnecessary operational
  topology and would couple a public repository to one operator's OneCLI organization.

## Decision: Require deterministic connection and effective-access validation

**Decision**: Preflight will confirm that the configured connection exists, is a Cloudflare
connection, is attached to the configured deployment agent, and is present in that agent's
effective credentials. It will reject an absent, denied, mismatched, or ambiguous connection before
running Wrangler. The target Cloudflare account returned during preflight must exactly match the
profile.

**Rationale**: OneCLI distinguishes attached grants (intent) from effective credentials after
organization policy. Its current grant model publishes changes immediately, and `agents
credentials` is the authoritative read-only reflection. Checking both explains failures while
trusting the effective view for authorization. See the [OneCLI CLI grant model](https://github.com/onecli/onecli-cli#grants-the-attach-model).

**Alternatives considered**:

- Trust the connection label: rejected because labels are mutable and may collide.
- Check only attached grants: rejected because organization policy can still block or require
  approval.
- Let the gateway select among multiple eligible Cloudflare connections: rejected because the
  target credential would be ambiguous.

## Decision: Remove ambient Cloudflare authentication in OneCLI mode

**Decision**: Construct an allowlisted child environment for OneCLI execution. Remove all known
Cloudflare token, global-key, email, and cached-auth override variables, then set the expected
non-secret account ID from the profile. Do not invoke Cloudflare-native authentication fallback if
OneCLI fails.

**Rationale**: Wrangler supports ambient `CLOUDFLARE_API_TOKEN` and related authentication state.
Without explicit sanitization, a missing OneCLI grant could accidentally deploy with a developer's
local credential. Cloudflare documents the environment-based token path for automation in its
[Wrangler system environment variables](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/).

**Alternatives considered**:

- Inherit the full parent environment: rejected because it violates deterministic provider
  selection and no-fallback behavior.
- Clear every environment variable: rejected because the process still needs basic executable,
  certificate, locale, temporary-directory, and OneCLI authentication context.
- Retry natively after a OneCLI error: rejected because it could mutate the wrong account under an
  unintended identity.

## Decision: Use account-scoped API tokens and an operation permission matrix

**Decision**: Recommend a Cloudflare account-owned token for durable CI identities when all required
endpoints support it, and a scoped user token for supervised personal use when appropriate. In both
cases, scope the token to the single target account and only the permission groups required by the
Vizoalica operations matrix. Preflight tests the actual operations rather than assuming a template
is sufficient.

**Rationale**: Cloudflare recommends API tokens over global keys, supports resource and permission
scoping, and documents account-owned tokens as durable service principals suitable for CI/CD. The
exact permission catalog is changeable, so implementation documentation must derive and verify the
current minimal set. See [Create API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/),
[API token permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/),
and [Account API tokens](https://developers.cloudflare.com/fundamentals/api/get-started/account-owned-tokens/).

**Alternatives considered**:

- Use a Global API Key: rejected because it is broadly privileged and cannot meet least privilege.
- Require one all-account token: rejected because Vizoalica deployments are account-specific.
- Hard-code permission IDs in the profile: rejected because IDs and endpoint compatibility should
  be resolved and documented from current provider data rather than copied into operator state.

## Decision: Bind mutation to a short-lived preflight receipt

**Decision**: `plan` produces an allowlisted JSON plan and digest. `preflight` validates provider,
identity, connection, effective access, account, target resources, Worker secrets, migrations, and
Wrangler dry-run, then issues a user-only receipt bound to the plan digest, profile digest, actor,
account, connection, and a 15-minute expiry. `apply` requires the plan ID as explicit approval and
revalidates the receipt before mutation.

**Rationale**: This preserves a reviewable separation between inspection and mutation, prevents a
stale or different profile from being applied, and supports both supervised execution and protected
CI approval. The receipt contains no credential and can be invalidated without provider access.

**Alternatives considered**:

- Treat any `deploy:apply` invocation as sufficient approval: rejected because an agent could
  unknowingly apply a changed plan.
- Persist reusable approval indefinitely: rejected because permissions, connection state, and
  resource configuration can change.
- Re-run all preflight operations inside `apply` with no receipt: rejected because the operator
  would have no stable artifact proving what was reviewed.

## Decision: Persist safe local deployment audit evidence for 90 days

**Decision**: Append one allowlisted NDJSON record for plan, preflight, apply, verify, and denial
outcomes to an operator-only local state file. Default retention is 90 days, configurable upward by
the operator. Redaction occurs before terminal output and before persistence.

**Rationale**: The constitution requires safe auditability and the feature requires actor, target,
connection, action, outcome, and time. Local storage preserves the no-hosted-control-plane model.
Ninety days is a practical operational default without indefinite metadata retention.

**Alternatives considered**:

- Store no audit record: rejected because failed and interrupted changes would be hard to
  reconstruct.
- Send audit data to a hosted Vizoalica service: rejected because it adds infrastructure and a new
  privacy boundary.
- Store raw child output: rejected because upstream errors may contain sensitive headers or
  irrelevant account metadata.

## Decision: Keep Vizoalica Worker secrets out of this integration

**Decision**: The OneCLI Cloudflare connection stores only the Cloudflare management API token.
`VIZOALICA_TOKEN_SECRET` and `VIZOALICA_ADMIN_SECRET` continue to be entered through Wrangler's
interactive secret operation and stored by Cloudflare. The deployment plan may verify their names
exist but never read or record their values.

**Rationale**: Application runtime secrets and Cloudflare management authentication have different
lifecycles and trust boundaries. Moving both at once would broaden scope and could require secret
material to transit Vizoalica.

**Alternatives considered**:

- Store all Worker secret values as generic OneCLI secrets: deferred because it requires a separate
  rotation and dual-provider threat model.
- Include Worker secrets in the deployment profile: rejected because the profile must remain
  non-secret.

## Decision: Preserve native authentication as an explicit provider

**Decision**: Profiles declare either `onecli` or `cloudflare-native`. An absent new-style profile
continues to use the legacy native flow with a migration guide. Provider changes require an
explicit configuration action; rollback means selecting the native provider, not copying a token
through Vizoalica.

**Rationale**: This prevents a forced dependency, satisfies portable interoperability, and avoids
breaking existing deployments while keeping OneCLI mode deterministic.

**Alternatives considered**:

- Make OneCLI mandatory immediately: rejected because it would break existing self-hosted
  deployments and introduce vendor lock-in.
- Auto-detect OneCLI and switch providers: rejected because silent provider changes violate the
  operator approval boundary.
